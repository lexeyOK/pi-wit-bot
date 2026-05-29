import { logger } from "./logger.js"

export interface PendingMessage {
  chatId: number
  userId: number
  text: string
  username: string | null
  repliedTo: number | null
}

export type FlushHandler = (chatId: number, messages: PendingMessage[]) => Promise<void>

let pending = new Map<number, PendingMessage[]>()
let timer: NodeJS.Timeout | null = null
let handler: FlushHandler

export function initAccumulator(
  intervalMs: number,
  flushHandler: FlushHandler,
): void {
  handler = flushHandler
  if (timer) clearInterval(timer)
  timer = setInterval(flush, intervalMs)
  timer.unref()
}

export function addMessage(msg: {
  chatId: number
  userId: number
  text: string
  username: string | null
  repliedTo: number | null
}): void {
  const arr = pending.get(msg.chatId) ?? []
  arr.push(msg)
  pending.set(msg.chatId, arr)
}

export function hasPending(): boolean {
  return pending.size > 0
}

async function flush(): Promise<void> {
  if (pending.size === 0) return

  const snapshot = pending
  pending = new Map()

  for (const [chatId, messages] of snapshot) {
    logger.info({ chatId, count: messages.length }, "flushing accumulated messages")
    try {
      await handler(chatId, messages)
    } catch (err) {
      logger.error({ err, chatId }, "flush handler failed")
    }
  }
}

export function stopAccumulator(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
