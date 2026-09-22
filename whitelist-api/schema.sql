CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  return_url TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  x_user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  session_hash TEXT PRIMARY KEY,
  x_user_id TEXT NOT NULL REFERENCES users(x_user_id) ON DELETE CASCADE,
  token_payload TEXT NOT NULL,
  token_expires_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user_index ON sessions(x_user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_index ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS task_progress (
  x_user_id TEXT PRIMARY KEY REFERENCES users(x_user_id) ON DELETE CASCADE,
  follow_verified INTEGER NOT NULL DEFAULT 0,
  engagement_verified INTEGER NOT NULL DEFAULT 0,
  wallet_address TEXT UNIQUE,
  submitted_at INTEGER,
  updated_at INTEGER
);
