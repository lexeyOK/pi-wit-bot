import { completeSimple } from "@earendil-works/pi-ai"
import type { Model } from "@earendil-works/pi-ai"
import { config } from "../config.js"
import { logger } from "../logger.js"
import { readGroupMemory } from "../memory/group-memory.js"
import { readSoul, writeSoul } from "../memory/soul.js"
import { readUserProfiles } from "../memory/user-profiles.js"
import { readWorkingMemory, writeWorkingMemory } from "../memory/working-memory.js"

const MAX_SOUL_BYTES = 3125

function getModel(): Model<"openai-completions"> {
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
    maxTokens: 2_048,
    headers: {
      "HTTP-Referer": "https://github.com/pi-wit-bot",
      "X-Title": "pi-wit-bot",
    },
  }
}

export async function reflectAndUpdateSoul(): Promise<void> {
  const [currentSoul, workingMem, groupMem, userProfiles] = await Promise.all([
    readSoul(),
    readWorkingMemory(),
    readGroupMemory(),
    readUserProfiles(),
  ])

  if (!currentSoul) {
    logger.warn("no SOUL.md to reflect on")
    return
  }

  const contextPieces = [
    workingMem && `## Recent working memory\n${workingMem}`,
    groupMem && `## Group memory\n${groupMem}`,
    userProfiles && `## User profiles\n${userProfiles}`,
  ]
    .filter(Boolean)
    .join("\n\n")

  try {
    const response = await completeSimple(
      getModel(),
      {
        systemPrompt: [
          "You are a soul evolution engine for a chat bot. Your task:",
          "1. Review the current SOUL (character definition) below.",
          "2. Review recent context (working memory, group memory, user profiles).",
          "3. Decide if the SOUL should evolve based on recent interactions.",
          `4. If YES, write a new SOUL.md within ${MAX_SOUL_BYTES} bytes. Keep the character's voice consistent.`,
          "5. If NO, respond with exactly 'NO_CHANGE'.",
          "",
          "Current SOUL.md:",
          currentSoul,
        ].join("\n"),
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: contextPieces || "No recent context to review." }],
            timestamp: Date.now(),
          },
        ],
      },
      {
        apiKey: config.OPENROUTER_API_KEY,
        maxTokens: 2048,
        signal: AbortSignal.timeout(30_000),
      },
    )

    const text = response.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text.trim())
      .join("")

    if (!text || text === "NO_CHANGE") {
      logger.debug("soul reflection: no change needed")
      return
    }

    const trimmed = text.slice(0, MAX_SOUL_BYTES)
    await writeSoul(trimmed)

    const workingNote = `[${new Date().toISOString()}] soul updated via reflection`
    const updatedWorking = workingMem ? `${workingMem}\n${workingNote}` : workingNote
    await writeWorkingMemory(updatedWorking)

    logger.info({ newLength: trimmed.length }, "soul updated via reflection")
  } catch (err) {
    logger.warn({ err }, "soul reflection LLM call failed")
  }
}
