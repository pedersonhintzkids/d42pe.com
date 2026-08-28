PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS rsvps (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  client_token_hash TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 80),
  name_search TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started', 'self_confirmed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sms_opened_at TEXT,
  confirmed_at TEXT,
  sms_open_count INTEGER NOT NULL DEFAULT 0 CHECK (sms_open_count >= 0),
  referrer TEXT,
  source TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  CHECK (
    (status = 'started' AND confirmed_at IS NULL) OR
    (status = 'self_confirmed' AND confirmed_at IS NOT NULL)
  ),
  UNIQUE (event_id, client_token_hash)
);

CREATE INDEX IF NOT EXISTS rsvps_event_status_created
  ON rsvps(event_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS rsvps_event_name
  ON rsvps(event_id, name_search);

CREATE INDEX IF NOT EXISTS rsvps_event_created_id
  ON rsvps(event_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS rsvp_events (
  id TEXT PRIMARY KEY,
  rsvp_id TEXT NOT NULL REFERENCES rsvps(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'sms_opened',
      'official_host_instagram',
      'd42pe_instagram',
      'd42pe_snapchat'
    )
  ),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS rsvp_events_rsvp_created
  ON rsvp_events(rsvp_id, created_at DESC);
