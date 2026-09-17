import { afterEach, describe, expect, it, vi } from "vitest";
import { appEnvironment, appRelease, appTracesSampleRate } from "../version";

describe("appEnvironment", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses VITE_SENTRY_ENVIRONMENT when set explicitly", () => {
    vi.stubEnv("VITE_SENTRY_ENVIRONMENT", "preview");
    expect(appEnvironment()).toBe("preview");
  });

  it("never silently reports 'production' while running under vitest/dev", () => {
    // Explicitly cleared rather than relying on the ambient .env not
    // setting this — a real local .env (e.g. while testing a real Sentry
    // DSN) legitimately sets VITE_SENTRY_ENVIRONMENT, which would otherwise
    // make this test's outcome depend on developer machine state.
    vi.stubEnv("VITE_SENTRY_ENVIRONMENT", undefined);
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
    // Explicitly cleared for the same reason as appEnvironment's dev test —
    // don't depend on the ambient .env not setting this.
    vi.stubEnv("VITE_SENTRY_TRACES_SAMPLE_RATE", undefined);
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

describe("appRelease", () => {
  it("uses packageVersion+versionCode, matching what's visible in the Play Console/APK itself", () => {
    // Not hardcoding the current version/versionCode — this just locks the
    // shape (rotazro-entregador@<versionName>+<versionCode>), which is what
    // this round explicitly changed away from a git-commit suffix.
    expect(appRelease()).toMatch(/^rotazro-entregador@\d+\.\d+\.\d+\+\d+$/);
  });
});
