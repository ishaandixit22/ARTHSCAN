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
  },
});
