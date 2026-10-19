// eslint-disable-next-line @typescript-eslint/no-explicit-any
const viteEnv = ((import.meta as any).env ?? {}) as Record<string, string | undefined>;

export const API_BASE_URL = viteEnv.VITE_API_BASE_URL ?? "http://localhost:3210";

/** Defaults to the stock ONNX Whisper on the Hugging Face Hub. */
export const ASR_MODEL_ID = viteEnv.VITE_ASR_MODEL_ID || "onnx-community/whisper-base.en";

/** When true, `ASR_MODEL_ID` is resolved from `/models/<id>` (frontend/public/models) before the Hub. */
export const ASR_LOCAL_MODELS = viteEnv.VITE_ASR_LOCAL_MODELS === "true";
