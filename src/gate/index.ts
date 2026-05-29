import type { TelegramMessage } from "../bot.js"
import { logger } from "../logger.js"
import { fastFilter } from "./fast-filter.js"
import { llmGate } from "./llm-gate.js"

const KEYWORDS = [
  "remember",
  "forget",
  "hey bot",
  "what do you think",
  "ботик",
  "лекс бот",
  "lex bot",
  "ботика",
]

export interface GateResult {
  passed: boolean
  stage: string
}

export async function responseGate(
  msg: TelegramMessage,
  botId: number,
  soul: string,
): Promise<GateResult> {
  return {passed: true, stage: "llm_gate"}
  // stage 1: fast pre-filter (no LLM)
  const fast = fastFilter(msg, botId, KEYWORDS)
  if (fast.passed) {
    return { passed: true, stage: fast.stage }
  }
  // stage 2: LLM gate
  const llm = await llmGate(msg, soul)
  if (llm.passed) {
    return { passed: true, stage: "llm_gate" }
  }

  logger.debug({ chatId: msg.chat.id, stage: fast.stage }, "gate skipped")
  return { passed: false, stage: fast.stage }
}
