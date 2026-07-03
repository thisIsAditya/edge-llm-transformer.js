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

/** Strip markdown syntax and excessive whitespace from a string. */
function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s*/g, "")
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*>]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "be",
  "been", "being", "in", "on", "at", "for", "to", "of", "with", "by", "from",
  "up", "about", "into", "over", "after", "what", "how", "why", "who",
  "which", "this", "that", "these", "those", "it", "as", "if", "then",
  "than", "so", "do", "does", "did", "can", "could", "should", "would",
  "will", "shall", "may", "might", "must", "you", "your", "please",
]);

function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
  );
}

/**
 * flan-t5-small occasionally hallucinates a title unrelated to the input,
 * especially with rare proper nouns (place names, brands). Reject titles
 * that share no meaningful words with the source text.
 */
function isGrounded(title: string, source: string): boolean {
  const sourceWords = significantWords(source);
  if (sourceWords.size === 0) return true;

  const titleWords = significantWords(title);
  for (const tw of titleWords) {
    if (sourceWords.has(tw)) return true;
    for (const sw of sourceWords) {
      if (sw.includes(tw) || tw.includes(sw)) return true;
    }
  }
  return false;
}

/** Derives a title directly from the source text when the model output is unusable. */
function fallbackTitle(clean: string): string {
  const words = clean.split(/\s+/).filter(Boolean).slice(0, 6);
  let title = words.join(" ").replace(/[?!.,;:]+$/, "");
  if (title) title = title[0]!.toUpperCase() + title.slice(1);
  return title.slice(0, 60);
}

async function runGenerate({ text, requestId }: GenerateRequest) {
  try {
    const clean = stripMarkdown(text).slice(0, 120);
    const prompt = `Write a short, clear title (5 words or fewer) for this message: "${clean}"`;
    const result = await generator(prompt, {
      max_new_tokens: 16,
      num_beams: 4,
      early_stopping: true,
      no_repeat_ngram_size: 2,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any[];
    const raw: string = result[0]?.generated_text ?? "";
    let title = raw.replace(/["]/g, "").replace(/[.!?]+$/, "").replace(/\s+/g, " ").trim();

    const grounded = isGrounded(title, clean);
    console.group("[TitleWorker] Generation");
    console.log("input:", clean);
    console.log("raw model output:", JSON.stringify(raw));
    console.log("grounded in source:", grounded);
    console.groupEnd();

    if (!title || !grounded) {
      const fallback = fallbackTitle(clean);
      console.warn("[TitleWorker] Rejected ungrounded/empty title — using fallback:", fallback);
      title = fallback;
    }

    post({ status: "complete", title: title || clean.slice(0, 60), requestId });
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
