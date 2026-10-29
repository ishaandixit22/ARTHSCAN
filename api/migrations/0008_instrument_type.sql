-- Security type from Dhan's instrument list: ES (ordinary share), ETF, MF, Other
-- (exchange test symbols). Insight lists cover ordinary shares only, so liquid
-- and gold ETFs don't crowd breakouts and delivery rankings.
ALTER TABLE stocks ADD COLUMN instrument_type TEXT;
