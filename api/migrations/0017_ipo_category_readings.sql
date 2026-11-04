-- Each change in an issue's subscription by investor category as we saw it, so an issue has a
-- day-wise build-up of its own without IPO Guru's Pro plan. See jobs/ipo-readings.ts.
CREATE TABLE ipo_category_readings (
  slug   TEXT NOT NULL,
  at     INTEGER NOT NULL,
  source TEXT NOT NULL,            -- nse or ipoguru
  total  REAL,
  qib    REAL,
  nii    REAL,
  snii   REAL,
  bnii   REAL,
  retail REAL,
  PRIMARY KEY (slug, at)
);
