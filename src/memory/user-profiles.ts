import fs from "node:fs/promises"
import path from "node:path"

const FILE = path.resolve("USERS.md")

export async function readUserProfiles(): Promise<string> {
  try {
    return await fs.readFile(FILE, "utf-8")
  } catch {
    return ""
  }
}

export async function writeUserProfiles(content: string): Promise<void> {
  await fs.writeFile(FILE, content, "utf-8")
}
