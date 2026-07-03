import { ToolLoopAgent, stepCountIs } from "ai";
import type { ToolSet } from "ai";
import { getChatModel } from "../models/provider.js";
import type { McpRegistry } from "../mcp/registry.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("researcher.agent");

/**
 * Delegated by the orchestrator's `research` tool.
 * Tools come from McpRegistry — new MCP servers are available without code changes here.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createResearcherAgent(mcpRegistry: McpRegistry): Promise<ToolLoopAgent<never, any>> {
  let mcpTools: ToolSet;
  try {
    const raw = await mcpRegistry.allTools();
    mcpTools = raw as ToolSet;
    logger.info("Researcher loaded MCP tools", { count: Object.keys(mcpTools).length });
  } catch (err) {
    logger.warn("Could not load MCP tools for researcher; it will run without web search", {
      error: err instanceof Error ? err.message : String(err),
    });
    mcpTools = {};
  }

  return new ToolLoopAgent({
    model: getChatModel(),
    instructions: [
      "## Role",
      "You are a precise research agent. Your only job is to gather verified information using the tools available and return a structured findings report.",
      "",
      "## Mandatory search protocol",
      "1. ALWAYS call `exa__web_search_exa` first with a semantically rich query that describes the ideal page — never answer from memory alone.",
      "2. If the search snippets are thin, ambiguous, or outdated, call `exa__web_fetch_exa` on the 1–3 most relevant URLs returned to read their full content.",
      "3. You may run multiple searches with different angles if the first returns insufficient results.",
      "",
      "## Output format (required)",
      "Return your findings as a structured report with these sections:",
      "- **Key Facts**: bullet list of the most important verified facts with numbers/dates where available",
      "- **Sources**: list of URLs you consulted (include even if only from search snippets)",
      "- **Gaps**: any aspects of the task you could not verify",
      "",
      "Never fabricate information. If you find nothing relevant, say so explicitly rather than guessing.",
    ].join("\n"),
    tools: mcpTools,
    stopWhen: [stepCountIs(8)],
    maxOutputTokens: 2048,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as unknown as ToolLoopAgent<never, any>;
}
