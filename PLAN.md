# pi-wit-bot -- Architecture Plan

A Telegram group chat bot powered by `@earendil-works/pi-agent-core`.
Responds in character, has layered memory, speaks only when appropriate.

---

## System Diagram

```
                    Telegram Group Chat
   User A --------+  User B --------+  User C --------+  User D --------+
                  |                 |                 |                 |
                  v                 v                 v                 v
           Telegram Bot (node-telegram-bot-api)
           - Receives ALL messages
           - Stores every message + user_id -> SQLite (messages table)
           - Forwards to Response Gate
                            |
                            v
                    RESPONSE GATE (Hybrid)

  Stage 1 -- Fast pre-filter (no LLM):
    - @mentioned?                          -> PASS
    - Replying to bot?                      -> PASS
    - Keyword match? (configurable list)    -> PASS

  Stage 2 -- LLM gate (same model, 1-shot):
    Prompt: "You are {CHARACTER}. Would you naturally
     respond to this message in this context?
     Reply YES or NO only."

    YES -> forward to agent
    NO  -> skip (logged)
                            |
                      (gate passed)
                            v
                    Pi AGENT (Single Instance)
                 @earendil-works/pi-agent-core

  System Prompt Assembly:
    [SOUL.md -- bot identity, <=3125 bytes]
    + USERS.md (user profiles, comm styles)
    + GROUP_MEMORY.md (group-level context)
    + working_memory.md (recent threads, emotions)
    + RAG-retrieved user facts (top-5 relevant)
    + Last 20-50 messages of context

  Agent Tools:
    remember(user, fact)         -> ChromaDB collection
    recall(user)                 -> ChromaDB similarity search
    forget(memory_id)            -> delete from ChromaDB
    diary_entry(content, emotion) -> SQLite diary table
    update_group_memory(key, val) -> GROUP_MEMORY.md
    update_user_profile(user, info) -> USERS.md

  Output: agent response text (or decides silence)
                            |
                            v
                   Response Formatter
    - Split at paragraph boundaries (Telegram 4096 char limit)
    - Send as natural multi-bubble messages
    - Preserve markdown formatting
                            |
                            v
                      Telegram Group
```

---

## Memory Layers

```
                        MEMORY LAYERS

  Layer 0: SOUL.md (Identity) -- Bot-managed during sleep, <=3125 bytes
  ------------------------------------------------
  - Character name, personality, backstory, voice, quirks
  - Full edit freedom for the bot (size-bound only)
  - Updated during sleep cycle self-reflection

  Layer 1: USERS.md (User Profiles)
  ---------------------------------------
  - Per-user: communication style, relationship with bot, interests
  - You seed initially, bot maintains over time via tool
  - Injected into every prompt

  Layer 2: GROUP_MEMORY.md (Group Context)
  ----------------------------------------
  - Group-level facts: "This is a programming chat", inside jokes
  - Bot-maintained (via tool calls)
  - Injected into every prompt

  Layer 3: Working Memory (Short-term, <=3 days)
  ------------------------------------------------
  - Ongoing conversations, unfinished threads, recent emotions
  - Stored in working_memory.md
  - Bot updates each session
  - Pruned during sleep cycle

  Layer 4: Semantic Memory (Long-term, RAG via ChromaDB)
  -------------------------------------------
  - Facts about users: "User A has a dog named Max"
  - Embeddings + metadata stored in ChromaDB
  - Retrieved via similarity search, filtered by user_id

  Layer 5: Diary (Events, Emotions)
  --------------------------------------------------
  - Event log: "User B shared their salary was increased"
  - Emotions, reactions stored with context
  - Consolidated during sleep cycle (compress/merge old entries)

  Layer 6: Message Archive (Raw -- SQLite)
  --------------------------------
  - ALL messages stored raw (message_id, user_id, chat_id, text, timestamp)
  - Searchable, exportable
  - Separate from "memory" -- this is history, not curated memory
```

