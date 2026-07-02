import { pipeline, env } from "@huggingface/transformers";

env.allowLocalModels = false;

const MODEL_ID = "Xenova/flan-t5-small";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let generator: any = null;
let modelReady = false;
let modelLoading = false;

type GenerateRequest = { text: string; requestId: number };
const queue: GenerateRequest[] = [];

type OutMessage =
  | { status: "loading"; progress: number; file: string }
  | { status: "ready" }
  | { status: "complete"; title: string; requestId: number }
  | { status: "error"; error: string; requestId: number };

function post(msg: OutMessage) {
  self.postMessage(msg);
}

function progressCallback(p: { status: string; file?: string; progress?: number }) {
  if (p.status === "progress") {
    post({ status: "loading", progress: p.progress ?? 0, file: p.file ?? "" });
  }
}

async function runGenerate({ text, requestId }: GenerateRequest) {
  try {
    const prompt = `Write a short 5-word title for this message: ${text.slice(0, 300)}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await generator(prompt, { max_new_tokens: 15, do_sample: false }) as any[];
    const raw: string = result[0]?.generated_text ?? "";
    const title = raw.replace(/[.!?]+$/, "").replace(/\s+/g, " ").trim();
    post({ status: "complete", title: title || text.slice(0, 60), requestId });
  } catch (err) {
    post({ status: "error", error: String(err), requestId });
  }
}

async function loadModel() {
  if (modelLoading || modelReady) return;
  modelLoading = true;
  try {
    generator = await pipeline("text2text-generation", MODEL_ID, {
      device: "wasm",
      dtype: "q8" as const,
      progress_callback: progressCallback,
    });
    modelReady = true;
    post({ status: "ready" });

    for (const req of queue.splice(0)) {
      await runGenerate(req);
    }
  } catch (err) {
    post({ status: "error", error: String(err), requestId: -1 });
  } finally {
    modelLoading = false;
  }
}

type InMessage =
  | { type: "load" }
  | { type: "generate"; text: string; requestId: number };

self.addEventListener("message", async (e: MessageEvent<InMessage>) => {
  const msg = e.data;

  if (msg.type === "load") {
    await loadModel();
    return;
  }

  if (msg.type === "generate") {
    if (!modelReady) {
      queue.push({ text: msg.text, requestId: msg.requestId });
      if (!modelLoading) loadModel();
      return;
    }
    await runGenerate({ text: msg.text, requestId: msg.requestId });
  }
});
