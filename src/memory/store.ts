import path from "node:path"
import Database from "better-sqlite3"
import { logger } from "../logger.js"

const DB_PATH = path.resolve("data/memory.db")

const SCHEMA = `
CREATE TABLE IF NOT EXISTS messages (
    id          INTEGER PRIMARY KEY,
    message_id  INTEGER NOT NULL,
    chat_id     INTEGER NOT NULL,
    user_id     INTEGER NOT NULL,
    username    TEXT,
    text        TEXT,
    replied_to  INTEGER,
    is_bot      BOOLEAN DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    user_id     INTEGER PRIMARY KEY,
    username    TEXT,
    first_name  TEXT,
    last_name   TEXT,
    first_seen  DATETIME,
    last_seen   DATETIME
);

CREATE TABLE IF NOT EXISTS diary (
    id           INTEGER PRIMARY KEY,
    user_id      INTEGER,
    content      TEXT NOT NULL,
    emotion      TEXT,
    consolidated BOOLEAN DEFAULT 0,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS group_memory (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
    id          INTEGER PRIMARY KEY,
    session_id  TEXT UNIQUE,
    chat_id     INTEGER,
    started_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_active DATETIME,
    message_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_diary_user ON diary(user_id);
CREATE INDEX IF NOT EXISTS idx_diary_consolidated ON diary(consolidated);
`

let db: Database.Database

export interface StoredMessage {
  id: number
  messageId: number
  chatId: number
  userId: number
  username: string | null
  text: string | null
  repliedTo: number | null
  isBot: boolean
  createdAt: string
}

export interface StoredUser {
  userId: number
  username: string | null
  firstName: string | null
  lastName: string | null
  firstSeen: string | null
  lastSeen: string | null
}

export interface StoredSession {
  id: number
  sessionId: string
  chatId: number
  startedAt: string
  lastActive: string | null
  messageCount: number
}

export function openDb(): Database.Database {
  if (db) return db
  db = new Database(DB_PATH)
  db.pragma("journal_mode = WAL")
  db.exec(SCHEMA)
  logger.info({ path: DB_PATH }, "database opened")
  return db
}

export function getDb(): Database.Database {
  if (!db) throw new Error("database not opened — call openDb() first")
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    logger.info("database closed")
  }
}

export function insertMessage(
  messageId: number,
  chatId: number,
  userId: number,
  text: string | null,
  username: string | null,
  repliedTo: number | null,
  isBot = false,
): void {
  getDb()
    .prepare(
      `INSERT INTO messages (message_id, chat_id, user_id, username, text, replied_to, is_bot)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(messageId, chatId, userId, username, text, repliedTo, isBot ? 1 : 0)
}

export function getRecentMessages(chatId: number, limit = 50): StoredMessage[] {
  const rows = getDb()
    .prepare(
      `SELECT id, message_id, chat_id, user_id, username, text, replied_to, is_bot, created_at
       FROM messages
       WHERE chat_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(chatId, limit) as Record<string, unknown>[]

  return rows.reverse().map(rowToMessage)
}

export function getMessage(messageId: number, chatId: number): StoredMessage | null {
  const row = getDb()
    .prepare(
      `SELECT id, message_id, chat_id, user_id, username, text, replied_to, is_bot, created_at
       FROM messages
       WHERE message_id = ? AND chat_id = ?`,
    )
    .get(messageId, chatId) as Record<string, unknown> | undefined

  if (!row) return null
  return rowToMessage(row)
}

function rowToMessage(row: Record<string, unknown>): StoredMessage {
  return {
    id: Number(row.id),
    messageId: Number(row.message_id),
    chatId: Number(row.chat_id),
    userId: Number(row.user_id),
    username: row.username as string | null,
    text: row.text as string | null,
    repliedTo: row.replied_to as number | null,
    isBot: Boolean(row.is_bot),
    createdAt: String(row.created_at),
  }
}

export function upsertUser(
  userId: number,
  username: string | null,
  firstName: string | null,
  lastName: string | null,
): void {
  const db = getDb()
  const existing = db.prepare("SELECT user_id FROM users WHERE user_id = ?").get(userId) as
    | Record<string, unknown>
    | undefined

  if (existing) {
    db.prepare(
      `UPDATE users SET username = ?, first_name = ?, last_name = ?, last_seen = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
    ).run(username, firstName, lastName, userId)
  } else {
    db.prepare(
      `INSERT INTO users (user_id, username, first_name, last_name, first_seen, last_seen)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    ).run(userId, username, firstName, lastName)
  }
}

export function getUser(userId: number): StoredUser | null {
  const row = getDb()
    .prepare(
      `SELECT user_id, username, first_name, last_name, first_seen, last_seen
       FROM users WHERE user_id = ?`,
    )
    .get(userId) as Record<string, unknown> | undefined

  if (!row) return null
  return {
    userId: Number(row.user_id),
    username: row.username as string | null,
    firstName: row.first_name as string | null,
    lastName: row.last_name as string | null,
    firstSeen: row.first_seen as string | null,
    lastSeen: row.last_seen as string | null,
  }
}

export function startOrUpdateSession(chatId: number): StoredSession {
  const db = getDb()
  const sessionId = `${chatId}-${Date.now()}`
  const existing = db
    .prepare("SELECT * FROM sessions WHERE chat_id = ? ORDER BY last_active DESC LIMIT 1")
    .get(chatId) as Record<string, unknown> | undefined

  if (existing) {
    const row = db
      .prepare(
        `UPDATE sessions SET last_active = CURRENT_TIMESTAMP, message_count = message_count + 1
         WHERE id = ?`,
      )
      .run(existing.id) as { changes: number }
    return {
      id: Number(existing.id),
      sessionId: String(existing.session_id),
      chatId: Number(existing.chat_id),
      startedAt: String(existing.started_at),
      lastActive: new Date().toISOString(),
      messageCount: Number(existing.message_count) + 1,
    }
  }

  db.prepare(
    `INSERT INTO sessions (session_id, chat_id, last_active, message_count)
     VALUES (?, ?, CURRENT_TIMESTAMP, 1)`,
  ).run(sessionId, chatId)

  return {
    id: 0,
    sessionId,
    chatId,
    startedAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
    messageCount: 1,
  }
}
