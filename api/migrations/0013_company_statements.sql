-- Every company's full financial statements (quarterly and yearly results, balance sheet, cash
-- flow, ratios, shareholding) stored once, as the provider's `stats=all` answer, so a stock page
-- reads one row instead of waiting on the provider. A background job fills it, largest companies
-- first; `found` = 0 marks a company the provider doesn't know (asked again after a month).

CREATE TABLE company_statements (
  symbol      TEXT PRIMARY KEY,
  body        TEXT NOT NULL,          -- JSON: { quarter_results, yoy_results, balancesheet, cashflow, ratios, ... }
  fetched_at  INTEGER NOT NULL,       -- unix seconds
  found       INTEGER NOT NULL DEFAULT 1
);