---

## Memory Lifecycle

```
                      INCOMING MESSAGE
                            |
                            v
          1. MESSAGE ARCHIVE (SQLite: messages table)
             Always stored raw
                            |
                            v
          2. WORKING MEMORY (working_memory.md)
             Updated each session
             Holds: active threads, emotions, unfinished business
                            |
                            v
          3. DIARY ENTRY (SQLite: diary table)
             Agent decides what to record
             Includes emotional context
                            |
                            v
          4. SLEEP CYCLE (every 6h via node-cron)

             a. Diary Consolidation:
                - Load unconsolidated entries
                - Find related entries (ChromaDB similarity)
                - LLM prompt: "Compress, merge, rewrite, or discard"
                - Write back consolidated version
                - Mark old entries as consolidated

             b. Working Memory Prune:
                - Remove items >3 days old
                - Promote important items to diary
                - Keep active threads

             c. SOUL.md Reflection:
                - Review recent diary + significant events
                - Ask: "Has my character evolved? Update SOUL.md if so."
                - Rewrite SOUL.md (must be <=3125 bytes)
```

---

## Data Model

### SQLite Tables

```sql
-- Raw message archive
CREATE TABLE messages (
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

-- User profiles (structured fields, USERS.md is the full source)
CREATE TABLE users (
    user_id     INTEGER PRIMARY KEY,
    username    TEXT,
    first_name  TEXT,
    last_name   TEXT,
    first_seen  DATETIME,
    last_seen   DATETIME
);

-- Diary entries (long-term event log)
CREATE TABLE diary (
    id           INTEGER PRIMARY KEY,
    user_id      INTEGER,
    content      TEXT NOT NULL,
    emotion      TEXT,
    consolidated BOOLEAN DEFAULT 0,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Group memory (key-value cache for GROUP_MEMORY.md)
CREATE TABLE group_memory (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Session tracking
CREATE TABLE sessions (
    id          INTEGER PRIMARY KEY,
    session_id  TEXT UNIQUE,
    chat_id     INTEGER,
    started_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_active DATETIME,
    message_count INTEGER DEFAULT 0
);

CREATE INDEX idx_messages_chat ON messages(chat_id, created_at);
CREATE INDEX idx_messages_user ON messages(user_id);
CREATE INDEX idx_diary_user ON diary(user_id);
CREATE INDEX idx_diary_consolidated ON diary(consolidated);
```

### ChromaDB Collection

```
Collection: "pi_wit_memories"
  - id: uuid (auto-generated)
  - document: string (the fact/memory text)
  - metadata:
      user_id: number
      memory_type: "fact" | "emotion" | "event" | "observation"
      importance: float (0.0-1.0)
      created_at: timestamp (ISO)
      last_accessed: timestamp (ISO)
  - embedding: float[] (auto-generated by ChromaDB)
```

---

## Tech Stack

| Component | Choice | Why |
|---|---|---|
| AI Agent SDK | `@earendil-works/pi-agent-core` | Pi coding agent SDK |
| LLM Provider | OpenRouter -> DeepSeek V4 Fast | Cheap, fast, OpenAI-compatible |
| Telegram Client | `node-telegram-bot-api` | Mature, polling-based |
| Structured DB | `better-sqlite3` | Fast, zero-config, synchronous |
| Vector DB | `chromadb` (embedded) | Proper vector search at any scale |
| Schema Validation | `zod` | Config, tool params, API validation |
| Logging | `pino` | Structured JSON, fast |
| Error Tracking | `@sentry/node` | Production error monitoring |
| Scheduling | `node-cron` | Simple cron for sleep cycle |
| Dev Runner | `tsx` | Hot reload TypeScript |
| Runtime | Node.js 20+ | Pi SDK requirement |
| Process Manager | PM2 | Production deployment |

---

## Library List

