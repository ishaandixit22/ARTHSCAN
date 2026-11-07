import { defineConfig } from "@playwright/test";

// Point BASE_URL at a running site: a preview build against a local API, or a test deployment.
export default defineConfig({
  testDir: "test/mobile",
  fullyParallel: true,
  workers: 4,
  timeout: 45_000,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:5173",
    reducedMotion: "reduce",
    actionTimeout: 10_000,
    // Gated pages need a session while REQUIRE_SIGN_IN is on.
    storageState: process.env.SESSION_COOKIE
      ? { cookies: [{ name: "al_session", value: process.env.SESSION_COOKIE, domain: new URL(process.env.BASE_URL ?? "http://localhost:5173").hostname, path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax" }], origins: [] }
      : undefined,
  },
});
