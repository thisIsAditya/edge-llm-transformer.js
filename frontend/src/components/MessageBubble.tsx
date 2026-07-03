import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { isToolUIPart, isReasoningUIPart, isDataUIPart, getToolName } from "ai";
import type { UIMessage, ToolUIPart, DynamicToolUIPart, UITools } from "ai";
import {
  Search, Globe, Database, ChevronDown,
  Brain, Wrench, CheckCircle2, Loader2, Sparkles, XCircle,
  BookOpen,
} from "lucide-react";
/** Mirrors SubagentStepData from core/src/orchestrator/orchestrator.agent.ts */
interface SubagentStepData {
  parentToolCallId: string;
  subStepId: string;
  toolName: string;
  phase: "start" | "end";
  payload: string;
}

interface MessageBubbleProps {
  message: UIMessage;
  /** True when this is the last assistant message and the stream is still live. */
  isActive?: boolean;
}

type TextPart = Extract<UIMessage["parts"][number], { type: "text" }>;

function toolMeta(name: string): { Icon: React.ComponentType<{ className?: string }>; label: string } {
  if (name === "research")              return { Icon: Globe,     label: "Web Research"   };
  if (name === "memory_search")         return { Icon: Search,    label: "Memory Recall"  };
  if (name === "memory_save")           return { Icon: Database,  label: "Save to Memory" };
  if (name === "exa__web_search_exa")   return { Icon: Globe,     label: "Searching"      };
  if (name === "exa__web_fetch_exa")    return { Icon: BookOpen,  label: "Reading page"   };
  return { Icon: Wrench, label: name };
}

