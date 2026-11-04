-- Prebuilt screens. Large read-mostly data (every stock's candles, company figures) is kept as one
-- blob in numbered text parts, so a run reads a few dozen rows instead of hundreds of thousands.

CREATE TABLE screen_blobs (
  name   TEXT NOT NULL,            -- series, series_index, fund, min5, min5_index
  part   INTEGER NOT NULL,
  build  TEXT NOT NULL,
  body   TEXT NOT NULL,            -- base64 for binary blobs, JSON text otherwise
  PRIMARY KEY (name, part)
) WITHOUT ROWID;

-- Daily candles from before daily_prices begins, from Dhan, loaded once per stock.
CREATE TABLE price_long (
  symbol      TEXT PRIMARY KEY,
  fetched_on  TEXT NOT NULL,       -- YYYY-MM-DD; splits after this date are applied when reading
  ath         REAL,                -- highest and lowest price in the stretch held here, on that basis
  atl         REAL,
  daily       TEXT,                -- base64 Float32 rows: day number, open, high, low, close, volume
  monthly     TEXT                 -- the same, for months older than `daily` reaches
);

-- Dhan's company snapshot, refreshed weekly: shares come from its market cap at a known price.
CREATE TABLE company_snapshot (
  symbol         TEXT PRIMARY KEY,
  fetched_at     INTEGER NOT NULL, -- unix seconds
  price          REAL,             -- our close when asked
  market_cap_cr  REAL,
  pe             REAL,
  pe_to_sector   REAL,
  industry_pb    REAL
);

-- Balance-sheet ratios only the provider's company answer holds (one request per stock).
CREATE TABLE company_metrics (
  symbol          TEXT PRIMARY KEY,
  fetched_at      INTEGER NOT NULL,
  found           INTEGER NOT NULL,
  current_ratio   REAL,
  cash_per_share  REAL
);

CREATE TABLE index_members (
  index_name  TEXT NOT NULL,       -- nifty50, nifty500
  symbol      TEXT NOT NULL,
  PRIMARY KEY (index_name, symbol)
) WITHOUT ROWID;

-- The latest stored result of each weekly and intraday screen.
CREATE TABLE screen_results (
  screen_id    TEXT PRIMARY KEY,
  kind         TEXT NOT NULL,
  as_of        TEXT NOT NULL,      -- the date (weekly) or the last finished candle (intraday)
  total        INTEGER NOT NULL,
  checked      INTEGER NOT NULL,   -- stocks with the data this screen needs
  computed_at  INTEGER NOT NULL,
  body         TEXT NOT NULL       -- JSON rows
);
