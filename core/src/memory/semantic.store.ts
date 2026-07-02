import pgvector from "pgvector/pg";
import { embed } from "ai";
import type pg from "pg";
import type { MemoryItem } from "./types.js";
import { getEmbeddingModel } from "../models/provider.js";
import { env } from "../config/env.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("semantic.store");

function prefixForKind(kind: "document" | "query"): string {
  /** nomic-embed-text expects task-specific prefixes for retrieval quality. */
  return kind === "query" ? "search_query: " : "search_document: ";
}

export class SemanticStore {
  constructor(private readonly pool: pg.Pool) {}

  async upsertMemory(
    item: Omit<MemoryItem, "id" | "createdAt" | "updatedAt" | "similarity">
  ): Promise<MemoryItem> {
    const embeddingModel = getEmbeddingModel();
    const { embedding } = await embed({
      model: embeddingModel,
      value: prefixForKind("document") + item.content,
    });

    const { rows } = await this.pool.query<MemoryItem>(
      `INSERT INTO memory_items
         (conversation_id, kind, content, source_message_ids, importance, embedding)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, conversation_id AS "conversationId", kind, content,
                 source_message_ids AS "sourceMessageIds", importance,
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [
        item.conversationId,
        item.kind,
        item.content,
        item.sourceMessageIds,
        item.importance,
        pgvector.toSql(embedding),
      ]
    );
    return rows[0]!;
  }

  async search(query: string, topK?: number): Promise<MemoryItem[]> {
    const k = topK ?? env.MEMORY_TOP_K;
    const embeddingModel = getEmbeddingModel();
    const { embedding } = await embed({
      model: embeddingModel,
      value: prefixForKind("query") + query,
    });

    const client = await this.pool.connect();
    try {
      /** Scoped to this transaction — raises HNSW recall without changing global settings. */
      await client.query("SET LOCAL hnsw.ef_search = 100");
      const { rows } = await client.query<MemoryItem & { similarity: number }>(
        `SELECT id,
                conversation_id AS "conversationId",
                kind,
                content,
                source_message_ids AS "sourceMessageIds",
                importance,
                created_at AS "createdAt",
                updated_at AS "updatedAt",
                1 - (embedding <=> $1) AS similarity
         FROM memory_items
         ORDER BY embedding <=> $1
         LIMIT $2`,
        [pgvector.toSql(embedding), k]
      );
      return rows;
    } finally {
      client.release();
    }
  }

  async searchForConversation(
    conversationId: string,
    query: string,
    topK?: number
  ): Promise<MemoryItem[]> {
    const k = topK ?? env.MEMORY_TOP_K;
    const embeddingModel = getEmbeddingModel();

    let queryEmbedding: number[];
    try {
      const result = await embed({
        model: embeddingModel,
        value: prefixForKind("query") + query,
      });
      queryEmbedding = result.embedding;
    } catch (err) {
      logger.error("Failed to embed query; skipping semantic search", {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }

    const client = await this.pool.connect();
    try {
      await client.query("SET LOCAL hnsw.ef_search = 100");
      const { rows } = await client.query<MemoryItem & { similarity: number }>(
        `SELECT id,
                conversation_id AS "conversationId",
                kind,
                content,
                source_message_ids AS "sourceMessageIds",
                importance,
                created_at AS "createdAt",
                updated_at AS "updatedAt",
                1 - (embedding <=> $1) AS similarity
         FROM memory_items
         WHERE conversation_id = $2 OR conversation_id IS NULL
         ORDER BY embedding <=> $1
         LIMIT $3`,
        [pgvector.toSql(queryEmbedding), conversationId, k]
      );
      return rows;
    } finally {
      client.release();
    }
  }

  async deleteByConversation(conversationId: string): Promise<void> {
    await this.pool.query("DELETE FROM memory_items WHERE conversation_id = $1", [conversationId]);
  }
}
