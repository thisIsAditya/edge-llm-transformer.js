import { tool } from "ai";
import { z } from "zod";
import type { SemanticStore } from "../memory/semantic.store.js";
import type { MemoryKind } from "../memory/types.js";

export function createMemoryTools(opts: {
  conversationId: string;
  semanticStore: SemanticStore;
}) {
  const { conversationId, semanticStore } = opts;

  const memory_search = tool({
    description:
      "Search your long-term semantic memory for information relevant to a query. " +
      "Use this before researching externally — you may already know the answer.",
    inputSchema: z.object({
      query: z.string().describe("The search query to find relevant memories."),
      top_k: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe("Maximum number of results to return (default 5)."),
    }),
    execute: async ({ query, top_k }) => {
      const results = await semanticStore.searchForConversation(conversationId, query, top_k);
      if (results.length === 0) {
        return { found: false, results: [] };
      }
      return {
        found: true,
        results: results.map((r) => ({
          kind: r.kind,
          content: r.content,
          similarity: r.similarity?.toFixed(3),
        })),
      };
    },
  });

  const memory_save = tool({
    description:
      "Save an important fact, user preference, or summary to long-term memory. " +
      "Use this to remember information across future conversations.",
    inputSchema: z.object({
      content: z.string().describe("The information to remember."),
      kind: z
        .enum(["fact", "summary", "preference"])
        .default("fact")
        .describe("Type of memory item."),
      importance: z
        .number()
        .min(0)
        .max(1)
        .default(0.6)
        .describe("Importance score between 0 and 1."),
    }),
    execute: async ({ content, kind, importance }) => {
      await semanticStore.upsertMemory({
        conversationId,
        kind: kind as MemoryKind,
        content,
        sourceMessageIds: [],
        importance,
      });
      return { saved: true, content };
    },
  });

  return { memory_search, memory_save };
}
