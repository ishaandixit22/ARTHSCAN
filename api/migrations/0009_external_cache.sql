-- Response cache for third-party data APIs (Indian Stock API). Each tool call
-- would otherwise spend one request from the vendor plan; rows expire by the
-- per-endpoint TTL in lib/indianapi.ts.
CREATE TABLE external_cache (
  key         TEXT PRIMARY KEY,
  body        TEXT NOT NULL,
  fetched_at  INTEGER NOT NULL
);
