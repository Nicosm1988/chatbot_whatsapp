CREATE TABLE IF NOT EXISTS audit_conversations (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  opened_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ NULL,
  last_event_at TIMESTAMPTZ NOT NULL,
  resolver TEXT NOT NULL DEFAULT 'bot',
  outcome TEXT NOT NULL DEFAULT 'in_progress',
  current_state TEXT NULL,
  current_step TEXT NULL,
  inbound_count INTEGER NOT NULL DEFAULT 0,
  outbound_count INTEGER NOT NULL DEFAULT 0,
  event_count INTEGER NOT NULL DEFAULT 0,
  summary TEXT NOT NULL DEFAULT '',
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  context JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS audit_events (
  conversation_id TEXT NOT NULL REFERENCES audit_conversations(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  event_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (conversation_id, sequence)
);

CREATE TABLE IF NOT EXISTS audit_active_conversations (
  contact_id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_contacts (
  contact_id TEXT PRIMARY KEY,
  contact_name TEXT NOT NULL DEFAULT '',
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  total_conversations INTEGER NOT NULL DEFAULT 0,
  total_inbound_messages INTEGER NOT NULL DEFAULT 0,
  total_outbound_messages INTEGER NOT NULL DEFAULT 0,
  last_outcome TEXT NOT NULL DEFAULT '',
  last_conversation_id TEXT NOT NULL DEFAULT '',
  tags JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_conversations_contact_last_event
  ON audit_conversations (contact_id, last_event_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_conversations_status_last_event
  ON audit_conversations (status, last_event_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_conversation_sequence
  ON audit_events (conversation_id, sequence DESC);