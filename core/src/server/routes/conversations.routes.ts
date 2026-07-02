import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import type { EpisodicStore } from "../../memory/episodic.store.js";
import { destroySession } from "../sessions.js";

export function createConversationsRouter(episodicStore: EpisodicStore): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    try {
      const conversations = await episodicStore.listConversations();
      res.json(conversations);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post("/", async (_req, res) => {
    try {
      const id = uuidv4();
      const conversation = await episodicStore.createConversation(id);
      res.status(201).json(conversation);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.get("/:id/messages", async (req, res) => {
    try {
      const messages = await episodicStore.getAllMessages(req.params.id!);
      res.json(messages);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.patch("/:id", async (req, res) => {
    try {
      const { title } = req.body as { title?: string };
      if (!title || typeof title !== "string") {
        res.status(400).json({ error: "title is required" });
        return;
      }
      await episodicStore.renameConversation(req.params.id!, title);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.delete("/:id", async (req, res) => {
    try {
      await episodicStore.deleteConversation(req.params.id!);
      destroySession(req.params.id!);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
