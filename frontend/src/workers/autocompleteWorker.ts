import { pipeline, env } from "@huggingface/transformers";

env.allowLocalModels = false;

/** Plain causal LM — continues text instead of answering (no chat template). */
const MODEL_ID = "Xenova/distilgpt2";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let generator: any = null;
let isLoading = false;

type OutMessage =
  | { status: "loading"; progress: number; file: string }
  | { status: "ready" }
  | { status: "complete"; suggestion: string; requestId: number }
  | { status: "error"; error: string };

function post(msg: OutMessage) {
  self.postMessage(msg);
}

function progressCallback(p: { status: string; file?: string; progress?: number }) {
  if (p.status === "progress") {
    post({ status: "loading", progress: p.progress ?? 0, file: p.file ?? "" });
  }
}

async function loadModel() {
  if (generator || isLoading) return;
  isLoading = true;
  try {
    generator = await pipeline("text-generation", MODEL_ID, {
      device: "wasm",
      dtype: "q8",
      progress_callback: progressCallback,
    });
    post({ status: "ready" });
  } catch (err) {
    post({ status: "error", error: String(err) });
  } finally {
    isLoading = false;
  }
}

const MAX_CONTEXT_CHARS = 500;

type InMessage =
  | { type: "load" }
  | { type: "complete"; text: string; context?: string; requestId: number };

self.addEventListener("message", async (e: MessageEvent<InMessage>) => {
  const msg = e.data;

  if (msg.type === "load") {
    await loadModel();
    return;
  }

  if (msg.type === "complete") {
    const { text, context, requestId } = msg;
    if (!generator) return;

    const contextPrefix = context
      ? context.slice(-MAX_CONTEXT_CHARS) + "\n\n"
      : "";
    const prompt = contextPrefix + text;

    try {
      const result = await generator(prompt, {
        max_new_tokens: 12,
        do_sample: false,
        repetition_penalty: 1.3,
        no_repeat_ngram_size: 3,
        truncation: true,
      }) as { generated_text: string }[];

      const fullText: string = result[0]?.generated_text ?? "";
      let suggestion = fullText.slice(prompt.length);

      const breakAt = suggestion.search(/[.!?\n]/);
      suggestion = breakAt !== -1 && breakAt < 50 ? suggestion.slice(0, breakAt + 1) : suggestion.slice(0, 50);

      const trimmed = suggestion.trimEnd();
      if (!trimmed) return;

      post({ status: "complete", suggestion: trimmed, requestId });
    } catch (err) {
      post({ status: "error", error: String(err) });
    }
  }
});
