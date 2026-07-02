import { Router } from "express";
import type { UIMessage } from "ai";
import { convertToModelMessages } from "ai";
import type { EpisodicStore } from "../../memory/episodic.store.js";
import { getOrCreateSession } from "../sessions.js";
import { createLogger } from "../../utils/logger.js";
import { consolidateMemory } from "../../memory/consolidation.js";
import type { SemanticStore } from "../../memory/semantic.store.js";
import { env } from "../../config/env.js";

const logger = createLogger("chat.routes");

function extractText(msg: UIMessage): string {
  return msg.parts
    .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("")
    .trim();
}

export function createChatRouter(episodicStore: EpisodicStore, semanticStore: SemanticStore): Router {
  const router = Router();

  const turnCounts = new Map<string, number>();

  router.post("/:id/chat", async (req, res) => {
    const { id } = req.params;
    const { messages } = req.body as { messages: UIMessage[] };

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: "messages array is required" });
      return;
    }

    try {
      await episodicStore.ensureConversation(id);

      const session = await getOrCreateSession(id);

      const lastUserMsg = messages[messages.length - 1]!;
      const userText = extractText(lastUserMsg);

      if (userText) {
        await episodicStore.appendMessage(id, { role: "user", content: userText });
      }

      const modelMessages = await convertToModelMessages(messages);

      const result = await session.orchestrator.stream({ messages: modelMessages });

      let fullResponse = "";
      result.pipeUIMessageStreamToResponse(res, {
        onEnd: async ({ responseMessage }) => {
          const parts = responseMessage?.parts ?? [];
          for (const part of parts) {
            if (part.type === "text") fullResponse += part.text;
          }

          if (fullResponse) {
            try {
              await episodicStore.appendMessage(id, { role: "assistant", content: fullResponse });
            } catch (e) {
              logger.warn("Failed to persist assistant message", { error: String(e) });
            }
          }

          const count = (turnCounts.get(id) ?? 0) + 1;
          turnCounts.set(id, count);
          if (count % env.CONSOLIDATION_INTERVAL === 0) {
            consolidateMemory({ conversationId: id, episodic: episodicStore, semantic: semanticStore }).catch(
              (e: unknown) => logger.warn("Background consolidation error", { error: String(e) })
            );
          }

          session.workingMemory.push({ role: "user", content: userText });
          if (fullResponse) {
            session.workingMemory.push({ role: "assistant", content: fullResponse });
          }
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Chat route error", { conversationId: id, error: msg });
      if (!res.headersSent) {
        res.status(500).json({ error: msg });
      }
    }
  });

  return router;
}
