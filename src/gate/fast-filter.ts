import type { TelegramMessage } from "../bot.js"

const TRIVIAL_LENGTH = 2

export interface FastFilterResult {
  passed: boolean
  stage: "mention" | "reply" | "keyword" | "pass_through"
}

export function fastFilter(
  msg: TelegramMessage,
  botId: number,
  keywords: string[],
): FastFilterResult {
  const text = msg.text ?? ""

  // stage: @mention
  if (text.includes(`@${botId}`) || text.includes("@pi_wit_bot")) {
    return { passed: true, stage: "mention" }
  }

  // stage: reply to bot
  if (msg.reply_to_message?.from?.id === botId) {
    return { passed: true, stage: "reply" }
  }

  // stage: keyword match
  if (keywords.some((kw) => text.toLowerCase().includes(kw))) {
    return { passed: true, stage: "keyword" }
  }

  return { passed: false, stage: "pass_through" }
}
