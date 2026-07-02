import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type ModelKey = "asr" | "title" | "autocomplete" | "guard";

interface ModelState {
  status: "loading" | "ready" | "error";
  progress: number;
  label: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReadyPayload = any;

interface ModelsContextValue {
  workers: Record<ModelKey, Worker>;
  models: Record<ModelKey, ModelState>;
  /** Last "ready" message payload received per worker — lets late-mounting hooks catch up. */
  lastReadyMessage: Record<ModelKey, ReadyPayload | null>;
  allReady: boolean;
  overallProgress: number;
}

const ModelsContext = createContext<ModelsContextValue | null>(null);

const MODEL_LABELS: Record<ModelKey, string> = {
  asr: "Speech recognition",
  title: "Title generator",
  autocomplete: "Autocomplete",
  guard: "Safety guard",
};

function initialModels(): Record<ModelKey, ModelState> {
  return {
    asr: { status: "loading", progress: 0, label: MODEL_LABELS.asr },
    title: { status: "loading", progress: 0, label: MODEL_LABELS.title },
    autocomplete: { status: "loading", progress: 0, label: MODEL_LABELS.autocomplete },
    guard: { status: "loading", progress: 0, label: MODEL_LABELS.guard },
  };
}

export function ModelsProvider({ children }: { children: ReactNode }) {
  const [models, setModels] = useState<Record<ModelKey, ModelState>>(initialModels);
  const lastReadyRef = useRef<Record<ModelKey, ReadyPayload | null>>({
    asr: null,
    title: null,
    autocomplete: null,
    guard: null,
  });
  const workersRef = useRef<Record<ModelKey, Worker> | null>(null);

  /**
   * `new Worker(new URL(...), opts)` must appear literally so Vite bundles each worker
   * as its own chunk.
   */
  if (!workersRef.current) {
    workersRef.current = {
      asr: new Worker(new URL("../workers/asrWorker.ts", import.meta.url), { type: "module" }),
      title: new Worker(new URL("../workers/titleWorker.ts", import.meta.url), { type: "module" }),
      autocomplete: new Worker(new URL("../workers/autocompleteWorker.ts", import.meta.url), { type: "module" }),
      guard: new Worker(new URL("../workers/guardWorker.ts", import.meta.url), { type: "module" }),
    };
  }
  const workers = workersRef.current;

  useEffect(() => {
    const cleanups: Array<() => void> = [];

    (Object.keys(workers) as ModelKey[]).forEach((key) => {
      const worker = workers[key];
      const handler = (e: MessageEvent<{ status: string; progress?: number }>) => {
        const { status, progress } = e.data;
        if (status === "loading") {
          setModels((prev) => ({ ...prev, [key]: { ...prev[key], status: "loading", progress: Math.round(progress ?? 0) } }));
        } else if (status === "ready") {
          lastReadyRef.current[key] = e.data;
          setModels((prev) => ({ ...prev, [key]: { ...prev[key], status: "ready", progress: 100 } }));
        } else if (status === "error") {
          setModels((prev) => ({ ...prev, [key]: { ...prev[key], status: "error" } }));
        }
      };
      worker.addEventListener("message", handler);
      worker.postMessage({ type: "load" });
      cleanups.push(() => worker.removeEventListener("message", handler));
    });

    return () => cleanups.forEach((fn) => fn());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const modelKeys = Object.keys(models) as ModelKey[];
  const allReady = modelKeys.every((k) => models[k].status !== "loading");
  const overallProgress = Math.round(
    modelKeys.reduce((sum, k) => sum + (models[k].status === "ready" ? 100 : models[k].progress), 0) /
      modelKeys.length
  );

  const value: ModelsContextValue = {
    workers,
    models,
    lastReadyMessage: lastReadyRef.current,
    allReady,
    overallProgress,
  };

  return <ModelsContext.Provider value={value}>{children}</ModelsContext.Provider>;
}

export function useModelsContext(): ModelsContextValue {
  const ctx = useContext(ModelsContext);
  if (!ctx) throw new Error("useModelsContext must be used within a ModelsProvider");
  return ctx;
}
