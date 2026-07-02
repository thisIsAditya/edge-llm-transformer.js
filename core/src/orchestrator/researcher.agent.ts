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
      "You are a focused research assistant. Your sole job is to gather information using the available tools and return a concise, factual summary.",
      "Use the search tools to find relevant information. Do not speculate beyond what you find.",
      "Respond with a clear, well-structured summary. Do not ask follow-up questions.",
    ].join("\n"),
    tools: mcpTools,
    stopWhen: [stepCountIs(8)],
    maxOutputTokens: 1024,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as unknown as ToolLoopAgent<never, any>;
}
