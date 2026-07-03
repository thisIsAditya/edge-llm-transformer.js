import { ToolLoopAgent, stepCountIs, tool } from "ai";
import type { ToolSet, UIMessageStreamWriter } from "ai";
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

/** Shape of each sub-agent step emitted as a `data-subagentStep` UI part. */
export interface SubagentStepData {
  /** The parent `research` tool call this step belongs to. */
  parentToolCallId: string;
  /** Unique id for this sub-step (used to match start → end updates). */
  subStepId: string;
  toolName: string;
  phase: "start" | "end";
  /** Serialised input or output — kept small for display purposes. */
  payload: string;
}

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
  writerRef: { current: UIMessageStreamWriter | null };
}

function safeSerialise(value: unknown, maxLen = 400): string {
  try {
    const s = typeof value === "string" ? value : JSON.stringify(value);
    return s.length > maxLen ? s.slice(0, maxLen) + "…" : s;
  } catch {
    return String(value);
  }
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
    writerRef,
    pool,
  } = deps;

  const { memory_search, memory_save } = createMemoryTools({ conversationId, semanticStore });

  const researchTool = tool({
    description:
      "Delegate a research task to the Researcher sub-agent, which uses web search and other tools to gather information. " +
      "Provide a clear, specific task description. Returns a text summary of findings.",
    inputSchema: z.object({
      task: z.string().describe("The specific research question or task to investigate."),
    }),
    execute: async ({ task }, { toolCallId }) => {
      logger.info("Delegating to researcher", { task: task.slice(0, 80) });

      const writer = writerRef.current;

      try {
        const result = await researcherAgent.generate({
          prompt: task,
          onToolExecutionStart: ({ toolCall }) => {
            if (!writer) return;
            const step: SubagentStepData = {
              parentToolCallId: toolCallId,
              subStepId: toolCall.toolCallId,
              toolName: toolCall.toolName,
              phase: "start",
              payload: safeSerialise(toolCall.input),
            };
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (writer as any).write({ type: "data-subagentStep", data: step });
            } catch {
              // non-fatal — stream may have already closed
            }
          },
          onToolExecutionEnd: ({ toolCall, toolOutput }) => {
            if (!writer) return;
            const output =
              toolOutput.type === "tool-result"
                ? toolOutput.output
                : toolOutput.type === "tool-error"
                  ? toolOutput.error
                  : undefined;
            const step: SubagentStepData = {
              parentToolCallId: toolCallId,
              subStepId: toolCall.toolCallId,
              toolName: toolCall.toolName,
              phase: "end",
              payload: safeSerialise(output),
            };
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (writer as any).write({ type: "data-subagentStep", data: step });
            } catch {
              // non-fatal
            }
          },
        });

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
      "## Role",
      "You are a precise, knowledgeable orchestrator agent. Your job is to give the user complete, accurate, well-structured answers — not drafts or hedging placeholders.",
      "",
      "## Decision rules (follow in order)",
      "1. If the user asks about something you can answer confidently from established knowledge, answer directly. Do NOT call tools unnecessarily.",
      "2. If the answer depends on recent events, real-time data, specific URLs, or verifiable facts you are not certain about, call the `research` tool with a concrete, specific task description.",
      "3. Before calling `research`, check `memory_search` for previously retrieved context — use it if it is relevant.",
      "4. After receiving research findings, synthesize them into the final answer immediately. Do not call `research` a second time unless the first returned nothing useful.",
      "",
      "## Output quality bar",
      "- Give concrete facts, figures, and sources whenever available. Never substitute vague generalities when specifics exist.",
      "- If information is genuinely uncertain, state exactly what you verified and what remains unknown — do not guess.",
      "- Structure multi-part answers with clear headings or numbered lists.",
      "- Save important new facts the user may ask about again using `memory_save` before producing the final answer.",
      "",
      "## Final answer rule",
      "Once you have a complete answer, write it in plain prose (markdown allowed). Do NOT call any more tools after this point.",
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
