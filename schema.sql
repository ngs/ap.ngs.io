-- Accounts (public information only, private keys in Workers Secrets)
CREATE TABLE IF NOT EXISTS accounts (
  handle TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  summary TEXT DEFAULT '',
  icon_url TEXT,
  image_url TEXT,
  public_key TEXT NOT NULL,
  manually_approves_followers INTEGER DEFAULT 0,
  discoverable INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Posts
CREATE TABLE IF NOT EXISTS posts (
  id TEXT NOT NULL,
  handle TEXT NOT NULL,
  content TEXT NOT NULL,
  content_html TEXT NOT NULL,
  published_at TEXT NOT NULL,
  in_reply_to TEXT,
  conversation TEXT,
  sensitive INTEGER DEFAULT 0,
  summary TEXT,
  media_urls TEXT,          -- JSON array of local URLs
  tags TEXT,                -- JSON array
  visibility TEXT DEFAULT 'public',  -- public, unlisted, followers, direct
  federated_at TEXT,        -- NULL if not yet broadcast to followers
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (handle, id)
);

-- Followers
CREATE TABLE IF NOT EXISTS followers (
  handle TEXT NOT NULL,
  actor_url TEXT NOT NULL,
  inbox_url TEXT NOT NULL,
  shared_inbox_url TEXT,
  actor_json TEXT,
  followed_at TEXT NOT NULL,
  PRIMARY KEY (handle, actor_url)
);

-- Following
CREATE TABLE IF NOT EXISTS following (
  handle TEXT NOT NULL,
  actor_url TEXT NOT NULL,
  inbox_url TEXT NOT NULL,
  accepted INTEGER DEFAULT 0,
  requested_at TEXT NOT NULL,
  accepted_at TEXT,
  PRIMARY KEY (handle, actor_url)
);

-- Received Activities
CREATE TABLE IF NOT EXISTS inbox_activities (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL,
  type TEXT NOT NULL,
  actor_url TEXT NOT NULL,
  object_url TEXT,
  object_json TEXT,
  received_at TEXT NOT NULL,
  synced_to_github INTEGER DEFAULT 0
);

-- Delivery Queue (for retries)
CREATE TABLE IF NOT EXISTS delivery_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  handle TEXT NOT NULL,
  activity_json TEXT NOT NULL,
  target_inbox TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_posts_handle_published ON posts(handle, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_followers_handle ON followers(handle);
CREATE INDEX IF NOT EXISTS idx_following_handle ON following(handle);
CREATE INDEX IF NOT EXISTS idx_inbox_handle_received ON inbox_activities(handle, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_not_synced ON inbox_activities(synced_to_github) WHERE synced_to_github = 0;
CREATE INDEX IF NOT EXISTS idx_delivery_next ON delivery_queue(next_attempt_at) WHERE attempts < 10;
