import { ToolLoopAgent, stepCountIs, tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";
import { getChatModel } from "../models/provider.js";
import { buildMemoryContext } from "../memory/retrieval.js";
import { createMemoryTools } from "../tools/memory.tools.js";
import type { SemanticStore } from "../memory/semantic.store.js";
import type { WorkingMemory } from "../memory/working-memory.js";
import type { EpisodicStore } from "../memory/episodic.store.js";
import type { TaskLedgerStore } from "./task-ledger.js";
import type { ProgressLedgerStore } from "./progress-ledger.js";
import type pg from "pg";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("orchestrator");

export interface OrchestratorDeps {
  pool: pg.Pool;
  conversationId: string;
  semanticStore: SemanticStore;
  episodicStore: EpisodicStore;
  workingMemory: WorkingMemory;
  taskLedgerStore: TaskLedgerStore;
  progressLedgerStore: ProgressLedgerStore;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  researcherAgent: ToolLoopAgent<never, any>;
}

/**
 * Builds the orchestrator ToolLoopAgent.
 * `prepareStep` refreshes memory and stall nudges; `onStepFinish` persists ledger rows.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildOrchestrator(deps: OrchestratorDeps): ToolLoopAgent<never, any> {
  const {
    conversationId,
    semanticStore,
    workingMemory,
    taskLedgerStore,
    progressLedgerStore,
    researcherAgent,
    pool,
  } = deps;

  const { memory_search, memory_save } = createMemoryTools({ conversationId, semanticStore });

  const researchTool = tool({    description:
      "Delegate a research task to the Researcher sub-agent, which uses web search and other tools to gather information. " +
      "Provide a clear, specific task description. Returns a text summary of findings.",
    inputSchema: z.object({
      task: z.string().describe("The specific research question or task to investigate."),
    }),
    execute: async ({ task }) => {
      logger.info("Delegating to researcher", { task: task.slice(0, 80) });
      try {
        const result = await researcherAgent.generate({ prompt: task });
        return { findings: result.text || "(No findings returned)" };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("Researcher sub-agent failed", { error: msg });
        return { findings: `Research failed: ${msg}` };
      }
    },
  });

  return new ToolLoopAgent({
    model: getChatModel(),
    instructions: [
      "You are a capable orchestrator agent. You decompose tasks, delegate research, manage memory, and produce complete answers.",
      "Workflow:",
      "1. For each user request, decide whether you need to search memory (memory_search) or do external research (research tool).",
      "2. After gathering information, compose a comprehensive answer.",
      "3. Save important facts to memory using memory_save.",
      "4. Once you have a complete answer, respond with plain prose text. Do not call any additional tools after you have your final answer.",
    ].join("\n"),
    tools: {
      research: researchTool,
      memory_search,
      memory_save,
    } satisfies ToolSet,
    stopWhen: [
      stepCountIs(15),
    ],

    prepareStep: async ({ steps, instructions, initialInstructions }) => {
      const query =
        steps.length > 0
          ? (steps[steps.length - 1]?.text ?? "").slice(0, 200)
          : "general context";

      const memCtx = await buildMemoryContext({
        conversationId,
        query,
        working: workingMemory,
        semantic: semanticStore,
      });

      let augmentedInstructions = initialInstructions ?? instructions ?? "";

      if (memCtx.formatted.trim()) {
        augmentedInstructions = `${augmentedInstructions}\n\n${memCtx.formatted}`;
      }

      if (steps.length >= 3) {
        try {
          const stalled = await progressLedgerStore.isStalled(conversationId);
          if (stalled) {
            logger.warn("Stall detected — injecting replan nudge", { step: steps.length });
            augmentedInstructions +=
              "\n\n⚠️ You appear to be making no progress. Reconsider your approach, try a different research angle, or respond with your best answer so far.";
          }
        } catch {
        }
      }

      if (steps.length === 0) {
        try {
          await taskLedgerStore.getOrCreate(conversationId);
        } catch {
        }
      }

      return { instructions: augmentedInstructions };
    },

    onStepFinish: async ({ stepNumber, text, toolCalls, toolResults }) => {
      const isProgress =
        (toolCalls?.length ?? 0) > 0 ||
        (typeof text === "string" && text.length > 10);

      const isComplete = (typeof text === "string" && text.length > 10) && (toolCalls?.length ?? 0) === 0;

      const currentStall = isProgress ? 0 : 1;

      try {
        await progressLedgerStore.record({
          conversationId,
          stepIndex: stepNumber,
          summary: (text ?? "").slice(0, 500),
          isProgress,
          isComplete,
          stallCount: currentStall,
        });
      } catch (err) {
        logger.warn("Failed to persist progress_ledger entry", {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      if (toolCalls && toolCalls.length > 0) {
        for (const tc of toolCalls) {
          const matchingResult = toolResults?.find((r) => r.toolCallId === tc.toolCallId);
          try {
            await pool.query(
              `INSERT INTO tool_invocations
                 (conversation_id, step_index, tool_name, tool_call_id, input, output)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                conversationId,
                stepNumber,
                tc.toolName,
                tc.toolCallId,
                JSON.stringify(tc.input ?? {}),
                matchingResult ? JSON.stringify(matchingResult.output) : null,
              ]
            );
          } catch (err) {
            logger.warn("Failed to persist tool_invocation audit row", {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
    },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as unknown as ToolLoopAgent<never, any>;
}
