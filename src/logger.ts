import pino from "pino"
import { config } from "./config.js"

const transport =
  process.env.NODE_ENV !== "production"
    ? { target: "pino-pretty", options: { colorize: true } }
    : undefined

export const logger = pino({
  level: config.LOG_LEVEL,
  transport,
})
