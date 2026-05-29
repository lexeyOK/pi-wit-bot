import { completeSimple } from "@earendil-works/pi-ai"
import type { Model } from "@earendil-works/pi-ai"
import { config } from "../config.js"
import { logger } from "../logger.js"
import { getUnconsolidatedEntries, insertDiaryEntry, markConsolidated } from "../memory/diary.js"
import { readWorkingMemory, writeWorkingMemory } from "../memory/working-memory.js"

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
    maxTokens: 1_024,
    headers: {
      "HTTP-Referer": "https://github.com/pi-wit-bot",
      "X-Title": "pi-wit-bot",
    },
  }
}

function groupByUser(
  entries: {
    id: number
    userId: number
    content: string
    emotion: string | null
    createdAt: string
  }[],
): Map<number, typeof entries> {
  const groups = new Map<number, typeof entries>()
  for (const e of entries) {
    const g = groups.get(e.userId) ?? []
    g.push(e)
    groups.set(e.userId, g)
  }
  return groups
}

const MERGE_THRESHOLD = 2

export async function consolidateDiary(): Promise<void> {
  const entries = getUnconsolidatedEntries(50)
  if (entries.length === 0) {
    logger.debug("no diary entries to consolidate")
    return
  }

  logger.info({ count: entries.length }, "consolidating diary entries")

  const groups = groupByUser(entries)
  const allConsolidated: number[] = []

  for (const [userId, userEntries] of groups) {
    if (userEntries.length < MERGE_THRESHOLD) {
      allConsolidated.push(...userEntries.map((e) => e.id))
      continue
    }

    const diaryText = userEntries
      .map((e) => `[${e.createdAt}]${e.emotion ? ` (${e.emotion})` : ""} ${e.content}`)
      .join("\n")

    try {
      const response = await completeSimple(
        getModel(),
        {
          systemPrompt: [
            "You are a diary consolidation engine. Summarize the following diary entries into a concise paragraph.",
            "Keep only important events, emotions, and patterns. Omit trivial details.",
            "Respond with only the consolidated text, no preamble.",
          ].join("\n"),
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: diaryText }],
              timestamp: Date.now(),
            },
          ],
        },
        {
          apiKey: config.OPENROUTER_API_KEY,
          maxTokens: 512,
          signal: AbortSignal.timeout(15_000),
        },
      )

      const summary = response.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text.trim())
        .join("")

      if (summary) {
        insertDiaryEntry(userId, `[consolidated] ${summary}`, null)
        logger.debug({ userId, originalCount: userEntries.length }, "consolidated diary group")
      }
    } catch (err) {
      logger.warn({ err, userId }, "diary consolidation LLM call failed, skipping group")
    }

    allConsolidated.push(...userEntries.map((e) => e.id))
  }

  markConsolidated(allConsolidated)

  const workingMem = await readWorkingMemory()
  const note = `[${new Date().toISOString()}] consolidated ${allConsolidated.length} diary entries`
  await writeWorkingMemory(workingMem ? `${workingMem}\n${note}` : note)

  logger.info(
    { consolidated: allConsolidated.length, groups: groups.size },
    "diary consolidation complete",
  )
}
