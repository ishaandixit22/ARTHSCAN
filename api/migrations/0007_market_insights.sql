-- Phase 1 market insights: delivery statistics, index valuations, F&O ban list
-- and technical signals. All from NSE's public daily report files.

-- Delivery from NSE's security-wise full bhavcopy (sec_bhavdata_full).
ALTER TABLE daily_prices ADD COLUMN deliv_qty INTEGER;
ALTER TABLE daily_prices ADD COLUMN deliv_pct REAL;

-- Every NSE index's daily close with its P/E, P/B and dividend yield (ind_close_all).
CREATE TABLE index_daily (
  index_name   TEXT NOT NULL,
  date         TEXT NOT NULL,
  open         REAL,
  high         REAL,
  low          REAL,
  close        REAL,
  change_pct   REAL,
  volume       INTEGER,
  turnover_cr  REAL,
  pe           REAL,
  pb           REAL,
  div_yield    REAL,
  PRIMARY KEY (index_name, date)
);
CREATE INDEX idx_index_daily_date ON index_daily(date);

-- Securities in the F&O ban period for each trade date (fo_secban).
CREATE TABLE fo_ban (
  date    TEXT NOT NULL,
  symbol  TEXT NOT NULL,
  PRIMARY KEY (date, symbol)
);

-- Technical signals and delivery stats, recomputed with the other metrics.
ALTER TABLE stock_metrics ADD COLUMN sma_20 REAL;
ALTER TABLE stock_metrics ADD COLUMN rsi_14 REAL;
ALTER TABLE stock_metrics ADD COLUMN macd REAL;
ALTER TABLE stock_metrics ADD COLUMN macd_signal REAL;
ALTER TABLE stock_metrics ADD COLUMN macd_hist REAL;
ALTER TABLE stock_metrics ADD COLUMN cross_signal TEXT;   -- 'golden' | 'death', 50/200-day cross in the last 5 sessions
ALTER TABLE stock_metrics ADD COLUMN cross_date TEXT;
ALTER TABLE stock_metrics ADD COLUMN breakout TEXT;       -- 'high' | 'low': closed beyond the prior 52-week range
ALTER TABLE stock_metrics ADD COLUMN vol_ratio REAL;      -- today's volume / prior 20-session average
ALTER TABLE stock_metrics ADD COLUMN deliv_pct REAL;      -- latest delivery %
ALTER TABLE stock_metrics ADD COLUMN deliv_pct_avg_20 REAL;
