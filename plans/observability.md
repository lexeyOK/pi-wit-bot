# Observability: Sentry AI Agent Monitoring

## Objective
See the contents of every request made to external APIs (LLM, embeddings, Telegram) in Sentry.

## Approach
Use Sentry's manual AI Agent Instrumentation API — `Sentry.startSpan()` with `gen_ai.*` span ops and attributes. Sentry's AI dashboards auto-detect these spans and surface token usage, latency, tool calls, and request/response bodies.

## Dependency
`@sentry/node` ^8 is already installed (v8.55.2). No new packages needed.

## Files to modify

### 1. `src/observability.ts` (new)
Utility module with two helpers:

```typescript
// Wraps agent.prompt() as gen_ai.invoke_agent
export async function instrumentAgentInvocation<T>(
  systemPrompt: string,
  userMessage: string,
  model: string,
  fn: () => Promise<{ text: string; usage?: { input: number; output: number; total: number } }>
): Promise<{ text: string; usage?: ... }>

// Wraps completeSimple() as gen_ai.chat
export async function instrumentChat<T>(
  label: string,
  systemPrompt: string,
  messages: unknown[],
  model: string,
  fn: () => Promise<T>
): Promise<T>

// Wraps raw fetch() as gen_ai.embeddings
export async function instrumentFetch(
  url: string,
  options: RequestInit,
): Promise<Response>
```

### 2. `src/index.ts`
Add `Sentry.init()` at the very top, before any other imports:

```typescript
import * as Sentry from "@sentry/node"
import { config } from "./config.js"

Sentry.init({
  dsn: config.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? "development",
  tracesSampleRate: 1.0,
})
```

The default `httpIntegration` + `nativeNodeFetchIntegration` auto-instrument all HTTP calls as spans (URL, method, status, timing).

### 3. `src/agent/bridge.ts` — `promptAgent()`
Wrap the function body with `instrumentAgentInvocation()`. Attributes attached:

| Attribute | Value |
|---|---|
| `gen_ai.operation.name` | `"invoke_agent"` |
| `gen_ai.agent.name` | `"pi-wit-bot"` |
| `gen_ai.request.model` | `config.OPENROUTER_MODEL` |
| `gen_ai.system_instructions` | `systemPrompt` |
| `gen_ai.input.messages` | JSON-stringified user message |
| `gen_ai.output.messages` | JSON-stringified response |
| `gen_ai.usage.input_tokens` | from response |
| `gen_ai.usage.output_tokens` | from response |
| `gen_ai.usage.total_tokens` | from response |

### 4. `src/gate/llm-gate.ts` — `completeSimple()` call (line 38)
Wrap with `instrumentChat("llm-gate decision", ...)`. Attaches system prompt, messages, and the LLM's YES/NO answer.

### 5. `src/sleep/consolidate.ts` — `completeSimple()` call (line 70)
Same pattern — `instrumentChat("diary consolidation", ...)`.

### 6. `src/sleep/soul-reflect.ts` — `completeSimple()` call (line 53)
Same pattern — `instrumentChat("soul reflection", ...)`.

### 7. `src/memory/rag.ts` — raw `fetch()` at line 23
Replace with `instrumentFetch(...)` which creates a `gen_ai.embeddings` span and attaches the input texts as span data.

## What the Sentry trace looks like

```
gen_ai.invoke_agent pi-wit-bot          (full prompt + response visible)
├── POST /v1/chat/completions            (auto http span — timing, URL, status)
├── POST /v1/embeddings                  (auto http span)
├── POST /bot<token>/sendMessage         (auto http span)
└── POST localhost:8000/api/v1/...       (auto http span, ChromaDB)

gen_ai.chat deepseek/deepseek-chat-v4-fast   (gate — prompt + YES/NO visible)
gen_ai.chat deepseek/deepseek-chat-v4-fast   (consolidation — diary text + summary)
gen_ai.chat deepseek/deepseek-chat-v4-fast   (soul reflection — soul + evolved text)
gen_ai.embeddings openai/text-embedding-3-small  (rag — input text + vectors)
```

Click any `gen_ai.*` span in Sentry Performance → **Data** tab to see the request body.

## Privacy
- `httpIntegration` strips `Authorization` headers automatically — API keys never reach Sentry
- Telegram message content WILL be in span data (intentional — user wants this for debugging)
- Set `tracesSampleRate: 0.1` in production to reduce volume if needed

## What is NOT instrumented inside the agent loop
The agent (`@earendil-works/pi-agent-core`) handles internal LLM calls and tool executions. These appear as generic HTTP spans, not as nested `gen_ai.chat`/`gen_ai.execute_tool` children of the `invoke_agent` span. To instrument those, we'd need to hook into `agent.subscribe()` events — possible but not included in this initial pass.
