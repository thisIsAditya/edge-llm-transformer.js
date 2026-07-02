# Local LLM Chat with Voice Input

A Claude-style chat UI backed by a local LLM (Ollama) with in-browser speech recognition via Transformers.js (Whisper).

## Architecture

```
Local_LLM/
  frontend/   — React + TypeScript + Tailwind + Vite (port 5173)
  core/       — Node.js + Express HTTP API (port 3210)
```

The frontend is the only thing the user opens. `core/` is the backend.

## Features

- **Chat history sidebar** — conversations persisted in Postgres, listed like Claude
- **Streaming responses** — assistant tokens stream in real-time via Vercel AI SDK
- **Voice input** — mic button transcribes speech with Whisper (WebGPU or WASM) entirely in-browser; transcribed text is inserted into the composer for review before sending
- **Memory** — pgvector semantic memory + episodic message store across sessions
- **Web research** — orchestrator can delegate to a researcher sub-agent using Exa

## Prerequisites

- Node.js 22+
- Ollama running locally with the configured models
- PostgreSQL with pgvector
- Exa API key
- Chromium-based browser (Chrome 113+ for WebGPU; falls back to WASM on others)

## Setup

### 1. Backend (`core/`)

```bash
cd core
cp .env.example .env   # fill in DATABASE_URL, EXA_API_KEY, OLLAMA_* vars
npm install
npm run db:migrate
npm run dev            # starts Express API on http://localhost:3210
```

See [core/README.md](./core/README.md) for API details, architecture, and known limitations.

### 2. Frontend (`frontend/`)

```bash
cd frontend
npm install
npm run dev            # starts Vite on http://localhost:5173
```

Open http://localhost:5173 in your browser.

## Environment Variables (`core/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | required | Postgres connection string |
| `EXA_API_KEY` | required | Exa web search API key |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama host |
| `OLLAMA_MODEL` | `erwan2/DeepSeek-R1-Distill-Qwen-1.5B` | Chat model |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Embedding model |
| `PORT` | `3210` | HTTP server port |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origin |

## Voice Input

On first load, the Whisper model (~80 MB WASM / ~160 MB WebGPU) downloads from Hugging Face and is cached in the browser. After that, it loads instantly.

Click the mic button in the composer to start recording. Click again to stop. The transcribed text is placed in the text box for you to edit before sending.
