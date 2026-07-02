import { createMCPClient } from "@ai-sdk/mcp";
import { env } from "../../config/env.js";
import { createLogger } from "../../utils/logger.js";

const logger = createLogger("ExaMcp");

/** Exa web-search MCP client via @ai-sdk/mcp HTTP transport. */
export class ExaMcpClient {
  private client: Awaited<ReturnType<typeof createMCPClient>> | null = null;
  private readonly serverUrl: string;

  constructor() {
    this.serverUrl = `https://mcp.exa.ai/mcp?exaApiKey=${env.EXA_API_KEY}`;
  }

  async connect(): Promise<void> {
    if (this.client) return;
    logger.info("Connecting to Exa MCP...");
    this.client = await createMCPClient({
      transport: {
        type: "http",
        url: this.serverUrl,
      },
    });
    logger.info("Exa MCP connected");
  }

  async tools(): Promise<Record<string, unknown>> {
    if (!this.client) {
      throw new Error("ExaMcpClient not connected — call connect() first.");
    }
    return this.client.tools() as Promise<Record<string, unknown>>;
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      logger.info("Exa MCP connection closed");
    }
  }
}
