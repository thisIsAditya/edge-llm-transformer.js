import { createOllama } from "ai-sdk-ollama";
import { wrapLanguageModel, extractReasoningMiddleware } from "ai-sdk-ollama";
import type { LanguageModelV2 } from "@ai-sdk/provider";
import { env } from "../config/env.js";

function createProvider() {
  /** ai-sdk-ollama appends `/api/*` internally — baseURL must be the bare host. */
  return createOllama({ baseURL: env.OLLAMA_BASE_URL });
}

/**
 * Returns the chat language model for the configured OLLAMA_MODEL.
 * DeepSeek-R1 outputs reasoning wrapped in <think>…</think> tags;
 * the extractReasoningMiddleware strips them into a separate field so the
 * ToolLoopAgent never sees raw thinking tokens as response text.
 */
export function getChatModel(): LanguageModelV2 {
  const provider = createProvider();
  const base = provider(env.OLLAMA_MODEL, {
    options: { num_ctx: 8192 },
  });

  return wrapLanguageModel({
    model: base,
    middleware: extractReasoningMiddleware({ tagName: "think" }),
  }) as unknown as LanguageModelV2;
}

/**
 * Returns the embedding model for the configured OLLAMA_EMBED_MODEL.
 * nomic-embed-text (768-dim) is the default and matches the DB schema.
 */
export function getEmbeddingModel() {
  const provider = createProvider();
  return provider.embeddingModel(env.OLLAMA_EMBED_MODEL);
}
