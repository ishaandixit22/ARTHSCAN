declare global {
  namespace App {
    interface Locals {
      account: { id: string; name: string; email: string | null; avatar_url: string | null; plan: string } | null;
      usage: { today: number; limit: number } | null;
      /** This account may see Dhan live prices (LIVE_ACCESS on the API). */
      live: boolean;
      owner: boolean;
      /** API calls made while rendering this request, for the Server-Timing header. */
      timings?: { path: string; ms: number }[];
    }
    interface Platform {
      env?: {
        /** Service binding to the arthscan-api Worker (Cloudflare only). */
        API?: { fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> };
      };
    }
  }
}
export {};
