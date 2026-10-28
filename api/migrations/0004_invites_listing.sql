-- Private beta: while INVITE_ONLY is "true", only these emails can sign in, and
-- removing a row cuts off that account's sessions, API tokens and OAuth grants.
CREATE TABLE invites (
  email       TEXT PRIMARY KEY,              -- lowercased
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- First session in the stored price window. Equal to as_of on listing day, when
-- the day's "change" is measured against the issue price, not a prior close.
ALTER TABLE stock_metrics ADD COLUMN first_date TEXT;
