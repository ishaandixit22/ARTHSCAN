-- OAuth 2.1 authorization server for the MCP endpoint, so remote connectors
-- (claude.ai, ChatGPT) can sign users in instead of pasting a token.
-- Clients register themselves (RFC 7591); every code uses PKCE S256.
-- Only hashes of secrets, codes and tokens are stored.

CREATE TABLE oauth_clients (
  client_id                   TEXT PRIMARY KEY,      -- "cli_" + 24
  client_secret_hash          TEXT,                  -- NULL for public clients
  client_name                 TEXT NOT NULL,
  redirect_uris               TEXT NOT NULL,         -- JSON array, exact-match only
  token_endpoint_auth_method  TEXT NOT NULL,         -- none | client_secret_post | client_secret_basic
  created_at                  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- An authorize request waiting for the user to sign in and approve.
CREATE TABLE oauth_requests (
  id              TEXT PRIMARY KEY,                  -- "req_" + 24, appears in the consent URL
  client_id       TEXT NOT NULL REFERENCES oauth_clients(client_id),
  redirect_uri    TEXT NOT NULL,
  state           TEXT,
  code_challenge  TEXT NOT NULL,
  scope           TEXT NOT NULL,
  resource        TEXT,
  expires_at      TEXT NOT NULL
);

CREATE TABLE oauth_codes (
  code_hash       TEXT PRIMARY KEY,
  client_id       TEXT NOT NULL,
  account_id      TEXT NOT NULL REFERENCES accounts(id),
  redirect_uri    TEXT NOT NULL,
  code_challenge  TEXT NOT NULL,
  scope           TEXT NOT NULL,
  resource        TEXT,
  expires_at      TEXT NOT NULL,
  used_at         TEXT
);

-- One row per grant. Refreshing rotates both tokens in place.
CREATE TABLE oauth_tokens (
  id                  TEXT PRIMARY KEY,              -- "grant_" + 16
  client_id           TEXT NOT NULL REFERENCES oauth_clients(client_id),
  account_id          TEXT NOT NULL REFERENCES accounts(id),
  access_hash         TEXT NOT NULL UNIQUE,
  access_expires_at   TEXT NOT NULL,
  refresh_hash        TEXT NOT NULL UNIQUE,
  refresh_expires_at  TEXT NOT NULL,
  scope               TEXT NOT NULL,
  resource            TEXT,
  last_used_at        TEXT,
  revoked_at          TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_oauth_tokens_account ON oauth_tokens(account_id);
