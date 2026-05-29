const MAX_LENGTH = 4096

export function splitMessage(text: string): string[] {
  if (text.length <= MAX_LENGTH) return [text]

  const parts: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= MAX_LENGTH) {
      parts.push(remaining)
      break
    }

    // split at paragraph boundary
    const slice = remaining.slice(0, MAX_LENGTH)
    const lastBreak = slice.lastIndexOf("\n\n")
    const splitAt = lastBreak > 0 ? lastBreak : slice.lastIndexOf("\n")
    const actualSplit = splitAt > 0 ? splitAt : MAX_LENGTH

    parts.push(remaining.slice(0, actualSplit))
    remaining = remaining.slice(actualSplit).trim()
  }

  return parts
}
