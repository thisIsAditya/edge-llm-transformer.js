import { useState, useEffect, useRef } from "react";
import type { UIMessage } from "ai";

const MAX_CONTEXT_CHARS = 1000;

function buildSummary(messages: UIMessage[]): string {
  const allAssistantText = messages
    .filter((m) => m.role === "assistant")
    .flatMap((m) =>
      m.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
    )
    .join("\n");

  return allAssistantText.length > MAX_CONTEXT_CHARS
    ? allAssistantText.slice(-MAX_CONTEXT_CHARS)
    : allAssistantText;
}

/**
 * After each completed LLM response, extracts the last ~1000 chars of assistant
 * messages for the current conversation and returns it as a context string.
 * Stored per conversationId so switching back to a chat restores its context.
 */
export function useConversationContext(
  messages: UIMessage[],
  status: string,
  conversationId: string
): string {
  const contextByConvRef = useRef<Map<string, string>>(new Map());
  const [context, setContext] = useState("");
  const prevStatusRef = useRef(status);

  useEffect(() => {
    const wasActive =
      prevStatusRef.current === "streaming" || prevStatusRef.current === "submitted";
    prevStatusRef.current = status;

    if (status === "ready" && wasActive && messages.length > 0) {
      const summary = buildSummary(messages);
      if (summary) {
        contextByConvRef.current.set(conversationId, summary);
        setContext(summary);
      }
    }
  }, [status, messages, conversationId]);

  useEffect(() => {
    setContext(contextByConvRef.current.get(conversationId) ?? "");
  }, [conversationId]);

  return context;
}
