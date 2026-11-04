-- Stocks listed only on BSE, kept apart from the NSE tables. Market-wide lists, the NSE import and
-- MAX(date) checks read stocks, daily_prices and stock_metrics, so nothing here can reach them.
-- A BSE symbol can match a different company's NSE symbol, so these tables have their own namespace.

CREATE TABLE bse_stocks (
  symbol            TEXT PRIMARY KEY,       -- BSE symbol, e.g. SIDDHA
  name              TEXT NOT NULL,
  isin              TEXT NOT NULL UNIQUE,
  dhan_security_id  TEXT NOT NULL UNIQUE,   -- Dhan's id in the BSE_EQ segment
  bse_group         TEXT,                   -- X, XT, M, MT, B ...
  median_turnover   REAL,                   -- rupees a day when added; orders the background fills
  history_at        INTEGER,                -- unix seconds of the last full chart load
  history_failed_at INTEGER                 -- unix seconds of the last failed load, retried after a day
);
CREATE INDEX idx_bse_stocks_history ON bse_stocks(history_at);

CREATE TABLE bse_daily_prices (
  symbol      TEXT NOT NULL,
  date        TEXT NOT NULL,                -- YYYY-MM-DD
  open        REAL,
  high        REAL,
  low         REAL,
  close       REAL NOT NULL,                -- the last trade until the next session's quote gives the official close
  prev_close  REAL,
  volume      INTEGER,
  turnover    REAL,                         -- rupees; estimated as volume x close on rows from charts
  PRIMARY KEY (symbol, date)
) WITHOUT ROWID;
CREATE INDEX idx_bse_daily_date ON bse_daily_prices(date);
