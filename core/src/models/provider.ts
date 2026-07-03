import { createAnthropic } from "@ai-sdk/anthropic";
import { createOllama, wrapLanguageModel, extractReasoningMiddleware } from "ai-sdk-ollama";
import type { LanguageModelV2 } from "@ai-sdk/provider";
import { env } from "../config/env.js";

/**
 * Returns the chat language model selected by MODEL_PROVIDER.
 *
 * ollama — local inference via Ollama; DeepSeek-R1 reasoning tags are stripped
 *          by extractReasoningMiddleware so ToolLoopAgent never sees raw <think> tokens.
 * anthropic — Claude via the Anthropic API; no middleware needed as the SDK
 *             handles reasoning natively.
 */
export function getChatModel(): LanguageModelV2 {
  if (env.MODEL_PROVIDER === "anthropic") {
    const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
    return anthropic(env.ANTHROPIC_MODEL) as unknown as LanguageModelV2;
  }

  const ollama = createOllama({ baseURL: env.OLLAMA_BASE_URL });
  const base = ollama(env.OLLAMA_MODEL, { options: { num_ctx: 8192 } });

  return wrapLanguageModel({
    model: base,
    middleware: extractReasoningMiddleware({ tagName: "think" }),
  }) as unknown as LanguageModelV2;
}

/**
 * Returns the embedding model. Always uses Ollama — Anthropic provides no
 * embeddings API, and the DB schema is fixed to 768-dim (nomic-embed-text).
 */
export function getEmbeddingModel() {
  const ollama = createOllama({ baseURL: env.OLLAMA_BASE_URL });
  return ollama.embeddingModel(env.OLLAMA_EMBED_MODEL);
}
