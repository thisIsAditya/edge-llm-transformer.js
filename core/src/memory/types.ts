export type MemoryKind = "fact" | "summary" | "preference";

export interface MemoryItem {
  id: string;
  conversationId: string | null;
  kind: MemoryKind;
  content: string;
  sourceMessageIds: string[];
  importance: number;
  createdAt: Date;
  updatedAt: Date;
  /** Cosine similarity [0,1] — only present on search results. */
  similarity?: number;
}

export interface EpisodicMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  toolCallId?: string;
  toolName?: string;
  createdAt: Date;
}

export interface WorkingMemoryEntry {
  role: "user" | "assistant";
  content: string;
}
