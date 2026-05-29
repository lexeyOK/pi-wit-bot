import type Database from "better-sqlite3"
import { getDb } from "./store.js"

export interface DiaryEntry {
  id: number
  userId: number
  content: string
  emotion: string | null
  consolidated: boolean
  createdAt: string
}

export function insertDiaryEntry(
  userId: number,
  content: string,
  emotion: string | null = null,
): void {
  const db = getDb()
  db.prepare("INSERT INTO diary (user_id, content, emotion) VALUES (?, ?, ?)").run(
    userId,
    content,
    emotion,
  )
}

export function getUnconsolidatedEntries(limit = 50): DiaryEntry[] {
  const db = getDb()
  return db
    .prepare("SELECT * FROM diary WHERE consolidated = 0 ORDER BY created_at ASC LIMIT ?")
    .all(limit) as DiaryEntry[]
}

export function markConsolidated(ids: number[]): void {
  const db = getDb()
  const placeholders = ids.map(() => "?").join(",")
  db.prepare(`UPDATE diary SET consolidated = 1 WHERE id IN (${placeholders})`).run(...ids)
}
