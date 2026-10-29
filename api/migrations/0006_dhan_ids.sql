-- Dhan's numeric security id for each NSE stock, used to subscribe to its live
-- feed. Filled by the pipeline's stocks job from Dhan's public instrument list.
ALTER TABLE stocks ADD COLUMN dhan_security_id TEXT;
CREATE INDEX idx_stocks_dhan ON stocks(dhan_security_id);
