-- Google sign-in now keeps its in-flight handshake in a sealed, short-lived
-- cookie (src/lib/google.ts), so this table is no longer used.
DROP TABLE IF EXISTS oauth_states;
