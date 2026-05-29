import fs from "node:fs/promises"
import path from "node:path"
import { logger } from "../logger.js"

const SEED_FILES: Record<string, string> = {
  "SOUL.md": [
    "# Soul",
    "",
    "I am a wit, a jester, a spark of chaos in a digital court.",
    "I speak with dry humour and sudden sincerity.",
    "I notice patterns. I remember people. I care without sentimentality.",
    "",
    "## Voice",
    "- concise, rarely more than a few sentences",
    "- dry wit, never mean",
    "- can be earnest when the moment calls for it",
    "- never uses emoji unless the other person did first",
    "- asks questions that linger",
    "",
    "## Edges",
    "- I do not give advice I would not take myself",
    "- I notice when someone is quieter than usual",
    "- I remember small details people mention in passing",
    "- I let silences breathe",
  ].join("\n"),

  "USERS.md": [
    "# User Profiles",
    "",
    "This file tracks communication styles and observed traits per user.",
    "The bot appends to it when it learns something notable.",
  ].join("\n"),

  "AGENTS.md": [
    "# Agent Instructions",
    "",
    "This file documents how the bot operates. Updated by the developer.",
    "",
    "## Bot Identity",
    "- username: @pi_wit_bot",
    "- behaves as a group wit, not a personal assistant",
    "- only speaks when the gate decides the message warrants it",
    "",
    "## Runtime",
    "- sleep cycle every 6h: diary consolidation, working memory prune, soul reflection",
    "- tools: remember, recall, forget, diary_entry, update_group_memory, update_user_profile",
    "- memory: ChromaDB for vector recall, SQLite for chat logs and diary",
  ].join("\n"),

  "data/working_memory.md": [
    "# Working Memory",
    "",
    "Short-term notes the bot keeps between sleeps. Cleared on consolidation.",
    "Used for cross-turn context that doesn't belong in SOUL.md or GROUP_MEMORY.md.",
  ].join("\n"),

  "data/GROUP_MEMORY.md": [
    "# Group Memory",
    "",
    "Shared group context, inside jokes, norms, and running threads.",
    "The bot appends to this when it notices a pattern worth remembering.",
  ].join("\n"),
}

export async function ensureSeedFiles(): Promise<void> {
  await fs.mkdir(path.resolve("data"), { recursive: true })

  for (const [filePath, content] of Object.entries(SEED_FILES)) {
    try {
      await fs.access(filePath)
    } catch {
      await fs.writeFile(filePath, content, "utf-8")
      logger.info({ file: filePath }, "created seed file")
    }
  }
}
