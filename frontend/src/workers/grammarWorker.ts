import { pipeline, env } from "@huggingface/transformers";
import { diffWords } from "../lib/wordDiff.js";
import type { ErrorSpan } from "../lib/wordDiff.js";

env.allowLocalModels = false;

const MODEL_ID = "Xenova/t5-base-grammar-correction";

const FALLBACK_MAX_TOKENS = 480;
const MAX_BATCHES_PER_RUN = 6;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let generator: any = null;
let modelReady = false;
let modelLoading = false;
let maxInputTokens = FALLBACK_MAX_TOKENS;

type OutMessage =
  | { status: "loading"; progress: number; file: string }
  | { status: "ready" }
  | { status: "complete"; requestId: number; correctedText: string; errors: ErrorSpan[] }
  | { status: "error"; error: string; requestId?: number };

function post(msg: OutMessage) {
  self.postMessage(msg);
}

function progressCallback(p: { status: string; file?: string; progress?: number }) {
  if (p.status === "progress") {
    post({ status: "loading", progress: p.progress ?? 0, file: p.file ?? "" });
  }
}

async function loadModel() {
  if (modelLoading || modelReady) return;
  modelLoading = true;
  try {
    generator = await pipeline("text2text-generation", MODEL_ID, {
      device: "wasm",
      dtype: "q8",
      progress_callback: progressCallback,
    });

    const configuredMax = generator?.model?.config?.max_position_embeddings;
    if (typeof configuredMax === "number" && configuredMax > 0) {
      maxInputTokens = Math.min(configuredMax - 16, FALLBACK_MAX_TOKENS);
    }

    modelReady = true;
    post({ status: "ready" });
  } catch (err) {
    post({ status: "error", error: String(err) });
  } finally {
    modelLoading = false;
  }
}

function splitIntoBatches(text: string): string[] {
  if (!generator?.tokenizer) return [text];

  const sentenceRe = /[^.!?\n]+(?:[.!?\n]+|$)/g;
  const sentences: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = sentenceRe.exec(text)) !== null) {
    if (m[0].trim()) sentences.push(m[0]);
  }
  if (sentences.length === 0) return [text];

  const batches: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const candidate = current ? current + sentence : sentence;
    const tokenCount: number = generator.tokenizer.encode(candidate).length;

    if (tokenCount <= maxInputTokens) {
      current = candidate;
    } else {
      if (current) batches.push(current);
      current = sentence;
    }
  }
  if (current) batches.push(current);

  return batches;
}

async function correctText(text: string, requestId: number): Promise<void> {
  const batches = splitIntoBatches(text);

  const allErrors: ErrorSpan[] = [];
  let correctedText = "";
  let originalOffset = 0;

  for (let i = 0; i < batches.length; i += MAX_BATCHES_PER_RUN) {
    const chunk = batches.slice(i, i + MAX_BATCHES_PER_RUN);

    for (const batch of chunk) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await generator(batch, { max_new_tokens: 128 }) as any[];
      const correctedBatch: string = result[0]?.generated_text ?? batch;

      const batchErrors = diffWords(batch, correctedBatch);

      for (const err of batchErrors) {
        allErrors.push({
          ...err,
          start: err.start + originalOffset,
          end: err.end + originalOffset,
        });
      }

      correctedText += correctedBatch;
      originalOffset += batch.length;
    }
  }

  post({ status: "complete", requestId, correctedText, errors: allErrors });
}

type InMessage =
  | { type: "load" }
  | { type: "check"; text: string; requestId: number };

self.addEventListener("message", async (e: MessageEvent<InMessage>) => {
  const msg = e.data;

  if (msg.type === "load") {
    await loadModel();
    return;
  }

  if (msg.type === "check") {
    if (!generator || !modelReady) {
      post({ status: "error", error: "Model not loaded", requestId: msg.requestId });
      return;
    }
    try {
      await correctText(msg.text, msg.requestId);
    } catch (err) {
      post({ status: "error", error: String(err), requestId: msg.requestId });
    }
  }
});
