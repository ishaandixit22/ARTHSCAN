-- Split/bonus adjustment. daily_prices keeps the raw exchange prices; `adj`
-- is the multiplier that puts a row on today's share basis (1 = no later
-- corporate action). Charts, returns and the 52-week range use price * adj.

ALTER TABLE daily_prices ADD COLUMN adj REAL NOT NULL DEFAULT 1;

CREATE TABLE price_adjustments (
  symbol    TEXT NOT NULL,
  ex_date   TEXT NOT NULL,                   -- first session on the new basis
  factor    REAL NOT NULL,                   -- e.g. 0.5 for a 1:1 bonus or 2-for-1 split
  source    TEXT NOT NULL,                   -- 'detected' | 'manual'
  note      TEXT,
  PRIMARY KEY (symbol, ex_date)
);
