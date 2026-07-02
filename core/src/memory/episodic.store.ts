import type pg from "pg";
import type { EpisodicMessage } from "./types.js";

export interface ConversationRow {
  id: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class EpisodicStore {
  constructor(private readonly pool: pg.Pool) {}

  async appendMessage(
    conversationId: string,
    msg: Omit<EpisodicMessage, "id" | "conversationId" | "createdAt">
  ): Promise<EpisodicMessage> {
    const { rows } = await this.pool.query<EpisodicMessage>(
      `INSERT INTO messages(conversation_id, role, content, tool_call_id, tool_name)
       VALUES($1, $2, $3, $4, $5)
       RETURNING id, conversation_id AS "conversationId", role, content,
                 tool_call_id AS "toolCallId", tool_name AS "toolName",
                 created_at AS "createdAt"`,
      [conversationId, msg.role, msg.content, msg.toolCallId ?? null, msg.toolName ?? null]
    );

    if (msg.role === "user") {
      await this.pool.query(
        `UPDATE conversations
         SET updated_at = NOW(),
             title = COALESCE(title, $2)
         WHERE id = $1`,
        [conversationId, msg.content.slice(0, 80)]
      );
    } else {
      await this.pool.query(
        `UPDATE conversations SET updated_at = NOW() WHERE id = $1`,
        [conversationId]
      );
    }

    return rows[0]!;
  }

  async getRecentMessages(conversationId: string, limit: number): Promise<EpisodicMessage[]> {
    const { rows } = await this.pool.query<EpisodicMessage>(
      `SELECT id, conversation_id AS "conversationId", role, content,
              tool_call_id AS "toolCallId", tool_name AS "toolName",
              created_at AS "createdAt"
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [conversationId, limit]
    );
    return rows.reverse();
  }

  async getAllMessages(conversationId: string): Promise<EpisodicMessage[]> {
    const { rows } = await this.pool.query<EpisodicMessage>(
      `SELECT id, conversation_id AS "conversationId", role, content,
              tool_call_id AS "toolCallId", tool_name AS "toolName",
              created_at AS "createdAt"
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [conversationId]
    );
    return rows;
  }

  async countMessages(conversationId: string): Promise<number> {
    const { rows } = await this.pool.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM messages WHERE conversation_id = $1",
      [conversationId]
    );
    return parseInt(rows[0]?.count ?? "0", 10);
  }

  async ensureConversation(conversationId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO conversations(id) VALUES($1) ON CONFLICT(id) DO NOTHING`,
      [conversationId]
    );
  }

  async createConversation(id: string): Promise<ConversationRow> {
    const { rows } = await this.pool.query<ConversationRow>(
      `INSERT INTO conversations(id)
       VALUES($1)
       ON CONFLICT(id) DO NOTHING
       RETURNING id, title, created_at AS "createdAt", COALESCE(updated_at, created_at) AS "updatedAt"`,
      [id]
    );
    if (rows[0]) return rows[0];
    return this.getConversation(id) as Promise<ConversationRow>;
  }

  async getConversation(id: string): Promise<ConversationRow | null> {
    const { rows } = await this.pool.query<ConversationRow>(
      `SELECT id, title, created_at AS "createdAt", COALESCE(updated_at, created_at) AS "updatedAt"
       FROM conversations WHERE id = $1`,
      [id]
    );
    return rows[0] ?? null;
  }

  async listConversations(): Promise<ConversationRow[]> {
    const { rows } = await this.pool.query<ConversationRow>(
      `SELECT id, title, created_at AS "createdAt", COALESCE(updated_at, created_at) AS "updatedAt"
       FROM conversations
       ORDER BY COALESCE(updated_at, created_at) DESC`
    );
    return rows;
  }

  async renameConversation(id: string, title: string): Promise<void> {
    await this.pool.query(
      `UPDATE conversations SET title = $2 WHERE id = $1`,
      [id, title]
    );
  }

  async deleteConversation(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM conversations WHERE id = $1`, [id]);
  }
}
