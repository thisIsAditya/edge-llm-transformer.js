import { useRef, useEffect, useState, useCallback } from "react";
import type { ErrorSpan } from "../lib/wordDiff.js";

interface PopoverState {
  index: number;
  x: number;
  y: number;
  error: ErrorSpan;
}

interface GrammarUnderlayProps {
  value: string;
  errors: ErrorSpan[];
  containerClassName: string;
  onAccept: (index: number) => void;
  onIgnore: (index: number) => void;
}

export function GrammarUnderlay({
  value,
  errors,
  containerClassName,
  onAccept,
  onIgnore,
}: GrammarUnderlayProps) {
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!popover) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPopover(null);
    };
    const handleClick = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setPopover(null);
      }
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [popover]);

  const handleSpanClick = useCallback(
    (e: React.MouseEvent<HTMLSpanElement>, index: number, error: ErrorSpan) => {
      e.stopPropagation();
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const overlayRect = overlayRef.current?.getBoundingClientRect();
      if (!overlayRect) return;
      setPopover({
        index,
        error,
        x: rect.left - overlayRect.left,
        y: rect.bottom - overlayRect.top + 4,
      });
    },
    []
  );

  if (errors.length === 0 && !popover) return null;

  const sortedErrors = [...errors].sort((a, b) => a.start - b.start);
  const segments: React.ReactNode[] = [];
  let cursor = 0;

  sortedErrors.forEach((err, idx) => {
    if (err.start > cursor) {
      segments.push(
        <span key={`plain-${cursor}`} className="text-transparent">
          {value.slice(cursor, err.start)}
        </span>
      );
    }
    segments.push(
      <span
        key={`err-${idx}`}
        onClick={(e) => handleSpanClick(e, idx, err)}
        className="text-transparent pointer-events-auto cursor-pointer"
        style={{ textDecoration: "underline wavy #ef4444", textDecorationSkipInk: "none" }}
        title={`Suggestion: ${err.suggestion}`}
        role="button"
        tabIndex={-1}
      >
        {value.slice(err.start, err.end)}
      </span>
    );
    cursor = err.end;
  });

  if (cursor < value.length) {
    segments.push(
      <span key={`plain-end`} className="text-transparent">
        {value.slice(cursor)}
      </span>
    );
  }

  return (
    <div ref={overlayRef} className="relative">
      <div
        aria-hidden
        className={`${containerClassName} pointer-events-none whitespace-pre-wrap break-words`}
      >
        {segments}
      </div>

      {popover && (
        <div
          ref={popoverRef}
          className="absolute z-50 rounded-xl border border-border bg-surface shadow-sm shadow-violet-100/50 p-3 min-w-48 max-w-72"
          style={{ left: popover.x, top: popover.y }}
        >
          <div className="space-y-2">
            <div className="text-xs space-y-0.5">
              <p className="text-[10px] uppercase tracking-widest text-ink-dim font-semibold">
                Suggestion
              </p>
              <p className="text-ink-soft">
                <span className="line-through text-red-500/80 mr-1">
                  {popover.error.original}
                </span>
                <span className="text-emerald-600 font-medium">
                  {popover.error.suggestion}
                </span>
              </p>
            </div>

            <div className="flex items-center gap-2 pt-0.5">
              <button
                onClick={() => {
                  onAccept(popover.index);
                  setPopover(null);
                }}
                className="flex-1 rounded-lg bg-brand text-white text-xs font-medium py-1.5 hover:bg-brand-hover transition-colors"
              >
                Accept
              </button>
              <button
                onClick={() => {
                  onIgnore(popover.index);
                  setPopover(null);
                }}
                className="flex-1 rounded-lg border border-border text-ink-soft text-xs font-medium py-1.5 hover:bg-hover transition-colors"
              >
                Ignore
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
