import { useState, useEffect, useRef, useCallback } from "react";
import { useModelsContext } from "../context/ModelsContext.js";

const DEBOUNCE_MS = 400;
const MIN_LENGTH = 8;

type WorkerMessage =
  | { status: "loading"; progress: number; file: string }
  | { status: "ready" }
  | { status: "complete"; suggestion: string; requestId: number }
  | { status: "error"; error: string };

interface UseAutocompleteOptions {
  value: string;
  enabled: boolean;
  context?: string;
}

export interface UseAutocompleteReturn {
  suggestion: string;
  accept: (currentValue: string, onChange: (v: string) => void) => void;
  dismiss: () => void;
}

export function useAutocomplete({ value, enabled, context }: UseAutocompleteOptions): UseAutocompleteReturn {
  const { workers, lastReadyMessage } = useModelsContext();
  const worker = workers.autocomplete;
  const isReady = !!lastReadyMessage.autocomplete;

  const [suggestion, setSuggestion] = useState("");
  const currentReqRef = useRef(0);
  const reqIdRef = useRef(0);

  useEffect(() => {
    const handler = (e: MessageEvent<WorkerMessage>) => {
      const msg = e.data;

      if (msg.status === "complete") {
        if (msg.requestId !== currentReqRef.current) return;
        setSuggestion(msg.suggestion);
        return;
      }

      if (msg.status === "error") {
        console.warn("[AutocompleteWorker]", msg.error);
      }
    };

    worker.addEventListener("message", handler);
    return () => worker.removeEventListener("message", handler);
  }, [worker]);

  useEffect(() => {
    if (!enabled || !isReady || value.length < MIN_LENGTH) {
      setSuggestion("");
      return;
    }

    setSuggestion("");

    const timer = setTimeout(() => {
      const reqId = ++reqIdRef.current;
      currentReqRef.current = reqId;
      worker.postMessage({ type: "complete", text: value, context, requestId: reqId });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [value, enabled, isReady, worker, context]);

  const accept = useCallback((currentValue: string, onChange: (v: string) => void) => {
    setSuggestion((s) => {
      if (s) onChange(currentValue + s);
      return "";
    });
    currentReqRef.current = ++reqIdRef.current;
  }, []);

  const dismiss = useCallback(() => {
    setSuggestion("");
    currentReqRef.current = ++reqIdRef.current;
  }, []);

  return { suggestion, accept, dismiss };
}
