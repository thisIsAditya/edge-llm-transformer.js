import { useState, useEffect, useRef, useCallback } from "react";
import { useModelsContext } from "../context/ModelsContext.js";
import type { ErrorSpan } from "../lib/wordDiff.js";

const DEBOUNCE_MS = 600;
const MIN_LENGTH = 8;

type WorkerMessage =
  | { status: "loading"; progress: number; file: string }
  | { status: "ready" }
  | { status: "complete"; requestId: number; correctedText: string; errors: ErrorSpan[] }
  | { status: "error"; error: string; requestId?: number };

export interface UseGrammarCheckReturn {
  errors: ErrorSpan[];
  isChecking: boolean;
  applyFix: (index: number, currentValue: string, onChange: (v: string) => void) => void;
  applyAll: (currentValue: string, onChange: (v: string) => void) => void;
  dismiss: (index: number) => void;
}

export function useGrammarCheck(value: string, enabled: boolean): UseGrammarCheckReturn {
  const { workers, lastReadyMessage } = useModelsContext();
  const worker = workers.grammar;
  const isReady = !!lastReadyMessage.grammar;

  const [errors, setErrors] = useState<ErrorSpan[]>([]);
  const [isChecking, setIsChecking] = useState(false);

  const reqIdRef = useRef(0);
  const currentReqRef = useRef(0);
  const checkedTextRef = useRef("");

  useEffect(() => {
    const handler = (e: MessageEvent<WorkerMessage>) => {
      const msg = e.data;
      if (msg.status === "complete") {
        if (msg.requestId !== currentReqRef.current) return;
        if (checkedTextRef.current !== value) {
          setIsChecking(false);
          return;
        }
        setErrors(msg.errors);
        setIsChecking(false);
        return;
      }
      if (msg.status === "error") {
        console.warn("[GrammarCheck] Worker error:", msg.error);
        setIsChecking(false);
      }
    };
    worker.addEventListener("message", handler);
    return () => worker.removeEventListener("message", handler);
  }, [worker, value]);

  useEffect(() => {
    if (!enabled || !isReady || value.length < MIN_LENGTH) {
      setErrors([]);
      setIsChecking(false);
      return;
    }

    setErrors([]);

    const timer = setTimeout(() => {
      const reqId = ++reqIdRef.current;
      currentReqRef.current = reqId;
      checkedTextRef.current = value;
      setIsChecking(true);
      worker.postMessage({ type: "check", text: value, requestId: reqId });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [value, enabled, isReady, worker]);

  const applyFix = useCallback(
    (index: number, currentValue: string, onChange: (v: string) => void) => {
      setErrors((prev) => {
        const err = prev[index];
        if (!err) return prev;
        const next =
          currentValue.slice(0, err.start) +
          err.suggestion +
          currentValue.slice(err.end);
        const delta = err.suggestion.length - (err.end - err.start);
        onChange(next);
        return prev
          .filter((_, i) => i !== index)
          .map((e) =>
            e.start >= err.end
              ? { ...e, start: e.start + delta, end: e.end + delta }
              : e
          );
      });
    },
    []
  );

  const applyAll = useCallback(
    (currentValue: string, onChange: (v: string) => void) => {
      setErrors((prev) => {
        if (prev.length === 0) return prev;
        const sorted = [...prev].sort((a, b) => b.start - a.start);
        let result = currentValue;
        for (const err of sorted) {
          result =
            result.slice(0, err.start) + err.suggestion + result.slice(err.end);
        }
        onChange(result);
        return [];
      });
    },
    []
  );

  const dismiss = useCallback((index: number) => {
    setErrors((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return { errors, isChecking, applyFix, applyAll, dismiss };
}
