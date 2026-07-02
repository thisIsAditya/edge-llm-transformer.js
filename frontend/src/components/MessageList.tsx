import { useEffect, useRef } from "react";
import type { UIMessage, ChatStatus } from "ai";
import { MessageBubble } from "./MessageBubble.js";
import { Sparkles } from "lucide-react";

interface MessageListProps {
  messages: UIMessage[];
  /** Raw useChat status */
  status: ChatStatus;
}

/** Three-dot bounce indicator shown while waiting for the first token. */
function TypingIndicator() {
  return (
    <div className="flex justify-start gap-2.5 fade-in">
      <div className="w-7 h-7 rounded-full bg-brand-soft flex items-center justify-center shrink-0">
        <Sparkles className="w-3.5 h-3.5 text-brand" />
      </div>
      <div className="flex items-center gap-1.5 py-2.5 px-0.5">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="w-1.5 h-1.5 rounded-full bg-brand animate-bounce"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

export function MessageList({ messages, status }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const isStreaming = status === "streaming" || status === "submitted";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  const visible = messages.filter((m) => m.role === "user" || m.role === "assistant");

  if (visible.length === 0 && !isStreaming) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-ink-dim select-none px-4">
        <Sparkles className="w-8 h-8 text-brand-soft" strokeWidth={1.5} />
        <p className="text-sm">Start a conversation</p>
      </div>
    );
  }

  const lastAssistantIdx = visible.reduce((acc, m, i) => (m.role === "assistant" ? i : acc), -1);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4 messages-scroll">
      <div className="max-w-3xl w-full mx-auto space-y-4">
        {visible.map((msg, i) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isActive={isStreaming && i === lastAssistantIdx}
          />
        ))}

        {status === "submitted" && <TypingIndicator />}
      </div>

      <div ref={bottomRef} />
    </div>
  );
}
