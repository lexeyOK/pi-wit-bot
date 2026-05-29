import { ChromaClient } from "chromadb"
import { config } from "../config.js"

export interface MemoryDoc {
  id: string
  content: string
  userId: number
  memoryType: "fact" | "emotion" | "event" | "observation"
  importance: number
  createdAt: string
}

const COLLECTION_NAME = "pi_wit_memories"
const client = new ChromaClient({ path: config.CHROMA_URL })

interface IEmbeddingFunction {
  generate(texts: string[]): Promise<number[][]>
}

/** Custom embedding function that delegates to kodikrouter's OpenAI-compatible API. */
const kodikEmbedder: IEmbeddingFunction = {
  generate: async (texts: string[]) => {
    const res = await fetch("https://api.kodikrouter.ru/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: texts,
        model: "openai/text-embedding-3-small",
      }),
    })
    if (!res.ok) {
      throw new Error(`embedding API error ${res.status}: ${await res.text()}`)
    }
    const data = (await res.json()) as {
      data: { embedding: number[] }[]
    }
    return data.data.map((d) => d.embedding)
  },
}

async function getOrCreateCollection() {
  return await client.getOrCreateCollection({
    name: COLLECTION_NAME,
    embeddingFunction: kodikEmbedder,
  })
}

export async function storeMemory(doc: Omit<MemoryDoc, "id">): Promise<string> {
  const collection = await getOrCreateCollection()
  const id = crypto.randomUUID()
  await collection.add({
    ids: [id],
    documents: [doc.content],
    metadatas: [
      {
        user_id: doc.userId,
        memory_type: doc.memoryType,
        importance: doc.importance,
        created_at: doc.createdAt,
      },
    ],
  })
  return id
}

export async function queryMemories(
  query: string,
  userId?: number,
  nResults = 5,
): Promise<MemoryDoc[]> {
  const collection = await getOrCreateCollection()
  const where = userId ? { user_id: userId } : undefined
  const results = await collection.query({
    queryTexts: [query],
    nResults,
    where,
  })
  const ids = results.ids[0] ?? []
  const documents = results.documents[0] ?? []
  const metadatas = results.metadatas[0] ?? []
  return ids.map((id, i) => {
    const meta = metadatas[i] ?? {}
    return {
      id,
      content: documents[i] ?? "",
      userId: Number(meta.user_id ?? 0),
      memoryType: (meta.memory_type as MemoryDoc["memoryType"]) ?? "observation",
      importance: Number(meta.importance ?? 0.5),
      createdAt: String(meta.created_at ?? ""),
    }
  })
}

export async function deleteMemory(id: string): Promise<void> {
  const collection = await getOrCreateCollection()
  await collection.delete({ ids: [id] })
}
