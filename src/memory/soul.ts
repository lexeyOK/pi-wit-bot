import fs from "node:fs/promises"
import path from "node:path"

const FILE = path.resolve("SOUL.md")

export async function readSoul(): Promise<string> {
  try {
    return await fs.readFile(FILE, "utf-8")
  } catch {
    return ""
  }
}

export async function writeSoul(content: string): Promise<void> {
  await fs.writeFile(FILE, content, "utf-8")
}
