-- FPI equity flows from NSDL (fpi.nsdl.co.in), the depository's custodian-confirmed
-- figures. INR crore.

-- "Daily Trends in FPI Investments": equity sub-total (stock exchange + primary
-- market) per reporting date. Reporting date = trades of the previous session.
CREATE TABLE fpi_daily (
  date         TEXT PRIMARY KEY,
  equity_buy   REAL,
  equity_sell  REAL,
  equity_net   REAL
);

-- "Fortnightly Sector-wise FPI Investment data": net equity investment during the
-- fortnight ending period_end, and equity assets under custody at period_end.
-- Sectors follow BSE's industry classification (22 sectors + Sovereign, Others and
-- Grand Total), which NSDL has used since April 2022.
CREATE TABLE fpi_sector (
  period_end   TEXT NOT NULL,
  sector       TEXT NOT NULL,
  equity_net   REAL,
  equity_auc   REAL,
  PRIMARY KEY (period_end, sector)
);
