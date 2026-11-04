-- Tickers that changed while the security (its ISIN) stayed the same. The old symbol's data moves onto
-- the new one, and this table keeps old links, API calls and searches working.

CREATE TABLE symbol_changes (
  old_symbol  TEXT PRIMARY KEY,
  new_symbol  TEXT NOT NULL,
  isin        TEXT NOT NULL,
  old_name    TEXT,
  changed_on  TEXT NOT NULL,                -- YYYY-MM-DD, the new symbol's first session
  merged_at   INTEGER NOT NULL              -- unix seconds
);
CREATE INDEX idx_symbol_changes_new ON symbol_changes(new_symbol);
