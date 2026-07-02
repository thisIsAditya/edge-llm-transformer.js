import "dotenv/config";
import { getPool, closePool } from "../db/pool.js";
import { runMigrations } from "../db/migrate.js";
import { EpisodicStore } from "../memory/episodic.store.js";
import { SemanticStore } from "../memory/semantic.store.js";
import { McpRegistry } from "../mcp/registry.js";
import { ExaMcpClient } from "../mcp/clients/exa.mcp.js";
import { createResearcherAgent } from "../orchestrator/researcher.agent.js";
import { initSharedDeps } from "./sessions.js";
import { buildApp } from "./app.js";
import { env } from "../config/env.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("server");

async function main() {
  const pool = getPool();
  await runMigrations(pool);

  const episodicStore = new EpisodicStore(pool);
  const semanticStore = new SemanticStore(pool);

  const registry = new McpRegistry();
  registry.register("exa", new ExaMcpClient());

  try {
    await registry.connectAll();
  } catch (err) {
    logger.warn("MCP registry connect failed (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const researcherAgent = await createResearcherAgent(registry) as any;

  initSharedDeps({ pool, episodicStore, semanticStore, registry, researcherAgent });

  const app = buildApp(episodicStore, semanticStore);
  const port = env.PORT;

  const server = app.listen(port);

  server.on("listening", () => {
    logger.info(`HTTP server listening on http://localhost:${port}`);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      logger.error(`Port ${port} is already in use — stop the other process or change PORT in .env`);
    } else {
      logger.error("HTTP server error", { error: err.message });
    }
    process.exit(1);
  });

  /** IDE terminals (incl. Cursor) may close stdin; without an open handle Node can exit immediately. */
  process.stdin.resume();

  const shutdown = async () => {
    logger.info("Shutting down...");
    server.close();
    await registry.closeAll();
    await closePool();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await new Promise<void>((resolve) => {
    server.on("close", resolve);
  });
}

main().catch((err) => {
  console.error("[fatal]", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
