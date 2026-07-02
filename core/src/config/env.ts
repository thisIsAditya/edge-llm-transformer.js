import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().default("erwan2/DeepSeek-R1-Distill-Qwen-1.5B"),
  OLLAMA_EMBED_MODEL: z.string().default("nomic-embed-text"),
  EXA_API_KEY: z.string().min(1),
  MAX_STEPS: z.coerce.number().int().min(1).max(50).default(15),
  MEMORY_TOP_K: z.coerce.number().int().min(1).max(20).default(5),
  CONSOLIDATION_INTERVAL: z.coerce.number().int().min(5).default(20),
  PORT: z.coerce.number().int().min(1).max(65535).default(3210),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
});

function loadEnv() {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error("[env] Missing or invalid environment variables:");
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
export type Env = typeof env;
