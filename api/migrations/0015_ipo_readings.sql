-- Each change in an issue's grey-market premium or overall subscription as we saw it, so an issue
-- has an intraday record of its own whatever the IPO Guru plan returns. See lib/ipoguru.ts.
CREATE TABLE ipo_readings (
  slug        TEXT NOT NULL,
  at          INTEGER NOT NULL,
  gmp         REAL,
  times_total REAL,
  PRIMARY KEY (slug, at)
);
