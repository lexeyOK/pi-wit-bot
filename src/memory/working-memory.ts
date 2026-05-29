import fs from "node:fs/promises"
import path from "node:path"

const FILE = path.resolve("data/working_memory.md")

export async function readWorkingMemory(): Promise<string> {
  try {
    return await fs.readFile(FILE, "utf-8")
  } catch {
    return ""
  }
}

export async function writeWorkingMemory(content: string): Promise<void> {
  await fs.writeFile(FILE, content, "utf-8")
}
