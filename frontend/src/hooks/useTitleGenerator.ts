import { useRef, useEffect, useCallback } from "react";
import { useModelsContext } from "../context/ModelsContext.js";

type WorkerMessage =
  | { status: "loading"; progress: number; file: string }
  | { status: "ready" }
  | { status: "complete"; title: string; requestId: number }
  | { status: "error"; error: string; requestId: number };

interface PendingCallback {
  resolve: (title: string | null) => void;
}

export function useTitleGenerator() {
  const { workers } = useModelsContext();
  const worker = workers.title;
  const pendingRef = useRef<Map<number, PendingCallback>>(new Map());
  const reqIdRef = useRef(0);

  useEffect(() => {
    const handler = (e: MessageEvent<WorkerMessage>) => {
      const msg = e.data;

      if (msg.status === "complete") {
        const cb = pendingRef.current.get(msg.requestId);
        if (cb) {
          pendingRef.current.delete(msg.requestId);
          cb.resolve(msg.title || null);
        }
        return;
      }

      if (msg.status === "error" && "requestId" in msg) {
        const cb = pendingRef.current.get(msg.requestId);
        if (cb) {
          pendingRef.current.delete(msg.requestId);
          cb.resolve(null);
        }
        console.warn("[TitleWorker] error:", msg.error);
      }
    };

    worker.addEventListener("message", handler);
    return () => {
      worker.removeEventListener("message", handler);
      pendingRef.current.forEach((cb) => cb.resolve(null));
      pendingRef.current.clear();
    };
  }, [worker]);

  const generateTitle = useCallback(
    (text: string): Promise<string | null> => {
      return new Promise((resolve) => {
        const requestId = ++reqIdRef.current;
        pendingRef.current.set(requestId, { resolve });
        worker.postMessage({ type: "generate", text, requestId });
      });
    },
    [worker]
  );

  return { generateTitle };
}
