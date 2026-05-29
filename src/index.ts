import { config } from "./config.js"
import { logger } from "./logger.js"
import { stopAccumulator } from "./accumulator.js"
import { ensureSeedFiles } from "./memory/seed.js"
import { closeDb, openDb } from "./memory/store.js"
import { startSleepScheduler } from "./sleep/scheduler.js"

async function main() {
  logger.info({ model: config.OPENROUTER_MODEL }, "starting pi-wit-bot")

  await ensureSeedFiles()
  openDb()
  startSleepScheduler()

  const { createBot } = await import("./bot.js")
  const bot = await createBot()

  const shutdown = () => {
    logger.info("shutting down")
    stopAccumulator()
    bot.stopPolling()
    closeDb()
    process.exit(0)
  }
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
}

main()
