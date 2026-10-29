-- Results season loading: which companies the results job has asked the
-- provider about for a quarter, so each company costs one request per season
-- (a company the provider hasn't updated yet is retried after a day).

CREATE TABLE results_checks (
  symbol       TEXT NOT NULL,
  quarter_end  TEXT NOT NULL,      -- YYYY-MM-DD, e.g. 2026-09-30
  checked_at   TEXT NOT NULL,      -- datetime('now') when last asked
  found        INTEGER NOT NULL,   -- 1 when the provider had this quarter
  PRIMARY KEY (symbol, quarter_end)
);
CREATE INDEX idx_financials_q_period ON financials(period_type, period_end);