function prettyValue(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

type AnyToolPart = ToolUIPart<UITools> | DynamicToolUIPart;

/* ── Sub-agent step row (nested inside Research card) ────────────────────── */
function SubagentStepRow({ step }: { step: SubagentStepData }) {
  const [open, setOpen] = useState(false);
  const { Icon, label } = toolMeta(step.toolName);
  const isDone = step.phase === "end";

  return (
    <div className="rounded-lg border border-border bg-app overflow-hidden text-xs">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2.5 w-full px-3 py-2 hover:bg-hover transition-colors text-left"
      >
        <span className="flex items-center justify-center w-5 h-5 rounded bg-brand-soft shrink-0">
          <Icon className="w-3 h-3 text-brand" />
        </span>

        <span className="font-medium text-ink">{label}</span>

        <span className="ml-auto flex items-center gap-2 shrink-0">
          {isDone ? (
            <span className="flex items-center gap-1 text-emerald-600 font-medium">
              <CheckCircle2 className="w-3 h-3" />
              Done
            </span>
          ) : (
            <span className="flex items-center gap-1 text-brand font-medium">
              <Loader2 className="w-3 h-3 animate-spin" />
              Running
            </span>
          )}
          {step.payload && (
            <ChevronDown
              className={`w-3 h-3 text-ink-dim transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            />
          )}
        </span>
      </button>

      {open && step.payload && (
        <div className="border-t border-border px-3 py-2">
          <pre className="text-ink-soft whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed max-h-36 overflow-y-auto">
            {step.payload}
          </pre>
        </div>
      )}
    </div>
  );
}

/* ── Tool call expandable card ───────────────────────────────────────────── */
function ToolCallCard({ part, subSteps }: { part: AnyToolPart; subSteps: SubagentStepData[] }) {
  const [open, setOpen] = useState(false);
  const name = getToolName(part);
  const { Icon, label } = toolMeta(name);

  const isRunning = part.state === "input-streaming" || part.state === "input-available";
  const isError = part.state === "output-error" || part.state === "output-denied";
  const isDone = part.state === "output-available";

  const input = part.input;
  const output = part.state === "output-available" ? part.output : undefined;
  const errorText = part.state === "output-error" ? part.errorText : undefined;

  const hasSubSteps = subSteps.length > 0;

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden text-xs shadow-sm shadow-violet-100/50">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-3 w-full px-3.5 py-2.5 hover:bg-hover transition-colors text-left"
      >
        <span className="flex items-center justify-center w-6 h-6 rounded-md bg-brand-soft shrink-0">
          <Icon className="w-3.5 h-3.5 text-brand" />
        </span>

        <span className="font-medium text-ink">{label}</span>

        {hasSubSteps && isRunning && (
          <span className="text-ink-dim font-normal">
            · {subSteps[subSteps.length - 1]?.toolName === "exa__web_fetch_exa" ? "Reading…" : "Searching…"}
          </span>
        )}

        <span className="ml-auto flex items-center gap-2.5 shrink-0">
          {isDone && (
            <span className="flex items-center gap-1 text-emerald-600 font-medium">
              <CheckCircle2 className="w-3 h-3" />
              Done
            </span>
          )}
          {isError && (
            <span className="flex items-center gap-1 text-red-600 font-medium">
              <XCircle className="w-3 h-3" />
              Failed
            </span>
          )}
          {isRunning && (
            <span className="flex items-center gap-1 text-brand font-medium">
              <Loader2 className="w-3 h-3 animate-spin" />
              Running
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 text-ink-dim transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {open && (
        <div className="border-t border-border divide-y divide-border">
          {/* Sub-agent trace — shown when the research tool has nested steps */}
          {hasSubSteps && (
            <div className="px-3.5 py-3 space-y-1.5">
              <p className="text-[10px] uppercase tracking-widest text-ink-dim font-semibold">Research steps</p>
              <div className="space-y-1.5 pl-1">
                {subSteps.map((step) => (
                  <SubagentStepRow key={`${step.subStepId}-${step.phase}`} step={step} />
                ))}
              </div>
            </div>
          )}

          {input !== undefined && (
            <div className="px-3.5 py-3 space-y-1.5">
              <p className="text-[10px] uppercase tracking-widest text-ink-dim font-semibold">Input</p>
              <pre className="text-ink-soft whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed">
                {prettyValue(input)}
              </pre>
            </div>
          )}

          {isDone && (
            <div className="px-3.5 py-3 space-y-1.5">
              <p className="text-[10px] uppercase tracking-widest text-ink-dim font-semibold">Output</p>
              <div className="max-h-52 overflow-y-auto">
                <pre className="text-ink-soft whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed">
                  {prettyValue(output)}
                </pre>
              </div>
            </div>
          )}

          {isError && errorText && (
            <div className="px-3.5 py-3 space-y-1.5">
              <p className="text-[10px] uppercase tracking-widest text-red-500 font-semibold">Error</p>
              <p className="text-red-600 text-[11px] leading-relaxed">{errorText}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Reasoning / thinking collapsible ───────────────────────────────────── */
function ReasoningBlock({ text, state }: { text: string; state?: "streaming" | "done" }) {
  const [open, setOpen] = useState(state === "streaming");
  if (!text.trim()) return null;

  const isActive = state === "streaming";
  const wordCount = text.trim().split(/\s+/).length;

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden text-xs shadow-sm shadow-violet-100/50">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-3 w-full px-3.5 py-2.5 hover:bg-hover transition-colors text-left"
      >
        <Brain className={`w-3.5 h-3.5 shrink-0 text-brand ${isActive ? "animate-pulse" : ""}`} />
        <span className="font-medium text-ink">{isActive ? "Thinking…" : "Reasoning"}</span>
        {!isActive && <span className="text-ink-dim">· {wordCount} words</span>}
        <ChevronDown
          className={`ml-auto w-3.5 h-3.5 text-ink-dim transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="px-3.5 py-3 border-t border-border">
          <p className="text-ink-soft text-[11px] leading-relaxed whitespace-pre-wrap italic">{text}</p>
        </div>
      )}
    </div>
  );
}

/* ── Main message bubble ────────────────────────────────────────────────── */
export function MessageBubble({ message, isActive = false }: MessageBubbleProps) {
  const isUser = message.role === "user";

  const textParts = message.parts.filter((p): p is TextPart => p.type === "text");

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl rounded-br-md px-4 py-2.5 bg-brand text-sm text-white whitespace-pre-wrap break-words shadow-md shadow-violet-300/50">
          {textParts.map((p, i) => <span key={i}>{p.text}</span>)}
        </div>
      </div>
    );
  }

  /** Group sub-agent steps by the parent tool call id they belong to. */
  const subStepsByParent = new Map<string, SubagentStepData[]>();
  for (const part of message.parts) {
    if (isDataUIPart(part) && (part as { type: string }).type === "data-subagentStep") {
      const step = (part as { data: SubagentStepData }).data;
      if (!subStepsByParent.has(step.parentToolCallId)) {
        subStepsByParent.set(step.parentToolCallId, []);
      }
      const arr = subStepsByParent.get(step.parentToolCallId)!;
      /** Keep only the latest phase per subStepId — "end" replaces "start". */
      const existing = arr.findIndex((s) => s.subStepId === step.subStepId);
      if (existing >= 0) {
        arr[existing] = step;
      } else {
        arr.push(step);
      }
    }
  }

  const isStreamingText = isActive && textParts.length > 0;

  return (
    <div className="flex justify-start gap-2.5">
      <div className="w-7 h-7 rounded-full bg-brand-soft flex items-center justify-center shrink-0 mt-0.5">
        <Sparkles className="w-3.5 h-3.5 text-brand" />
      </div>

      <div className="flex-1 min-w-0 max-w-[85%] space-y-1.5">
        {message.parts.map((part, i) => {
          if (isReasoningUIPart(part)) {
            return <ReasoningBlock key={i} text={part.text} state={part.state} />;
          }
          if (isToolUIPart(part)) {
            const toolCallId = (part as { toolCallId?: string }).toolCallId ?? "";
            const subSteps = subStepsByParent.get(toolCallId) ?? [];
            return <ToolCallCard key={i} part={part} subSteps={subSteps} />;
          }
          return null;
        })}

        {textParts.length > 0 && (
          <div className={`prose prose-lav prose-sm max-w-none ${isStreamingText ? "streaming-cursor" : ""}`}>
            {textParts.map((p, i) => (
              <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>
                {p.text}
              </ReactMarkdown>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
