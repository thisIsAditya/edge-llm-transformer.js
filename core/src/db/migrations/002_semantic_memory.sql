-- Semantic memory items stored with pgvector embeddings
-- Embedding dimension 768 is fixed for nomic-embed-text.
-- Changing models requires a migration + full re-embed.
CREATE TABLE IF NOT EXISTS memory_items (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID        REFERENCES conversations(id) ON DELETE SET NULL,
  kind            TEXT        NOT NULL CHECK (kind IN ('fact', 'summary', 'preference')),
  content         TEXT        NOT NULL,
  source_message_ids UUID[]   NOT NULL DEFAULT '{}',
  importance      REAL        NOT NULL DEFAULT 0.5 CHECK (importance >= 0 AND importance <= 1),
  embedding       vector(768) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HNSW index for cosine similarity search.
-- m=16, ef_construction=128 is a solid default for this scale.
CREATE INDEX IF NOT EXISTS memory_items_embedding_idx
  ON memory_items
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);

CREATE INDEX IF NOT EXISTS memory_items_conversation_idx ON memory_items(conversation_id);
CREATE INDEX IF NOT EXISTS memory_items_kind_idx ON memory_items(kind);
