import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useModelsContext, type ModelKey } from "../context/ModelsContext.js";

const RETENTION_MESSAGES = [
  "Setting up your private, on-device AI assistant…",
  "Everything runs locally — your data never leaves this browser.",
  "Downloading models once; they'll be cached for next time.",
  "Preparing speech recognition, grammar checking, title generation, and a safety guard…",
  "Larger models make smarter suggestions — thanks for your patience!",
  "Almost there…",
];

const ORDER: ModelKey[] = ["grammar", "title", "guard", "asr"];

export function LoadingScreen() {
  const { models, overallProgress } = useModelsContext();
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setMessageIndex((i) => (i + 1) % RETENTION_MESSAGES.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-app text-ink px-6">
      <div className="w-full max-w-sm flex flex-col items-center gap-6">
        <div className="w-14 h-14 rounded-2xl bg-panel border border-border flex items-center justify-center shadow-lg shadow-violet-200/50">
          <span className="text-3xl text-brand">✦</span>
        </div>

        <div className="text-center space-y-1">
          <h1 className="text-lg font-semibold text-ink">Starting up</h1>
          <p className="text-sm text-ink-soft transition-opacity duration-300">
            {RETENTION_MESSAGES[messageIndex]}
          </p>
        </div>

        <div className="w-full">
          <div className="h-1.5 w-full rounded-full bg-hover overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand to-violet-400 transition-all duration-300 ease-out"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
          <p className="mt-1.5 text-right text-xs text-ink-dim">{overallProgress}%</p>
        </div>

        <ul className="w-full flex flex-col gap-2.5">
          {ORDER.map((key) => {
            const model = models[key];
            return (
              <li key={key} className="flex items-center justify-between text-sm text-ink-soft">
                <span className="flex items-center gap-2.5">
                  {model.status === "ready"   && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                  {model.status === "loading" && <Loader2      className="w-4 h-4 animate-spin text-brand" />}
                  {model.status === "error"   && <XCircle      className="w-4 h-4 text-red-500" />}
                  {model.label}
                </span>
                <span className="text-xs text-ink-dim">
                  {model.status === "ready"   && "Ready"}
                  {model.status === "loading" && `${model.progress}%`}
                  {model.status === "error"   && "Unavailable"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
