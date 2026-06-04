 > [!WARNING] all of this was vibecoded, the code was not checked by a human and the enormous amounts of drincable watter was removed :/

# pi-wit-bot

Telegram group chat bot powered by Pi SDK + DeepSeek V4 Fast. Character-driven, memory-aware, selectively responds via a two-stage gate.

## Quick Start

### Prerequisites
- Node.js >= 22 + pnpm (`corepack enable && corepack prepare pnpm@latest --activate`)
- ChromaDB server running on `localhost:8000` (or set `CHROMA_URL`)
- A Telegram bot token from [@BotFather](https://t.me/BotFather)

### Setup

```bash
cp .env.example .env
# fill in TELEGRAM_BOT_TOKEN and OPENROUTER_API_KEY
pnpm install
pnpm start
```

### Docker Compose

```bash
cp .env.example .env
# fill in TELEGRAM_BOT_TOKEN and OPENROUTER_API_KEY
docker compose up -d
```

This spins up:
- **chromadb** — vector memory store (port 8000)
- **bot** — the Telegram bot

The bot forwards to the host's Tor SOCKS5 proxy on port 9050 via `host.docker.internal`.
Set `TELEGRAM_PROXY_URL=` in `.env` or override in the compose file to disable.

## Architecture

```
Telegram message → fast filter → LLM gate → agent → response
                       │                    │
                  mentions/replies/     character decides
                  keywords pass,        if response warranted
                  trivial noise drops
```

Memory layers:
| Layer | Storage | Purpose |
|---|---|---|
| Chat log | SQLite (`data/memory.db`) | Recent message history |
| Diary | SQLite | Events + emotions, consolidated every 6h |
| Vector RAG | ChromaDB | Long-term fact/event recall |
| Context files | Markdown on disk | SOUL.md, USERS.md, GROUP_MEMORY.md, working_memory.md |

Sleep cycle runs every 6 hours:
1. **Diary consolidation** — groups unconsolidated diary entries by user, LLM-summarizes them
2. **Soul reflection** — reviews recent context, rewrites SOUL.md if the character should evolve (max 3125 bytes)

## Files

| File | Purpose |
|---|---|
| `SOUL.md` | Bot character definition (bot-managed via sleep cycle) |
| `USERS.md` | User profiles (tool-managed via `update_user_profile`) |
| `AGENTS.md` | Developer notes about bot operation |
| `data/GROUP_MEMORY.md` | Group-level context (tool-managed via `update_group_memory`) |
| `data/working_memory.md` | Recent activity log (bot-managed) |
| `data/memory.db` | SQLite database (chat logs, diary, users, sessions) |

## Environment Variables

| Variable | Default | Required |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | — | Yes |
| `OPENROUTER_API_KEY` | — | Yes |
| `OPENROUTER_MODEL` | `deepseek/deepseek-chat-v4-fast` | No |
| `CHROMA_URL` | `http://localhost:8000` | No |
| `TELEGRAM_PROXY_URL` | — | No |
| `SENTRY_DSN` | — | No |
| `SLEEP_INTERVAL_HOURS` | `6` | No |
| `LOG_LEVEL` | `info` | No |
