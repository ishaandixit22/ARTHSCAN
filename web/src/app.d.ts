declare global {
  namespace App {
    interface Locals {
      account: { id: string; name: string; email: string | null; avatar_url: string | null; plan: string } | null;
      usage: { today: number; limit: number } | null;
    }
  }
}
export {};
