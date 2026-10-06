CREATE TABLE IF NOT EXISTS attempts (
  owner TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('reserved', 'completed', 'failed')),
  result TEXT
);
