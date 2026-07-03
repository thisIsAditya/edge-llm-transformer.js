# Local LLM Agent — HTTP API Backend

HTTP API backend for the [Local LLM Chat UI](../frontend). Provides streaming chat, conversation management, and persistent memory — powered by either a local Ollama model or Anthropic's Claude.

## Stack

| Component | Package | Version |
|-----------|---------|---------|
| HTTP server | `express` + `cors` | 5.x |
| AI orchestration | `ai` (Vercel AI SDK) | 7.x |
| Ollama provider | `ai-sdk-ollama` | 4.x |
| Anthropic provider | `@ai-sdk/anthropic` | 4.x |
| MCP client | `@ai-sdk/mcp` | 2.x |
| Database | PostgreSQL + pgvector | — |
| Schema validation | `zod` | 4.x |

## Setup

### 1. Prerequisites

- Node.js ≥ 22
- [Ollama](https://ollama.com) running locally
- PostgreSQL instance with the `vector` extension installed

```sql
-- Run once as a superuser on your target database:
CREATE EXTENSION IF NOT EXISTS vector;
```

### 2. Pull required Ollama models

```bash
# Chat model (replace with a tool-capable model for full functionality)
ollama pull erwan2/DeepSeek-R1-Distill-Qwen-1.5B

# Embedding model — must stay at 768 dims to match DB schema
ollama pull nomic-embed-text
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env with your DATABASE_URL, EXA_API_KEY, and model names
```

**To swap to Anthropic Claude** instead of local Ollama, set in `.env`:

```bash
MODEL_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-haiku-4-5-20251001   # or claude-sonnet-4-5-20250929
```

Embeddings always use Ollama (`nomic-embed-text`) regardless of `MODEL_PROVIDER`.

### 4. Install dependencies and run migrations

```bash
npm install
npm run db:migrate
```

### 5. Start the HTTP server

```bash
npm run dev   # listens on http://localhost:3210
```

The frontend (`../frontend`) connects to this server at port 3210.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | required | Postgres connection string |
| `EXA_API_KEY` | required | Exa web search API key |
| `MODEL_PROVIDER` | `ollama` | `ollama` or `anthropic` |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama host (ollama only) |
| `OLLAMA_MODEL` | `erwan2/DeepSeek-R1-Distill-Qwen-1.5B` | Ollama chat model |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Embedding model (always Ollama) |
| `ANTHROPIC_API_KEY` | — | Required when `MODEL_PROVIDER=anthropic` |
| `ANTHROPIC_MODEL` | `claude-haiku-4-5-20251001` | Anthropic chat model |
| `PORT` | `3210` | HTTP server port |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origin (frontend URL) |

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/conversations` | List all conversations |
| `POST` | `/api/conversations` | Create a new conversation |
| `GET` | `/api/conversations/:id/messages` | Get all messages for a conversation |
| `PATCH` | `/api/conversations/:id` | Rename a conversation |
| `DELETE` | `/api/conversations/:id` | Delete a conversation |
| `POST` | `/api/conversations/:id/chat` | Send a message; streams response via UI message protocol |
| `GET` | `/health` | Health check |

## Architecture

The agent uses a **Magentic-One-inspired orchestration** pattern:

- **Orchestrator** (`ToolLoopAgent`) maintains a `task_ledger` (plan + facts) and a `progress_ledger` (per-step outcome), delegating to:
  - A **Researcher sub-agent** that searches via the Exa MCP tool.
  - **Memory tools** (`memory_search`, `memory_save`) backed by pgvector.
- **Memory layers**:
  - *Working* — recent in-process turns, context-budget-capped.
  - *Episodic* — full turn log persisted to Postgres (`messages` table).
  - *Semantic* — distilled facts/summaries stored as pgvector embeddings, retrieved by cosine similarity before each model step.
- **Session cache** — one `ToolLoopAgent` + `WorkingMemory` per conversation, held in-process and keyed by conversation ID.
- **MCP Registry** — a pluggable map of named MCP clients. Adding a new MCP server requires only registering it in `src/mcp/registry.ts`; no orchestrator changes needed.

```
frontend (useChat)
  └─ POST /api/conversations/:id/chat
       └─ Orchestrator ToolLoopAgent (prepareStep: memory retrieval)
            ├─ tool: research  ──▶ Researcher sub-agent ──▶ McpRegistry ──▶ Exa MCP
            └─ tool: memory_search / memory_save ──▶ Postgres + pgvector
```

## Known Limitations

1. **Tool-calling is unreliable with `erwan2/DeepSeek-R1-Distill-Qwen-1.5B`.**  
   This model was distilled from Qwen2.5-Math and has no function-calling tokens in its Ollama chat template ([issue #8517](https://github.com/ollama/ollama/issues/8517)). Tool-dependent flows (research, memory save/search) will frequently fail or be ignored. **Swap `OLLAMA_MODEL` in `.env`** for a tool-capable model such as `qwen2.5`, `llama3.2`, or `MFDoom/deepseek-r1-tool-calling:1.5b` to unlock full functionality.

2. **Small context / weak instruction following.**  
   Memory and ledger content is budget-capped to leave room for responses. Multi-step JSON tool-argument quality is materially lower than with 7B+ models.

3. **No crash-safe step checkpointing.**  
   The `task_ledger` / `progress_ledger` tables provide basic audit/resumability, but not durable checkpointing. An in-flight orchestration loop does not survive process crashes.

4. **Exa MCP is a hosted, API-keyed dependency.**  
   This is the one non-local component. It is isolated behind `McpRegistry` and can be removed or replaced without touching orchestrator code.

5. **Embedding/model coupling.**  
   The `memory_items` table uses `vector(768)` columns fixed to `nomic-embed-text`'s output dimension. Changing embedding models requires a schema migration and re-embedding all stored memories.

6. **Prompt-injection risk from web search content.**  
   Exa search results flow into the model context unsanitized. Do not use this agent against adversarial search inputs in a privileged environment.

7. **No tool sandboxing.**  
   Exa search is read-only and safe by default. Any future write-capable MCP server must be wired through `toolApproval` in `orchestrator.agent.ts` before being trusted.

## Extending with additional MCP servers

```typescript
// In src/mcp/registry.ts — register any @ai-sdk/mcp-compatible client:
registry.register("my_server", new MyServerMcpClient());
```

Researcher sub-agent will pick up the new tools automatically on next start.
