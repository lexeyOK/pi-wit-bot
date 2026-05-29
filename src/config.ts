import "dotenv/config"
import { z } from "zod"

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  OPENROUTER_API_KEY: z.string().min(1),
  OPENROUTER_MODEL: z.string().default("deepseek/deepseek-chat-v4-fast"),
  CHROMA_URL: z.string().default("http://localhost:8000"),
  TELEGRAM_PROXY_URL: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  SLEEP_INTERVAL_HOURS: z.coerce.number().default(6),
  BATCH_INTERVAL_SECONDS: z.coerce.number().default(20),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
})

function loadConfig() {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    console.error("invalid environment config:", result.error.flatten().fieldErrors)
    process.exit(1)
  }
  return result.data
}

export const config = loadConfig()
export type Config = typeof config
