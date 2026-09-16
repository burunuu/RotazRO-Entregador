import { afterEach, describe, expect, it, vi } from "vitest";
import { appEnvironment, appTracesSampleRate } from "../version";

describe("appEnvironment", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses VITE_SENTRY_ENVIRONMENT when set explicitly", () => {
    vi.stubEnv("VITE_SENTRY_ENVIRONMENT", "preview");
    expect(appEnvironment()).toBe("preview");
  });

  it("never silently reports 'production' while running under vitest/dev", () => {
    // vitest itself runs with import.meta.env.DEV === true, exercising the
    // same fallback path as `vite dev` — this is the bug this fixes: a
    // local dev session must never claim to be "production" by default.
    expect(appEnvironment()).toBe("development");
  });
});

describe("appTracesSampleRate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to 0.1 with no override", () => {
    expect(appTracesSampleRate()).toBe(0.1);
  });

  it("respects a valid override", () => {
    vi.stubEnv("VITE_SENTRY_TRACES_SAMPLE_RATE", "0.25");
    expect(appTracesSampleRate()).toBe(0.25);
  });

  it("falls back to the default on an out-of-range value", () => {
    vi.stubEnv("VITE_SENTRY_TRACES_SAMPLE_RATE", "5");
    expect(appTracesSampleRate()).toBe(0.1);
  });

  it("falls back to the default on a non-numeric value", () => {
    vi.stubEnv("VITE_SENTRY_TRACES_SAMPLE_RATE", "not-a-number");
    expect(appTracesSampleRate()).toBe(0.1);
  });
});
