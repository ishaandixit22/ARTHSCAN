-- First-party funnel events: visit -> signup -> first query -> weekly / monthly active.
-- Holds no visitor id, IP or user agent. A visit is one row per browser session with only its
-- channel; signup and query rows carry the account id the product already has.
-- MCP queries are not stored here: usage_log already has one row per call (surface = 'mcp').
CREATE TABLE events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,                 -- 'visit' | 'signup' | 'query' (a site query: a signed-in view of an analysis page)
  day         TEXT NOT NULL,                 -- YYYY-MM-DD, Asia/Kolkata
  account_id  TEXT,                          -- signup and query only
  channel     TEXT NOT NULL DEFAULT 'direct', -- see lib/analytics.ts classifyChannel
  source      TEXT,                          -- utm_source, else the referrer's host
  medium      TEXT,                          -- utm_medium
  campaign    TEXT,                          -- utm_campaign
  detail      TEXT,                          -- query: the page group; visit: landing path
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_events_name_day ON events(name, day);
CREATE INDEX idx_events_account ON events(account_id, name, day);