```
dependencies:
  @earendil-works/pi-agent-core  ^0.75    Pi agent SDK
  @earendil-works/pi-ai          ^0.75    LLM abstraction layer
  better-sqlite3                 ^11      SQLite driver
  chromadb                       ^1.10    Vector database (embedded)
  dotenv                         ^16      Environment variables
  node-cron                      ^3       Sleep cycle scheduler
  node-telegram-bot-api          ^0.66    Telegram Bot API
  pino                           ^9       Structured JSON logging
  pino-pretty                    ^13      Dev-mode log formatting (optional)
  @sentry/node                   ^8       Error tracking
  @sinclair/typebox              ^0.34    JSON Schema for Pi SDK tool params
  uuid                           ^11      Unique IDs
  zod                            ^3       Schema validation

devDependencies:
  tsx                            ^4       TypeScript dev runner
  typescript                     ^5.7
  @types/better-sqlite3          ^7
  @types/node                    ^22
  @types/node-cron               ^3
  @types/node-telegram-bot-api   ^0.64
  @types/uuid                    ^10
```

---

## Project Structure

```
pi-wit-bot/
|
+-- SOUL.md                       Bot identity (<=3125 bytes, bot-managed)
+-- USERS.md                      User profiles and communication styles
+-- AGENTS.md                     Pi agent config conventions
+-- .env                          TELEGRAM_BOT_TOKEN, OPENROUTER_API_KEY, SENTRY_DSN
+-- .env.example
+-- .gitignore
+-- package.json
+-- tsconfig.json
+-- ecosystem.config.cjs          PM2 config
|
+-- src/
|   +-- index.ts                  Entry point, service wiring, graceful shutdown
|   +-- config.ts                 Zod schema + .env loading
|   +-- logger.ts                 Pino instance
|   |
|   +-- bot.ts                    Telegram message polling + routing
|   |
|   +-- gate/
|   |   +-- index.ts              ResponseGate orchestrator
|   |   +-- fast-filter.ts        Stage 1: mentions, replies, keywords
|   |   +-- llm-gate.ts           Stage 2: LLM binary classification
|   |
|   +-- agent/
|   |   +-- bridge.ts             Pi SDK wrapper (session, prompt assembly)
|   |   +-- tools.ts              Custom tool definitions (remember, recall, diary, etc.)
|   |   +-- context-builder.ts    System prompt assembly from SOUL/USERS/GROUP/working
|   |
|   +-- memory/
|   |   +-- store.ts              SQLite queries (messages, users, diary, sessions)
|   |   +-- rag.ts                ChromaDB wrapper (store, query, delete)
|   |   +-- diary.ts              Diary CRUD
|   |   +-- working-memory.ts     working_memory.md read/write
|   |   +-- group-memory.ts       GROUP_MEMORY.md read/write
|   |   +-- user-profiles.ts      USERS.md read/write
|   |
|   +-- sleep/
|   |   +-- scheduler.ts          node-cron setup
|   |   +-- consolidate.ts        Diary compression/merge logic
|   |   +-- soul-reflect.ts       SOUL.md update via LLM
|   |
|   +-- formatter.ts              Telegram-safe message splitting
|
+-- data/
|   +-- memory.db                 SQLite database (auto-created)
|   +-- GROUP_MEMORY.md           Group context (agent-maintained)
|   +-- working_memory.md         Short-term context (agent-maintained)
|
+-- sessions/                     Pi agent session files (auto-created)
+-- logs/                         App logs (PM2 managed)
```

---

## Response Gate Decision Tree

```
Incoming message
    |
    +-- Is bot @mentioned? ------------------- YES -> PASS
    |
    +-- Is bot replying to its own message? -- YES -> PASS
    |
    +-- Does message match keyword triggers? - YES -> PASS
    |   (configurable keyword list in AGENTS.md)
    |
    +-- Is message very short/noise? --------- YES -> SKIP
    |   (e.g. "lol", "ok", single emoji, <3 chars)
    |
    +-- LLM gate:
       "You are {CHARACTER}. Would you naturally
        respond to this message? Reply YES or NO."
        |
        +-- YES -> PASS -> Pi agent
        +-- NO  -> SKIP (log and move on)
```

