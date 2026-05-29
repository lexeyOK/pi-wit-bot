import type { AgentTool } from "@earendil-works/pi-agent-core"
import { type Static, Type } from "@sinclair/typebox"
import { logger } from "../logger.js"
import { insertDiaryEntry } from "../memory/diary.js"
import { readGroupMemory, writeGroupMemory } from "../memory/group-memory.js"
import { deleteMemory, queryMemories, storeMemory } from "../memory/rag.js"
import { readUserProfiles, writeUserProfiles } from "../memory/user-profiles.js"

const rememberParams = Type.Object({
  userId: Type.Number({ description: "Telegram user ID" }),
  fact: Type.String({ description: "The fact to remember" }),
  importance: Type.Number({ description: "Importance 0.0-1.0", default: 0.5 }),
})
type RememberParams = Static<typeof rememberParams>

export const rememberTool: AgentTool<typeof rememberParams> = {
  name: "remember",
  label: "Remember",
  description: "Store a fact about a user in long-term memory",
  parameters: rememberParams,
  execute: async (_toolCallId, params) => {
    logger.info({ tool: "remember", userId: params.userId }, "tool called")
    const id = await storeMemory({
      content: params.fact,
      userId: params.userId,
      memoryType: "fact",
      importance: params.importance ?? 0.5,
      createdAt: new Date().toISOString(),
    })
    return {
      content: [{ type: "text", text: `remembered as \`${id}\`` }],
      details: { memoryId: id },
    }
  },
}

const recallParams = Type.Object({
  userId: Type.Number({ description: "Telegram user ID" }),
  query: Type.String({ description: "What to look for" }),
})
type RecallParams = Static<typeof recallParams>

export const recallTool: AgentTool<typeof recallParams> = {
  name: "recall",
  label: "Recall",
  description: "Retrieve relevant memories about a user",
  parameters: recallParams,
  execute: async (_toolCallId, params) => {
    logger.info({ tool: "recall", userId: params.userId }, "tool called")
    const memories = await queryMemories(params.query, params.userId)
    if (memories.length === 0) {
      return { content: [{ type: "text", text: "no relevant memories found" }], details: {} }
    }
    const text = memories
      .map((m) => `[${m.id}] (${m.memoryType}, importance: ${m.importance}) ${m.content}`)
      .join("\n")
    return {
      content: [{ type: "text", text }],
      details: { count: memories.length },
    }
  },
}

const forgetParams = Type.Object({
  memoryId: Type.String({ description: "Memory ID to delete" }),
})
type ForgetParams = Static<typeof forgetParams>

export const forgetTool: AgentTool<typeof forgetParams> = {
  name: "forget",
  label: "Forget",
  description: "Delete a specific memory by ID",
  parameters: forgetParams,
  execute: async (_toolCallId, params) => {
    logger.info({ tool: "forget", memoryId: params.memoryId }, "tool called")
    await deleteMemory(params.memoryId)
    return { content: [{ type: "text", text: "deleted" }], details: {} }
  },
}

const diaryParams = Type.Object({
  userId: Type.Number({ description: "Telegram user ID" }),
  content: Type.String({ description: "What happened" }),
  emotion: Type.Optional(Type.String({ description: "How it felt" })),
})
type DiaryParams = Static<typeof diaryParams>

export const diaryEntryTool: AgentTool<typeof diaryParams> = {
  name: "diary_entry",
  label: "Diary Entry",
  description: "Record an event or emotion in the diary",
  parameters: diaryParams,
  execute: async (_toolCallId, params) => {
    logger.info({ tool: "diary_entry", userId: params.userId }, "tool called")
    insertDiaryEntry(params.userId, params.content, params.emotion ?? null)
    return { content: [{ type: "text", text: "diary entry saved" }], details: {} }
  },
}

const groupMemoryParams = Type.Object({
  key: Type.String({ description: "Memory key/topic" }),
  value: Type.String({ description: "Memory content" }),
})
type GroupMemoryParams = Static<typeof groupMemoryParams>

export const updateGroupMemoryTool: AgentTool<typeof groupMemoryParams> = {
  name: "update_group_memory",
  label: "Update Group Memory",
  description: "Update group-level context or norms",
  parameters: groupMemoryParams,
  execute: async (_toolCallId, params) => {
    logger.info({ tool: "update_group_memory", key: params.key }, "tool called")
    const current = await readGroupMemory()
    const sep = current ? "\n\n" : ""
    await writeGroupMemory(`${current}${sep}## ${params.key}\n${params.value}`)
    return { content: [{ type: "text", text: "group memory updated" }], details: {} }
  },
}

const userProfileParams = Type.Object({
  userId: Type.Number({ description: "Telegram user ID" }),
  info: Type.String({ description: "Profile information to record" }),
})
type UserProfileParams = Static<typeof userProfileParams>

export const updateUserProfileTool: AgentTool<typeof userProfileParams> = {
  name: "update_user_profile",
  label: "Update User Profile",
  description: "Update a user's communication style or profile info",
  parameters: userProfileParams,
  execute: async (_toolCallId, params) => {
    logger.info({ tool: "update_user_profile", userId: params.userId }, "tool called")
    const current = await readUserProfiles()
    const sep = current ? "\n\n" : ""
    await writeUserProfiles(`${current}${sep}## User ${params.userId}\n${params.info}`)
    return { content: [{ type: "text", text: "user profile updated" }], details: {} }
  },
}

export const customTools: AgentTool[] = [
  rememberTool,
  recallTool,
  forgetTool,
  diaryEntryTool,
  updateGroupMemoryTool,
  updateUserProfileTool,
]
