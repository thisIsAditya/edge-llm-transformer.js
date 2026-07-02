import { pipeline, env } from "@huggingface/transformers";

env.allowLocalModels = false;

/**
 * Community ONNX export of meta-llama/Llama-Prompt-Guard-2-86M.
 * Files live at the repo root (not `onnx/`), so load with `subfolder: ""` and `model_file_name`.
 */
const MODEL_ID = "gravitee-io/Llama-Prompt-Guard-2-86M-onnx";
const MODEL_FILE_NAME = "model.quant";
const MALICIOUS_LABEL = "MALICIOUS";

const FALLBACK_MAX_TOKENS = 512;
const CHUNK_OVERLAP_TOKENS = 24;

/** Cap batch size so one forward pass stays within WASM memory limits. */
const MAX_CHUNKS_PER_BATCH = 6;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let classifier: any = null;
let isLoading = false;
let maxTokens = FALLBACK_MAX_TOKENS;

type OutMessage =
  | { status: "loading"; progress: number; file: string }
  | { status: "ready" }
  | { status: "complete"; requestId: number; label: string; score: number }
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
  if (classifier || isLoading) return;
  isLoading = true;
  try {
    /**
     * WASM defaults to q8 and resolves `model.quant_quantized.onnx`.
     * Use fp32 (empty suffix) so the file is `model.quant.onnx`.
     */
    classifier = await pipeline("text-classification", MODEL_ID, {
      subfolder: "",
      model_file_name: MODEL_FILE_NAME,
      dtype: "fp32",
      device: "wasm",
      progress_callback: progressCallback,
    });

    const configuredMax = classifier?.model?.config?.max_position_embeddings;
    if (typeof configuredMax === "number" && configuredMax > 0) {
      maxTokens = configuredMax;
    }

    post({ status: "ready" });
  } catch (err) {
    post({ status: "error", error: String(err) });
  } finally {
    isLoading = false;
  }
}

/** Splits `text` into token-bounded, slightly-overlapping chunks sized to the model's context window. */
function chunkText(text: string): string[] {
  const tokenizer = classifier.tokenizer;
  const ids: number[] = tokenizer.encode(text);

  const usableLength = Math.max(32, maxTokens - 8);
  if (ids.length <= usableLength) return [text];

  const chunks: string[] = [];
  const stride = usableLength - CHUNK_OVERLAP_TOKENS;
  for (let start = 0; start < ids.length; start += stride) {
    const slice = ids.slice(start, start + usableLength);
    chunks.push(tokenizer.decode(slice, { skip_special_tokens: true }));
    if (start + usableLength >= ids.length) break;
  }
  return chunks;
}

interface ClassificationResult {
  label: string;
  score: number;
}

async function classifyChunks(chunks: string[]): Promise<ClassificationResult> {
  let worstMaliciousProb = 0;

  for (let i = 0; i < chunks.length; i += MAX_CHUNKS_PER_BATCH) {
    const batch = chunks.slice(i, i + MAX_CHUNKS_PER_BATCH);
    const raw = (await classifier(batch)) as ClassificationResult[] | ClassificationResult[][];
    const flat: ClassificationResult[] = Array.isArray(raw[0])
      ? (raw as ClassificationResult[][]).map((r) => r[0]!)
      : (raw as ClassificationResult[]);

    for (const r of flat) {
      const maliciousProb = r.label === MALICIOUS_LABEL ? r.score : 1 - r.score;
      if (maliciousProb > worstMaliciousProb) worstMaliciousProb = maliciousProb;
    }
  }

  return {
    label: worstMaliciousProb >= 0.5 ? MALICIOUS_LABEL : "BENIGN",
    score: worstMaliciousProb,
  };
}

type InMessage =
  | { type: "load" }
  | { type: "classify"; text: string; requestId: number };

self.addEventListener("message", async (e: MessageEvent<InMessage>) => {
  const msg = e.data;

  if (msg.type === "load") {
    await loadModel();
    return;
  }

  if (msg.type === "classify") {
    const { text, requestId } = msg;
    if (!classifier) {
      post({ status: "error", error: "Model not loaded", requestId });
      return;
    }

    try {
      const chunks = chunkText(text);
      const result = await classifyChunks(chunks);
      post({ status: "complete", requestId, label: result.label, score: result.score });
    } catch (err) {
      post({ status: "error", error: String(err), requestId });
    }
  }
});
