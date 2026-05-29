import { Agent } from "@earendil-works/pi-agent-core"
import type { AssistantMessage, Model } from "@earendil-works/pi-ai"
import type { Logger } from "pino"
import { config } from "../config.js"
import { customTools } from "./tools.js"

let agent: Agent
let serialQueue = Promise.resolve()

async function serial<T>(fn: () => Promise<T>): Promise<T> {
  const prev = serialQueue
  let release: () => void
  serialQueue = new Promise<void>(r => { release = r })
  await prev
  try {
    return await fn()
  } finally {
    release!()
  }
}

export interface AgentResponse {
  text: string
  usage?: { input: number; output: number; total: number }
}

function createModel(): Model<"openai-completions"> {
  return {
    id: config.OPENROUTER_MODEL,
    name: config.OPENROUTER_MODEL,
    api: "openai-completions",
    provider: "openrouter",
    baseUrl: "https://api.kodikrouter.ru/v1",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 4_096,
    headers: {
      "HTTP-Referer": "https://github.com/pi-wit-bot",
      "X-Title": "pi-wit-bot",
    },
  }
}

export function createAgent(logger: Logger): Agent {
  const model = createModel()

  agent = new Agent({
    initialState: {
      model,
      systemPrompt: "",
      tools: customTools,
      thinkingLevel: "off",
    },
    getApiKey: (provider: string) => {
      if (provider === "openrouter") return config.OPENROUTER_API_KEY
      return undefined
    },
  })

  agent.subscribe((event) => {
    if (event.type === "turn_end") {
      const msg = event.message
      if (msg.role !== "assistant") return
      const text = msg.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("")
      logger.debug({ textLength: text.length }, "turn complete")
    }
  })

  logger.info({ model: config.OPENROUTER_MODEL }, "agent created")
  return agent
}

export async function promptAgent(
  systemPrompt: string,
  userMessage: string,
  logger: Logger,
): Promise<AgentResponse> {
  return serial(async () => {
    agent.state.messages = []
    agent.state.systemPrompt = systemPrompt
    agent.state.tools = customTools

    await agent.prompt(userMessage)

    const lastAssistant = [...agent.state.messages]
      .reverse()
      .find((m): m is AssistantMessage => m.role === "assistant")

    if (!lastAssistant) {
      return { text: "" }
    }

    const text = lastAssistant.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("")

    if (agent.state.errorMessage) {
      logger.error({ error: agent.state.errorMessage }, "agent error")
    }

    return {
      text,
      usage: lastAssistant.usage
        ? {
            input: lastAssistant.usage.input,
            output: lastAssistant.usage.output,
            total: lastAssistant.usage.totalTokens,
          }
        : undefined,
    }
  })
}