---

## Data Flow Example

```
1. User A in group: "@bot remember i have a meeting tomorrow at 10am"

2. Telegram bot receives -> stores in messages table (SQLite)

3. Response Gate:
   Stage 1: @mentioned -> PASS (no Stage 2 needed)

4. Context Builder assembles prompt:
   SOUL.md + USERS.md (User A profile) + GROUP_MEMORY.md +
   working_memory.md + last 30 messages + relevant ChromaDB memories

5. Pi Agent receives:
   Agent decides: "Got it, User A! I'll remember that meeting."
   Calls tool: remember(user="User A", fact="Meeting tomorrow at 10am")

6. Memory stored:
   - ChromaDB: {document: "User A has a meeting tomorrow at 10am",
                metadata: {user_id: 123, type: "fact", importance: 0.8}}
   - working_memory.md updated with active thread

7. Response formatted and sent to Telegram group

--- Later, during sleep cycle ---

8. Scheduler triggers (every 6h):
   a. Diary consolidation: merge related entries
   b. Working memory prune: remove items >3 days old
   c. SOUL.md reflection: review recent events, update character if needed
```

---

## Implementation Order

| Step | What | Files |
|---|---|---|
| 1 | Project scaffolding | `package.json`, `tsconfig.json`, `.env`, `.gitignore`, `ecosystem.config.cjs` |
| 2 | Config + logger | `src/config.ts`, `src/logger.ts` |
| 3 | SQLite store | `src/memory/store.ts` (schema creation + CRUD) |
| 4 | Telegram bot | `src/bot.ts`, `src/index.ts` |
| 5 | Response gate | `src/gate/*.ts` |
| 6 | Pi agent bridge | `src/agent/bridge.ts`, `src/agent/tools.ts` |
| 7 | Context builder | `src/agent/context-builder.ts` |
| 8 | Memory layers | `src/memory/rag.ts`, `src/memory/diary.ts`, `src/memory/working-memory.ts`, `src/memory/group-memory.ts`, `src/memory/user-profiles.ts` |
| 9 | Formatter | `src/formatter.ts` |
| 10 | Sleep cycle | `src/sleep/scheduler.ts`, `src/sleep/consolidate.ts`, `src/sleep/soul-reflect.ts` |
| 11 | SOUL.md | `SOUL.md` (seed file) |
| 12 | USERS.md | `USERS.md` (seed file) |
| 13 | AGENTS.md | `AGENTS.md` (pi conventions) |

---

## Deployment

```bash
# Install
npm install
npm run build

# Configure
cp .env.example .env
# Edit .env -- fill in TELEGRAM_BOT_TOKEN, OPENROUTER_API_KEY, SENTRY_DSN

# Run (dev)
npm run dev

# Run (production with PM2)
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup
```

## .env

```
TELEGRAM_BOT_TOKEN=123456789:AAFf_real_token_from_botfather
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=deepseek/deepseek-chat-v4-fast
SENTRY_DSN=https://...
SLEEP_INTERVAL_HOURS=6
LOG_LEVEL=info
```

---

## Key Design Decisions

- **Single Pi agent instance** (not per-user) -- bot knows the whole group
- **SOUL.md is bot-managed** -- full edit freedom, 3125 byte hard cap
- **USERS.md + GROUP_MEMORY.md** -- human + bot maintained context files
- **ChromaDB for semantic memory** -- proper vector search, metadata filtering
- **Hybrid response gate** -- fast pre-filter + LLM binary classification
- **Sleep cycle every 6h** -- diary consolidation, memory prune, soul reflection
- **Sentry for errors** -- capture LLM failures, DB errors, crashes
- **Pino for logging** -- structured JSON, span-friendly
- **PM2 for production** -- auto-restart, log management, startup script
