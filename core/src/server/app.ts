import express from "express";
import cors from "cors";
import type { EpisodicStore } from "../memory/episodic.store.js";
import type { SemanticStore } from "../memory/semantic.store.js";
import { createConversationsRouter } from "./routes/conversations.routes.js";
import { createChatRouter } from "./routes/chat.routes.js";

export function buildApp(episodicStore: EpisodicStore, semanticStore: SemanticStore) {
  const app = express();

  app.use(cors({
    origin: process.env["CORS_ORIGIN"] ?? "http://localhost:5173",
    methods: ["GET", "POST", "PATCH", "DELETE"],
  }));

  app.use(express.json({ limit: "4mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "local-llm-agent" });
  });

  app.use("/api/conversations", createConversationsRouter(episodicStore));
  app.use("/api/conversations", createChatRouter(episodicStore, semanticStore));

  return app;
}
