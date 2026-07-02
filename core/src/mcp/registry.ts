import { createLogger } from "../utils/logger.js";

const logger = createLogger("McpRegistry");

export interface McpClientAdapter {
  connect(): Promise<void>;
  tools(): Promise<Record<string, unknown>>;
  close(): Promise<void>;
}

/**
 * Aggregates MCP clients; tools are exposed as `<serverName>__<toolName>`.
 */
export class McpRegistry {
  private readonly clients = new Map<string, McpClientAdapter>();

  register(name: string, client: McpClientAdapter): void {
    if (this.clients.has(name)) {
      throw new Error(`McpRegistry: client "${name}" is already registered.`);
    }
    this.clients.set(name, client);
  }

  async connectAll(): Promise<void> {
    for (const [name, client] of this.clients) {
      try {
        await client.connect();
        logger.info(`Connected: ${name}`);
      } catch (err) {
        logger.error(`Failed to connect MCP client "${name}" (non-fatal, tools will be absent)`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  async allTools(): Promise<Record<string, unknown>> {
    const merged: Record<string, unknown> = {};

    for (const [name, client] of this.clients) {
      try {
        const tools = await client.tools();
        for (const [toolName, toolDef] of Object.entries(tools)) {
          const key = `${name}__${toolName}`;
          merged[key] = toolDef;
        }
      } catch (err) {
        logger.error(`Failed to retrieve tools from "${name}"`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return merged;
  }

  async closeAll(): Promise<void> {
    for (const [name, client] of this.clients) {
      try {
        await client.close();
      } catch (err) {
        logger.warn(`Error closing MCP client "${name}"`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    this.clients.clear();
  }
}
