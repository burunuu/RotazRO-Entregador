import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureError, addBreadcrumbSafe, isSentryEnabled, setSentryEnabled } from "../capture";

// These tests deliberately never call setSentryEnabled(true) — this is
// exactly the "no DSN configured" state the app runs in whenever Sentry
// isn't set up, and it must be a true no-op (see
// docs/ROTazRO_OBSERVABILITY.md, "Funciona sem Sentry configurado").
describe("capture — no-op when Sentry is not enabled", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setSentryEnabled(false);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("isSentryEnabled() is false by default", () => {
    expect(isSentryEnabled()).toBe(false);
  });

  it("captureError never throws and still logs a structured error line", () => {
    expect(() => captureError(new Error("boom"), { event: "test.thing_broke", route_id: "r-1" })).not.toThrow();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(errorSpy.mock.calls[0]![0] as string);
    expect(parsed.event).toBe("test.thing_broke");
    expect(parsed.route_id).toBe("r-1");
    expect(parsed.message).toBe("boom");
    expect(typeof parsed.offline).toBe("boolean");
  });

  it("captureError works with non-Error values (string, object) without throwing", () => {
    expect(() => captureError("plain string error")).not.toThrow();
    expect(() => captureError({ code: "PGRST116" })).not.toThrow();
    expect(() => captureError(undefined)).not.toThrow();
  });

  it("addBreadcrumbSafe never throws when Sentry is disabled", () => {
    expect(() => addBreadcrumbSafe({ message: "clicked", category: "ui" })).not.toThrow();
  });

  it("extra fields flow through into the log line, ids take precedence over generic naming", () => {
    captureError(new Error("x"), {
      event: "test.extra",
      organization_id: "org-1",
      extra: { status_code: 500, custom: "value" },
    });
    const parsed = JSON.parse(errorSpy.mock.calls[0]![0] as string);
    expect(parsed.organization_id).toBe("org-1");
    expect(parsed.status_code).toBe(500);
    expect(parsed.custom).toBe("value");
  });
});
