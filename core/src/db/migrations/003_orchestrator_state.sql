-- Orchestrator state tables for Magentic-One-style outer/inner loop persistence

-- Outer loop: task plan, known facts, and overall status per conversation
CREATE TABLE IF NOT EXISTS task_ledger (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  facts           JSONB       NOT NULL DEFAULT '[]',
  plan            JSONB       NOT NULL DEFAULT '[]',
  status          TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'complete', 'stalled', 'failed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(conversation_id)
);

-- Inner loop: per-step progress record
CREATE TABLE IF NOT EXISTS progress_ledger (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  step_index      INTEGER     NOT NULL,
  summary         TEXT        NOT NULL DEFAULT '',
  is_progress     BOOLEAN     NOT NULL DEFAULT FALSE,
  is_complete     BOOLEAN     NOT NULL DEFAULT FALSE,
  stall_count     INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS progress_ledger_conversation_idx ON progress_ledger(conversation_id, step_index);

-- Audit log for every tool invocation
CREATE TABLE IF NOT EXISTS tool_invocations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  step_index      INTEGER     NOT NULL,
  tool_name       TEXT        NOT NULL,
  tool_call_id    TEXT,
  input           JSONB       NOT NULL DEFAULT '{}',
  output          JSONB,
  error_message   TEXT,
  duration_ms     INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tool_invocations_conversation_idx ON tool_invocations(conversation_id, step_index);
