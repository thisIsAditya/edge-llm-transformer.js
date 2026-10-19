import { pipeline, env } from "@huggingface/transformers";
import { ASR_LOCAL_MODELS, ASR_MODEL_ID } from "../lib/config.js";

env.allowLocalModels = ASR_LOCAL_MODELS;

const MODEL_ID = ASR_MODEL_ID;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let transcriber: any = null;
let isLoading = false;

type ProgressMessage =
  | { status: "loading"; file: string; loaded: number; total: number; progress: number }
  | { status: "info"; message: string }
  | { status: "ready"; device: string }
  | { status: "transcribing" }
  | { status: "complete"; text: string }
  | { status: "error"; error: string };

function postMsg(msg: ProgressMessage) {
  self.postMessage(msg);
}

function progressForwarder(progress: { status: string; file?: string; loaded?: number; total?: number; progress?: number }) {
  if (progress.status === "progress") {
    postMsg({
      status: "loading",
      file: progress.file ?? "",
      loaded: progress.loaded ?? 0,
      total: progress.total ?? 0,
      progress: progress.progress ?? 0,
    });
  }
}

function dtypeFor(device: string) {
  return device === "webgpu"
    ? { encoder_model: "fp16" as const, decoder_model_merged: "fp16" as const }
    : { encoder_model: "q8" as const, decoder_model_merged: "q8" as const };
}

async function createPipeline(device: string) {
  return pipeline("automatic-speech-recognition", MODEL_ID, {
    device: device as "webgpu" | "wasm",
    dtype: dtypeFor(device),
    progress_callback: progressForwarder,
  });
}

async function loadModel() {
  if (transcriber || isLoading) return;
  isLoading = true;

  const hasWebGpu = typeof navigator !== "undefined" && !!navigator.gpu;
  let device = hasWebGpu ? "webgpu" : "wasm";

  try {
    try {
      transcriber = await createPipeline(device);
    } catch (err) {
      if (device === "webgpu") {
        /** WebGPU init can fail on unsupported GPUs — retry on WASM. */
        postMsg({ status: "info", message: `WebGPU failed (${err instanceof Error ? err.message : String(err)}), falling back to WASM` });
        device = "wasm";
        transcriber = await createPipeline(device);
      } else {
        throw err;
      }
    }
    postMsg({ status: "ready", device });
  } finally {
    isLoading = false;
  }
}

self.addEventListener("message", async (event: MessageEvent<{ type: string; audio?: Float32Array }>) => {
  const { type, audio } = event.data;

  if (type === "load") {
    try {
      await loadModel();
    } catch (err) {
      postMsg({ status: "error", error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (type === "transcribe") {
    if (!transcriber) {
      postMsg({ status: "error", error: "Model not loaded yet" });
      return;
    }

    if (!audio) {
      postMsg({ status: "error", error: "No audio data provided" });
      return;
    }

    try {
      postMsg({ status: "transcribing" });
      const result = await transcriber(audio, { return_timestamps: false }) as { text: string };
      postMsg({ status: "complete", text: result.text.trim() });
    } catch (err) {
      postMsg({ status: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }
});
