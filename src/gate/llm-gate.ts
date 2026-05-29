import { completeSimple } from "@earendil-works/pi-ai"
import type { Model } from "@earendil-works/pi-ai"
import type { TelegramMessage } from "../bot.js"
import { config } from "../config.js"
import { logger } from "../logger.js"

export interface LlmGateResult {
  passed: boolean
}

let model: Model<"openai-completions">

function getModel(): Model<"openai-completions"> {
  if (model) return model
  model = {
    id: config.OPENROUTER_MODEL,
    name: config.OPENROUTER_MODEL,
    api: "openai-completions",
    provider: "openrouter",
    baseUrl: "https://api.kodikrouter.ru/v1",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 16,
    headers: {
      "HTTP-Referer": "https://github.com/pi-wit-bot",
      "X-Title": "pi-wit-bot",
    },
  }
  return model
}

export async function llmGate(msg: TelegramMessage, soul: string): Promise<LlmGateResult> {
  const text = msg.text ?? ""

  try {
    const response = await completeSimple(
      getModel(),
      {
        systemPrompt: [
          "You are a gate classifier for a group chat. Decide if the character would naturally respond.",
          "",
          "--- CHARACTER ---",
          soul,
          "--- END CHARACTER ---",
          "",
          "Respond with exactly YES or NO.",
          "YES = the character would naturally say something in response",
          "NO = the message doesn't need or warrant a response",
        ].join("\n"),
        messages: [
          {
            role: "user",
            content: [{ type: "text", text }],
            timestamp: Date.now(),
          },
        ],
      },
      {
        apiKey: config.OPENROUTER_API_KEY,
        maxTokens: 16,
        signal: AbortSignal.timeout(10_000),
      },
    )

    const answer = response.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text.trim().toUpperCase())
      .join("")

    const passed = answer.startsWith("YES")

    logger.debug({ chatId: msg.chat.id, text, answer, passed }, "llm gate result")

    return { passed }
  } catch (err) {
    logger.warn({ err, chatId: msg.chat.id }, "llm gate failed, defaulting to no response")
    return { passed: false }
  }
}
