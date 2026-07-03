import { useState, useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { MessageList } from "./MessageList.js";
import { Composer } from "./Composer.js";
import { api } from "../lib/api.js";
import { API_BASE_URL } from "../lib/config.js";
import { useConversationContext } from "../hooks/useConversationContext.js";

interface ChatWindowProps {
  conversationId: string;
  conversationTitle: string | null;
  onTitleGenerated: (userText: string) => void;
}

export function ChatWindow({ conversationId, conversationTitle, onTitleGenerated }: ChatWindowProps) {
  const [input, setInput] = useState("");

  /** Set once when the first user message of a new conversation is sent. */
  const firstUserTextRef = useRef<string | null>(null);
  /** Prevents generating a title more than once per conversation mount. */
  const titleFiredRef    = useRef(false);
  /** Always holds the latest messages without adding them to effect deps. */
  const messagesRef      = useRef<UIMessage[]>([]);
  /** Keeps the callback fresh inside the status-watch effect. */
  const onTitleRef       = useRef(onTitleGenerated);
  onTitleRef.current     = onTitleGenerated;

  const { messages, sendMessage, status, setMessages } = useChat({
    id: conversationId,
    transport: new DefaultChatTransport({
      api: `${API_BASE_URL}/api/conversations/${conversationId}/chat`,
    }),
  });

  messagesRef.current = messages;

  useEffect(() => {
    setMessages([]);
    setInput("");
    titleFiredRef.current    = false;
    firstUserTextRef.current = null;

    api
      .getMessages(conversationId)
      .then((stored) => {
        const uiMessages: UIMessage[] = stored
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            parts: [{ type: "text" as const, text: m.content }],
            metadata: {},
          }));
        setMessages(uiMessages);
        if (uiMessages.length > 0) titleFiredRef.current = true;
      })
      .catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  /**
   * After the first assistant reply finishes streaming, generate a title from
   * both the user question and the assistant answer for better context.
   */
  useEffect(() => {
    if (status !== "ready" || !firstUserTextRef.current) return;

    const userText  = firstUserTextRef.current;
    firstUserTextRef.current = null;

    onTitleRef.current(userText);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const isStreaming = status === "streaming" || status === "submitted";
  const conversationContext = useConversationContext(messages, status, conversationId);

  const handleSubmit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    setInput("");

    /** Record the first user message so the status effect can use it. */
    if (messages.length === 0 && !conversationTitle && !titleFiredRef.current) {
      titleFiredRef.current    = true;
      firstUserTextRef.current = trimmed;
    }

    sendMessage({ parts: [{ type: "text", text: trimmed }] });
  };

  return (
    <div className="flex flex-col h-full">
      <header className="shrink-0 flex items-center h-14 px-5 border-b border-border bg-panel/80 backdrop-blur-sm">
        <h1 className="text-sm font-medium text-ink truncate">{conversationTitle ?? "New chat"}</h1>
      </header>

      <MessageList messages={messages} status={status} />

      <div className="shrink-0 px-4 pb-4 pt-2 max-w-3xl w-full mx-auto">
        <Composer
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          disabled={isStreaming}
          context={conversationContext}
        />
        <p className="text-center text-xs text-ink-dim mt-2">
          AI can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
}
