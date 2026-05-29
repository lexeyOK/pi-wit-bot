export interface AgentContext {
  soul: string
  userProfiles: string
  groupMemory: string
  workingMemory: string
  recentMessages: string
  memories: string
}

export async function buildSystemPrompt(ctx: AgentContext): Promise<string> {
  return [
    ctx.soul,
    ctx.userProfiles,
    ctx.groupMemory,
    ctx.workingMemory,
    "Recent conversation:",
    ctx.recentMessages,
    "Relevant memories:",
    ctx.memories,
  ]
    .filter(Boolean)
    .join("\n\n")
}
