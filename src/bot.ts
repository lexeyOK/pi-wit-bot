import TelegramBot from "node-telegram-bot-api"
import { SocksProxyAgent } from "socks-proxy-agent"
import { createAgent, promptAgent } from "./agent/bridge.js"
import { buildSystemPrompt } from "./agent/context-builder.js"
import { config } from "./config.js"
import { splitMessage } from "./formatter.js"
import { responseGate } from "./gate/index.js"
import { logger } from "./logger.js"
import { readGroupMemory } from "./memory/group-memory.js"
import { type MemoryDoc, queryMemories } from "./memory/rag.js"
import { readSoul } from "./memory/soul.js"
import { getRecentMessages, insertMessage, upsertUser } from "./memory/store.js"
import { readUserProfiles } from "./memory/user-profiles.js"
import { readWorkingMemory } from "./memory/working-memory.js"
import { initAccumulator, addMessage } from "./accumulator.js"

export interface TelegramMessage {
  message_id: number
  chat: { id: number }
  from?: { id: number; username?: string; first_name?: string }
  text?: string
  reply_to_message?: {
    from?: { id: number }
  }
}

export async function createBot(): Promise<TelegramBot> {
  const botOptions: ConstructorParameters<typeof TelegramBot>[1] = { polling: true }
  if (config.TELEGRAM_PROXY_URL) {
    botOptions.request = { agent: new SocksProxyAgent(config.TELEGRAM_PROXY_URL) } as never
  }
  const bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, botOptions)
  const me = await bot.getMe()
  const botId = me.id

  createAgent(logger)

  logger.info({ botId, username: me.username }, "telegram bot started")

  bot.on("message", async (msg) => {
    const chatId = msg.chat.id
    const userId = msg.from?.id
    const text = msg.text ?? ""

    if (!userId || !text) return

    // store message and user
    insertMessage(
      msg.message_id,
      chatId,
      userId,
      text,
      msg.from?.username ?? null,
      msg.reply_to_message?.from?.id ?? null,
    )
    upsertUser(userId, msg.from?.username ?? null, msg.from?.first_name ?? null, null)

    logger.info({ chatId, userId, text }, "message received")

    // skip gate in private chats (positive chatId)
    const isPrivate = chatId > 0
    if (!isPrivate) {
      const soul = await readSoul()
      const gate = await responseGate(msg, botId, soul)
      if (!gate.passed) {
        logger.debug({ chatId, stage: gate.stage }, "gate rejected")
        return
      }
      logger.info({ chatId, stage: gate.stage }, "gate passed, queuing message")
    }

    // queue message for batched processing
    addMessage({
      chatId,
      userId,
      text,
      username: msg.from?.username ?? null,
      repliedTo: msg.reply_to_message?.from?.id ?? null,
    })
  })

  // periodically flush accumulated messages
  initAccumulator(config.BATCH_INTERVAL_SECONDS * 1000, async (chatId, messages) => {
    const soul = await readSoul()

    // build context
    const recentRows = getRecentMessages(chatId, 20)
    const recentMessages = recentRows
      .map((m) => {
        const sender = m.isBot ? "bot" : `@${m.username ?? `user_${m.userId}`} (id:${m.userId})`
        const date = m.createdAt.slice(5, 19).replace("T", " ")
        const reply = m.repliedTo ? ` → replying to user_${m.repliedTo}` : ""
        return `[${date}] ${sender}${reply}: ${m.text ?? ""}`
      })
      .join("\n")

    const latestText = messages.at(-1)?.text ?? ""
    const latestUserId = messages.at(-1)?.userId ?? 0

    const [userProfiles, groupMemory, workingMemory, memoryDocs] = await Promise.all([
      readUserProfiles(),
      readGroupMemory(),
      readWorkingMemory(),
      queryMemories(latestText, latestUserId, 5).catch((err) => {
        logger.warn({ err }, "RAG query failed, continuing without memories")
        return [] as MemoryDoc[]
      }),
    ])

    const memories = memoryDocs.map((d) => `[${d.memoryType}] ${d.content}`).join("\n")

    const systemPrompt = await buildSystemPrompt({
      soul,
      userProfiles,
      groupMemory,
      workingMemory,
      recentMessages,
      memories,
    })

    // format accumulated user messages
    const userMessages = messages
      .map((m) => {
        const sender = m.username ? `@${m.username} (id:${m.userId})` : `user_${m.userId}`
        const reply = m.repliedTo ? ` → replying to user_${m.repliedTo}` : ""
        return `${sender}${reply}: ${m.text}`
      })
      .join("\n")

    // prompt agent with the batch
    const response = await promptAgent(systemPrompt, userMessages, logger)
    if (!response.text) {
      logger.warn({ chatId }, "empty agent response for batch")
      return
    }

    // send response (not as a reply)
    const parts = splitMessage(response.text)
    for (const part of parts) {
      const sent = await bot.sendMessage(chatId, part)
      insertMessage(sent.message_id, chatId, botId, part, me.username ?? null, null, true)
    }

    logger.info({ chatId, parts: parts.length }, "batched response sent")
  })

  bot.on("polling_error", (err) => {
    logger.error({ err }, "telegram polling error")
  })

  return bot
}
