import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    port: 5173,
    /** SharedArrayBuffer for ONNX Runtime WASM threading. */
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  /** Transformers.js ships ESM — skip pre-bundling. */
  optimizeDeps: {
    exclude: ["@huggingface/transformers"],
  },
});
