// How long a request path waits on a third-party data source before giving up and showing what
// it has. Scheduled jobs that download whole exchange files (jobs/daily.ts) keep their own limits.
export const UPSTREAM_TIMEOUT_MS = 3_500;
// Indian Stock API's profile answer is large (287 KB), so its cold calls get longer.
export const INDIANAPI_TIMEOUT_MS = 5_500;
