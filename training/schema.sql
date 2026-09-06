CREATE TABLE IF NOT EXISTS conversations (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS training_examples (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  question TEXT NOT NULL,
  ideal_answer TEXT,
  feedback TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS conversations_session_idx
ON conversations(session_id, created_at);

CREATE INDEX IF NOT EXISTS training_status_idx
ON training_examples(status, created_at);
