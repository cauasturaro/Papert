import { defineConfig, devices } from "@playwright/test";

// The stack is started by `make e2e` from the repository root; tests never start servers.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const ci = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/test-results",
  // Every test signs up its own learners, but executions share one local worker queue.
  workers: 1,
  forbidOnly: ci,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: ci
    ? [
        ["list"],
        ["html", { outputFolder: "e2e/playwright-report", open: "never" }],
      ]
    : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
