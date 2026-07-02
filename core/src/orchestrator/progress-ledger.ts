import type pg from "pg";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("progress-ledger");

const STALL_THRESHOLD = 3;

export interface ProgressEntry {
  id: string;
  conversationId: string;
  stepIndex: number;
  summary: string;
  isProgress: boolean;
  isComplete: boolean;
  stallCount: number;
  createdAt: Date;
}

export class ProgressLedgerStore {
  constructor(private readonly pool: pg.Pool) {}

  async record(entry: Omit<ProgressEntry, "id" | "createdAt">): Promise<void> {
    await this.pool.query(
      `INSERT INTO progress_ledger
         (conversation_id, step_index, summary, is_progress, is_complete, stall_count)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        entry.conversationId,
        entry.stepIndex,
        entry.summary,
        entry.isProgress,
        entry.isComplete,
        entry.stallCount,
      ]
    );
    logger.debug("Progress recorded", {
      step: entry.stepIndex,
      isProgress: entry.isProgress,
    });
  }

  async getRecent(conversationId: string, limit = 10): Promise<ProgressEntry[]> {
    const { rows } = await this.pool.query<ProgressEntry>(
      `SELECT id, conversation_id AS "conversationId", step_index AS "stepIndex",
              summary, is_progress AS "isProgress", is_complete AS "isComplete",
              stall_count AS "stallCount", created_at AS "createdAt"
       FROM progress_ledger
       WHERE conversation_id = $1
       ORDER BY step_index DESC
       LIMIT $2`,
      [conversationId, limit]
    );
    return rows.reverse();
  }

  /** True when the last STALL_THRESHOLD steps recorded no progress. */
  async isStalled(conversationId: string): Promise<boolean> {
    const recent = await this.getRecent(conversationId, STALL_THRESHOLD);
    if (recent.length < STALL_THRESHOLD) return false;
    return recent.every((e) => !e.isProgress);
  }
}
