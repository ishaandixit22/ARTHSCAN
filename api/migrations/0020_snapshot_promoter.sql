-- Promoter holding from Dhan's company answer (its latest shareholding pattern), kept with the
-- snapshot. 1 − promoter holding is the free-float factor (IWF) for index weights.
ALTER TABLE company_snapshot ADD COLUMN promoter_pct REAL;
