import { runMigrations } from "../src/db/migrate.js";
import { getPool, closePool } from "../src/db/pool.js";

async function main(): Promise<void> {
  console.log("[db:migrate] Starting...");
  try {
    await runMigrations(getPool());
    console.log("[db:migrate] All migrations applied successfully.");
  } finally {
    await closePool();
  }
}

main().catch((err) => {
  console.error("[db:migrate] Fatal:", err);
  process.exit(1);
});
