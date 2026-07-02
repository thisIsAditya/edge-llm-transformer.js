import { useEffect, useRef, useCallback } from "react";
import { useModelsContext } from "../context/ModelsContext.js";
import { maskCredentials } from "../lib/credentialScanner.js";

/** Prefer false blocks over false positives — a miss is less disruptive than blocking valid input. */
const INJECTION_THRESHOLD = 0.6;

type WorkerMessage =
  | { status: "loading"; progress: number; file: string }
  | { status: "ready" }
  | { status: "complete"; requestId: number; label: string; score: number }
  | { status: "error"; error: string; requestId?: number };

export interface PromptGuardResult {
  /** Text with any detected credentials replaced by [REDACTED:...] markers. */
  maskedText: string;
  /** Human-readable labels of credential types found (empty if none). */
  credentialsFound: string[];
  /** True if the message should NOT be sent (flagged as malicious intent). */
  blocked: boolean;
  /** Raw injection probability (0-1) from the classifier. */
  injectionScore: number;
}

export function usePromptGuard() {
  const { workers } = useModelsContext();
  const worker = workers.guard;
  const reqIdRef = useRef(0);
  const pendingRef = useRef<Map<number, (r: { label: string; score: number } | null) => void>>(new Map());

  useEffect(() => {
    const handler = (e: MessageEvent<WorkerMessage>) => {
      const msg = e.data;

      if (msg.status === "complete") {
        const cb = pendingRef.current.get(msg.requestId);
        if (cb) {
          pendingRef.current.delete(msg.requestId);
          cb({ label: msg.label, score: msg.score });
        }
        return;
      }

      if (msg.status === "error" && typeof msg.requestId === "number") {
        const cb = pendingRef.current.get(msg.requestId);
        if (cb) {
          pendingRef.current.delete(msg.requestId);
          cb(null);
        }
        console.warn("[GuardWorker] error:", msg.error);
      }
    };

    worker.addEventListener("message", handler);
    return () => {
      worker.removeEventListener("message", handler);
      pendingRef.current.forEach((cb) => cb(null));
      pendingRef.current.clear();
    };
  }, [worker]);

  const classify = useCallback(
    (text: string): Promise<{ label: string; score: number } | null> => {
      return new Promise((resolve) => {
        const requestId = ++reqIdRef.current;
        pendingRef.current.set(requestId, resolve);
        worker.postMessage({ type: "classify", text, requestId });
      });
    },
    [worker]
  );

  const checkPrompt = useCallback(
    async (text: string): Promise<PromptGuardResult> => {
      const { masked, found } = maskCredentials(text);
      const result = await classify(masked);

      /** Fail open on classifier errors; credential masking still ran. */
      const injectionScore = result?.score ?? 0;
      const blocked = result !== null && result.label === "MALICIOUS" && injectionScore >= INJECTION_THRESHOLD;

      return { maskedText: masked, credentialsFound: found, blocked, injectionScore };
    },
    [classify]
  );

  return { checkPrompt };
}
