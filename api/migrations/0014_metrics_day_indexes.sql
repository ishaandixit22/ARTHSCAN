-- Every market list filters on the latest as_of, and SELECT MAX(as_of) scanned the whole table.
-- These two give that lookup a covering index, and let gainers, losers and most-active walk
-- the rows in order and stop at LIMIT instead of reading and sorting every stock.
CREATE INDEX idx_metrics_day_change ON stock_metrics(as_of, change_pct);
CREATE INDEX idx_metrics_day_turnover ON stock_metrics(as_of, turnover);
