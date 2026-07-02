import type { SemanticStore } from "./semantic.store.js";
import type { WorkingMemory } from "./working-memory.js";
import type { MemoryItem, WorkingMemoryEntry } from "./types.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("retrieval");

export interface MemoryContext {
  recentTurns: WorkingMemoryEntry[];
  semanticHits: MemoryItem[];
  /** Pre-formatted string ready to inject into system/instructions. */
  formatted: string;
}

/**
 * Merges working + semantic memory for injection in orchestrator `prepareStep`.
 */
export async function buildMemoryContext(opts: {
  conversationId: string;
  query: string;
  working: WorkingMemory;
  semantic: SemanticStore;
}): Promise<MemoryContext> {
  const recentTurns = opts.working.getWithinBudget();

  let semanticHits: MemoryItem[] = [];
  try {
    semanticHits = await opts.semantic.searchForConversation(opts.conversationId, opts.query);
  } catch (err) {
    logger.warn("Semantic memory search failed; continuing without it", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const formatted = formatContext(recentTurns, semanticHits);
  return { recentTurns, semanticHits, formatted };
}

function formatContext(turns: WorkingMemoryEntry[], hits: MemoryItem[]): string {
  const parts: string[] = [];

  if (hits.length > 0) {
    parts.push("## Relevant memories");
    for (const h of hits) {
      const score = h.similarity !== undefined ? ` (relevance: ${h.similarity.toFixed(2)})` : "";
      parts.push(`- [${h.kind}${score}] ${h.content}`);
    }
  }

  if (turns.length > 0) {
    parts.push("\n## Recent conversation");
    for (const t of turns) {
      parts.push(`${t.role === "user" ? "User" : "Assistant"}: ${t.content}`);
    }
  }

  return parts.join("\n");
}
