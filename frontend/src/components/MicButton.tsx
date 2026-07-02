import { Mic, MicOff, Loader2 } from "lucide-react";
import type { AsrStatus } from "../hooks/useSpeechToText.js";

interface MicButtonProps {
  status: AsrStatus;
  isRecording: boolean;
  progress: number;
  onStart: () => void;
  onStop: () => void;
}

export function MicButton({ status, isRecording, progress, onStart, onStop }: MicButtonProps) {
  if (status === "loading") {
    return (
      <button
        disabled
        title={`Loading Whisper model… ${Math.round(progress)}%`}
        className="relative flex items-center justify-center w-9 h-9 rounded-full bg-hover text-ink-dim cursor-not-allowed shrink-0"
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        {progress > 0 && (
          <span className="absolute -bottom-5 text-xs text-ink-dim whitespace-nowrap">
            {Math.round(progress)}%
          </span>
        )}
      </button>
    );
  }

  if (status === "transcribing") {
    return (
      <button
        disabled
        title="Transcribing…"
        className="flex items-center justify-center w-9 h-9 rounded-full bg-brand-soft text-brand cursor-not-allowed shrink-0"
      >
        <Loader2 className="w-4 h-4 animate-spin" />
      </button>
    );
  }

  if (isRecording) {
    return (
      <button
        onClick={onStop}
        title="Stop recording"
        className="relative flex items-center justify-center w-9 h-9 rounded-full bg-red-500 hover:bg-red-600 text-white transition-colors shrink-0"
      >
        <span className="absolute inset-0 rounded-full bg-red-400 opacity-60 animate-ping" />
        <MicOff className="w-4 h-4 relative z-10" />
      </button>
    );
  }

  return (
    <button
      onClick={onStart}
      disabled={status !== "ready"}
      title={status === "error" ? "ASR unavailable" : "Record voice message"}
      className="flex items-center justify-center w-9 h-9 rounded-full bg-hover hover:bg-border-strong text-ink-soft hover:text-ink transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
    >
      <Mic className="w-4 h-4" />
    </button>
  );
}
