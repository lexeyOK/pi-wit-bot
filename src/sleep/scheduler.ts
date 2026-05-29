import cron from "node-cron"
import { config } from "../config.js"
import { logger } from "../logger.js"
import { consolidateDiary } from "./consolidate.js"
import { reflectAndUpdateSoul } from "./soul-reflect.js"

export function startSleepScheduler(): void {
  const interval = config.SLEEP_INTERVAL_HOURS
  const expression = `0 */${interval} * * *`

  cron.schedule(expression, async () => {
    logger.info({ interval }, "sleep cycle starting")

    try {
      await consolidateDiary()
    } catch (err) {
      logger.error({ err }, "diary consolidation failed")
    }

    try {
      await reflectAndUpdateSoul()
    } catch (err) {
      logger.error({ err }, "soul reflection failed")
    }

    logger.info("sleep cycle complete")
  })

  logger.info({ expression, interval }, "sleep scheduler started")
}
