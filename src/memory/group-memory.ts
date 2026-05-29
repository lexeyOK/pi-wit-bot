import fs from "node:fs/promises"
import path from "node:path"

const FILE = path.resolve("data/GROUP_MEMORY.md")

export async function readGroupMemory(): Promise<string> {
  try {
    return await fs.readFile(FILE, "utf-8")
  } catch {
    return ""
  }
}

export async function writeGroupMemory(content: string): Promise<void> {
  await fs.writeFile(FILE, content, "utf-8")
}
