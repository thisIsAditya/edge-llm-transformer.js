import { v4 as uuidv4 } from "uuid";
import type pg from "pg";
import { buildOrchestrator } from "../orchestrator/orchestrator.agent.js";
import { WorkingMemory } from "../memory/working-memory.js";
import { TaskLedgerStore } from "../orchestrator/task-ledger.js";
import { ProgressLedgerStore } from "../orchestrator/progress-ledger.js";
import type { EpisodicStore } from "../memory/episodic.store.js";
import type { SemanticStore } from "../memory/semantic.store.js";
import type { McpRegistry } from "../mcp/registry.js";
import type { ToolLoopAgent } from "ai";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("sessions");

interface Session {
  orchestrator: ToolLoopAgent<never>;
  workingMemory: WorkingMemory;
}

interface SharedDeps {
  pool: pg.Pool;
  episodicStore: EpisodicStore;
  semanticStore: SemanticStore;
  registry: McpRegistry;
  researcherAgent: ToolLoopAgent<never>;
}

const sessions = new Map<string, Session>();
let sharedDeps: SharedDeps | null = null;

export function initSharedDeps(deps: SharedDeps): void {
  sharedDeps = deps;
}

export async function getOrCreateSession(conversationId: string): Promise<Session> {
  const existing = sessions.get(conversationId);
  if (existing) return existing;

  if (!sharedDeps) throw new Error("Server not initialised — call initSharedDeps first");

  const { pool, episodicStore, semanticStore, researcherAgent } = sharedDeps;

  const workingMemory = new WorkingMemory();
  const taskLedgerStore = new TaskLedgerStore(pool);
  const progressLedgerStore = new ProgressLedgerStore(pool);

  const orchestrator = buildOrchestrator({
    pool,
    conversationId,
    semanticStore,
    episodicStore,
    workingMemory,
    taskLedgerStore,
    progressLedgerStore,
    researcherAgent,
  }) as ToolLoopAgent<never>;

  const session: Session = { orchestrator, workingMemory };
  sessions.set(conversationId, session);
  logger.info("Session created", { conversationId });
  return session;
}

export function destroySession(conversationId: string): void {
  sessions.delete(conversationId);
}

export { uuidv4 };
