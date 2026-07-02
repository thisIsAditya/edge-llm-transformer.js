import { generateText } from "ai";
import type { EpisodicStore } from "./episodic.store.js";
import type { SemanticStore } from "./semantic.store.js";
import { getChatModel } from "../models/provider.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("consolidation");

/**
 * Summarises recent episodic messages into semantic memory. Failures are logged, not thrown.
 */
export async function consolidateMemory(opts: {
  conversationId: string;
  episodic: EpisodicStore;
  semantic: SemanticStore;
  recentN?: number;
}): Promise<void> {
  const { conversationId, episodic, semantic, recentN = 20 } = opts;

  const messages = await episodic.getRecentMessages(conversationId, recentN);
  if (messages.length < 2) return;

  const transcript = messages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  logger.info("Running consolidation", {
    conversationId,
    messageCount: messages.length,
  });

  try {
    const { text: summary } = await generateText({
      model: getChatModel(),
      maxOutputTokens: 256,
      prompt:
        `Extract 2-4 concise factual statements from the following conversation that would be useful to remember for future turns. ` +
        `Return one statement per line, starting each line with "FACT:" or "PREF:" (for preferences) or "SUMMARY:". Do not add any other formatting.\n\n` +
        transcript,
    });

    const lines = summary
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("FACT:") || l.startsWith("PREF:") || l.startsWith("SUMMARY:"));

    const messageIds = messages.map((m) => m.id);

    for (const line of lines) {
      const kind = line.startsWith("PREF:") ? "preference" : line.startsWith("SUMMARY:") ? "summary" : "fact";
      const content = line.replace(/^(FACT|PREF|SUMMARY):\s*/, "").trim();
      if (!content) continue;

      await semantic.upsertMemory({
        conversationId,
        kind,
        content,
        sourceMessageIds: messageIds,
        importance: 0.6,
      });
    }

    logger.info("Consolidation complete", { facts: lines.length });
  } catch (err) {
    logger.error("Consolidation failed (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
