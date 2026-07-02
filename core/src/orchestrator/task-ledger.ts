import type pg from "pg";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("task-ledger");

export interface TaskLedger {
  id: string;
  conversationId: string;
  facts: string[];
  plan: string[];
  status: "active" | "complete" | "stalled" | "failed";
  createdAt: Date;
  updatedAt: Date;
}

export class TaskLedgerStore {
  constructor(private readonly pool: pg.Pool) {}

  async getOrCreate(conversationId: string): Promise<TaskLedger> {
    const { rows } = await this.pool.query<TaskLedger>(
      `INSERT INTO task_ledger (conversation_id)
       VALUES ($1)
       ON CONFLICT (conversation_id) DO UPDATE SET updated_at = NOW()
       RETURNING id, conversation_id AS "conversationId", facts, plan, status,
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [conversationId]
    );
    return rows[0]!;
  }

  async update(
    conversationId: string,
    patch: Partial<Pick<TaskLedger, "facts" | "plan" | "status">>
  ): Promise<void> {
    const setClauses: string[] = ["updated_at = NOW()"];
    const values: unknown[] = [conversationId];

    if (patch.facts !== undefined) {
      values.push(JSON.stringify(patch.facts));
      setClauses.push(`facts = $${values.length}`);
    }
    if (patch.plan !== undefined) {
      values.push(JSON.stringify(patch.plan));
      setClauses.push(`plan = $${values.length}`);
    }
    if (patch.status !== undefined) {
      values.push(patch.status);
      setClauses.push(`status = $${values.length}`);
    }

    await this.pool.query(
      `UPDATE task_ledger SET ${setClauses.join(", ")} WHERE conversation_id = $1`,
      values
    );
    logger.debug("Task ledger updated", { conversationId, patch });
  }

  async get(conversationId: string): Promise<TaskLedger | null> {
    const { rows } = await this.pool.query<TaskLedger>(
      `SELECT id, conversation_id AS "conversationId", facts, plan, status,
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM task_ledger
       WHERE conversation_id = $1`,
      [conversationId]
    );
    return rows[0] ?? null;
  }
}
