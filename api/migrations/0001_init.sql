-- Arthlens initial schema. Plain SQLite so it runs unchanged on Cloudflare D1.
--
-- Market data tables are written only by the pipeline; every surface (website,
-- REST, MCP) reads them through the shared handlers in api/src/handlers.

-- ── Market data ─────────────────────────────────────────────────────

CREATE TABLE stocks (
  symbol        TEXT PRIMARY KEY,            -- NSE symbol, e.g. RELIANCE
  name          TEXT NOT NULL,
  isin          TEXT,
  series        TEXT,                        -- EQ, BE, SM ...
  sector        TEXT,                        -- from NSE index constituent lists
  listing_date  TEXT,                        -- YYYY-MM-DD
  face_value    REAL,
  market_lot    INTEGER,
  is_active     INTEGER NOT NULL DEFAULT 1,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_stocks_sector ON stocks(sector);
CREATE INDEX idx_stocks_isin   ON stocks(isin);

CREATE TABLE daily_prices (
  symbol      TEXT NOT NULL,
  date        TEXT NOT NULL,                 -- YYYY-MM-DD
  open        REAL,
  high        REAL,
  low         REAL,
  close       REAL NOT NULL,
  prev_close  REAL,
  volume      INTEGER,
  turnover    REAL,                          -- INR
  trades      INTEGER,
  PRIMARY KEY (symbol, date)
);
CREATE INDEX idx_prices_date ON daily_prices(date);

-- Precomputed per-stock snapshot (refreshed after each pipeline run) so the
-- screener and lists never scan full history.
CREATE TABLE stock_metrics (
  symbol          TEXT PRIMARY KEY,
  as_of           TEXT NOT NULL,
  close           REAL,
  change_pct      REAL,
  volume          INTEGER,
  turnover        REAL,
  avg_volume_20d  REAL,
  high_52w        REAL,
  low_52w         REAL,
  pct_from_high   REAL,                      -- negative = below 52w high
  ret_1w          REAL,
  ret_1m          REAL,
  ret_3m          REAL,
  ret_6m          REAL,
  ret_1y          REAL,
  volatility_1y   REAL,                      -- annualised, %
  sma_50          REAL,
  sma_200         REAL,
  pe              REAL,                      -- from imported financials, if any
  eps_ttm         REAL,
  promoter_pct    REAL                       -- from imported shareholding, if any
);

CREATE TABLE fii_dii (
  date        TEXT NOT NULL,                 -- YYYY-MM-DD
  category    TEXT NOT NULL,                 -- 'FII' or 'DII'
  buy_value   REAL NOT NULL,                 -- INR crore
  sell_value  REAL NOT NULL,
  net_value   REAL NOT NULL,
  PRIMARY KEY (date, category)
);

-- Financials and shareholding are imported from files (XBRL parse or vendor
-- feed) — see pipeline/README.md for the formats.
CREATE TABLE financials (
  symbol            TEXT NOT NULL,
  period_end        TEXT NOT NULL,           -- YYYY-MM-DD
  period_type       TEXT NOT NULL,           -- 'Q' quarterly, 'A' annual
  consolidated      INTEGER NOT NULL DEFAULT 1,
  revenue           REAL,                    -- INR crore
  expenses          REAL,
  operating_profit  REAL,
  other_income      REAL,
  depreciation      REAL,
  interest          REAL,
  pbt               REAL,
  tax               REAL,
  net_profit        REAL,
  eps               REAL,                    -- INR
  PRIMARY KEY (symbol, period_end, period_type, consolidated)
);

CREATE TABLE shareholding (
  symbol        TEXT NOT NULL,
  quarter_end   TEXT NOT NULL,               -- YYYY-MM-DD
  promoter      REAL,                        -- % of total
  fii           REAL,
  dii           REAL,
  public        REAL,
  government    REAL,
  others        REAL,
  pledged_pct   REAL,                        -- % of promoter holding pledged
  PRIMARY KEY (symbol, quarter_end)
);

CREATE TABLE pipeline_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  job         TEXT NOT NULL,
  target      TEXT,                          -- e.g. the trade date
  status      TEXT NOT NULL,                 -- ok | skipped | error
  rows        INTEGER,
  message     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Accounts, tokens, quota ─────────────────────────────────────────

CREATE TABLE accounts (
  id          TEXT PRIMARY KEY,              -- "acct_" + 16
  name        TEXT NOT NULL,
  email       TEXT,
  avatar_url  TEXT,
  google_sub  TEXT UNIQUE,                   -- linked on the immutable sub claim
  plan        TEXT NOT NULL DEFAULT 'free',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,             -- random cookie value, never an API token
  account_id   TEXT NOT NULL REFERENCES accounts(id),
  auth_method  TEXT NOT NULL,                -- 'google' | 'dev'
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at   TEXT NOT NULL,
  revoked_at   TEXT
);
CREATE INDEX idx_sessions_account ON sessions(account_id);

CREATE TABLE oauth_states (
  state       TEXT PRIMARY KEY,
  verifier    TEXT NOT NULL,
  return_to   TEXT,
  expires_at  TEXT NOT NULL
);

CREATE TABLE api_tokens (
  id            TEXT PRIMARY KEY,            -- "tok_" + 16
  account_id    TEXT NOT NULL REFERENCES accounts(id),
  name          TEXT NOT NULL,
  token_prefix  TEXT NOT NULL,               -- shown in the UI, e.g. "al_ab12cd34"
  token_hash    TEXT NOT NULL UNIQUE,        -- peppered SHA-256 of the full token
  last_used_at  TEXT,
  revoked_at    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_tokens_account ON api_tokens(account_id);

-- One row per account per IST day. The quota check and the increment are the
-- same UPDATE, so concurrent calls cannot overshoot the limit.
CREATE TABLE usage_daily (
  account_id  TEXT NOT NULL,
  day         TEXT NOT NULL,                 -- YYYY-MM-DD, Asia/Kolkata
  calls       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, day)
);

CREATE TABLE usage_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id  TEXT NOT NULL,
  token_id    TEXT,
  surface     TEXT NOT NULL,                 -- 'rest' | 'mcp'
  tool        TEXT NOT NULL,
  ok          INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_usage_log_account ON usage_log(account_id, created_at);
