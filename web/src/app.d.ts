declare global {
  namespace App {
    interface Locals {
      account: { id: string; name: string; email: string | null; avatar_url: string | null; plan: string } | null;
      usage: { today: number; limit: number } | null;
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
