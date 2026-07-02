import { useRef, useState, useEffect, type KeyboardEvent } from "react";
import { Send, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { MicButton } from "./MicButton.js";
import { useSpeechToText } from "../hooks/useSpeechToText.js";
import { useAutocomplete } from "../hooks/useAutocomplete.js";
import { usePromptGuard } from "../hooks/usePromptGuard.js";

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (text: string) => void;
  disabled?: boolean;
  context?: string;
}

type GuardNotice =
  | { type: "blocked"; message: string }
  | { type: "masked"; labels: string[] };

export function Composer({ value, onChange, onSubmit, disabled = false, context }: ComposerProps) {
  const textareaRef   = useRef<HTMLTextAreaElement>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [notice, setNotice]         = useState<GuardNotice | null>(null);

  const { status: asrStatus, isRecording, progress: asrProgress, startRecording, stopRecording } = useSpeechToText({
    onTranscript: (text) => {
      onChange(value ? `${value} ${text}` : text);
      setTimeout(() => textareaRef.current?.focus(), 0);
    },
  });

  const { suggestion, accept, dismiss } = useAutocomplete({
    value,
    enabled: !disabled,
    context,
  });

  const { checkPrompt } = usePromptGuard();

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const handleChange = (next: string) => {
    if (notice) setNotice(null);
    onChange(next);
  };

  const guardedSubmit = async () => {
    if (disabled || isChecking || !value.trim()) return;

    setIsChecking(true);
    try {
      const result = await checkPrompt(value);

      if (result.blocked) {
        setNotice({
          type: "blocked",
          message: "This message looks like a prompt injection attempt and wasn't sent. Please rephrase it.",
        });
        return;
      }

      setNotice(result.credentialsFound.length > 0 ? { type: "masked", labels: result.credentialsFound } : null);
      onSubmit(result.maskedText);
    } finally {
      setIsChecking(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab" && suggestion) {
      e.preventDefault();
      accept(value, onChange);
      return;
    }
    if (e.key === "Escape" && suggestion) {
      e.preventDefault();
      dismiss();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (suggestion) { dismiss(); return; }
      void guardedSubmit();
    }
  };

  const canSend = !disabled && !isChecking && !!value.trim();

  return (
    <div>
      <div className="relative border border-border rounded-2xl bg-panel focus-within:border-brand shadow-sm shadow-violet-100/60 transition-colors duration-200">
        <div className="relative">
          {suggestion && (
            <div
              aria-hidden
              className="absolute inset-0 px-4 pt-3 pb-2 text-sm whitespace-pre-wrap break-words pointer-events-none select-none overflow-hidden"
            >
              <span className="invisible">{value}</span>
              <span className="text-ink-dim">{suggestion}</span>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder="Message…"
            rows={1}
            spellCheck
            className="relative block w-full bg-transparent px-4 pt-3 pb-2 resize-none text-sm text-ink placeholder-ink-dim outline-none disabled:opacity-50"
          />
        </div>

        <div className="flex items-center justify-between px-3 pb-2.5 gap-2">
          <div className="flex items-center gap-2">
            <MicButton
              status={asrStatus}
              isRecording={isRecording}
              progress={asrProgress}
              onStart={startRecording}
              onStop={stopRecording}
            />

            {isChecking ? (
              <span className="flex items-center gap-1.5 text-xs text-ink-dim select-none">
                <Loader2 className="w-3 h-3 animate-spin" />
                Checking…
              </span>
            ) : suggestion ? (
              <span className="text-xs text-ink-dim select-none">Tab to accept · Esc to dismiss</span>
            ) : null}
          </div>

          <button
            onClick={() => void guardedSubmit()}
            disabled={!canSend}
            title={isChecking ? "Checking message…" : "Send (Enter)"}
            className="flex items-center justify-center w-9 h-9 rounded-full bg-brand text-white hover:bg-brand-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0 shadow-md shadow-violet-300/60"
          >
            {isChecking
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {notice && (
        <div
          className={`mt-2 flex items-start gap-1.5 rounded-xl px-3 py-2 text-xs ${
            notice.type === "blocked"
              ? "bg-red-50 text-red-700 border border-red-200"
              : "bg-amber-50 text-amber-700 border border-amber-200"
          }`}
        >
          {notice.type === "blocked"
            ? <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            : <ShieldCheck  className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
          <span>
            {notice.type === "blocked"
              ? notice.message
              : `Masked sensitive data before sending: ${notice.labels.join(", ")}.`}
          </span>
        </div>
      )}
    </div>
  );
}
