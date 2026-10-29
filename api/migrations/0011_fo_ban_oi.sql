-- F&O ban: which trade dates have been loaded (so a day with no stocks in ban,
-- NSE's "NIL", is told apart from a day not loaded), and each F&O stock's open
-- interest against its market-wide position limit, for the "near ban" list.

CREATE TABLE fo_ban_days (
  date    TEXT PRIMARY KEY,   -- the trade date the ban list applies to
  stocks  INTEGER NOT NULL
);
INSERT OR IGNORE INTO fo_ban_days (date, stocks) SELECT date, COUNT(*) FROM fo_ban GROUP BY date;

-- NSE's combined open interest across exchanges (combineoi), end of day.
-- pct_mwpl = future-equivalent OI / MWPL × 100. A stock enters the ban above
-- 95% and leaves it once it falls below 80%.
CREATE TABLE fo_oi (
  date            TEXT NOT NULL,
  symbol          TEXT NOT NULL,
  mwpl            REAL,
  open_interest   REAL,
  fut_eq_oi       REAL,
  pct_mwpl        REAL,
  next_day_limit  TEXT,        -- shares that may still be added, or "No Fresh Positions"
  PRIMARY KEY (date, symbol)
);
CREATE INDEX idx_fo_oi_date ON fo_oi(date);
