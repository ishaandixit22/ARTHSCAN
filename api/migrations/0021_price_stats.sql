-- The stock page's long-history figures (returns, seasonality, extremes, beta, volume, technicals),
-- worked out from each stock's full daily history once per session and kept here, so a page view
-- reads one row instead of downloading 20 years of candles from Dhan. Filled outside market hours
-- by fillPriceStats (lib/chart.ts); a page that finds no current row works it out and stores it.
CREATE TABLE price_stats (
  symbol      TEXT PRIMARY KEY,   -- NSE symbol, or BSE-<symbol> for a stock listed only on BSE
  as_of       TEXT NOT NULL,      -- the last session the figures include, YYYY-MM-DD
  body        TEXT NOT NULL,      -- the priceStats answer, as JSON
  computed_at INTEGER NOT NULL    -- unix seconds
);
