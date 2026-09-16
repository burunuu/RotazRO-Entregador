import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../logger";

describe("logger", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let debugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits a JSON line with level, event, time, and the given fields", () => {
    logger.info("route.action_succeeded", { route_id: "r-1", stop_id: "s-1" });
    expect(infoSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(infoSpy.mock.calls[0]![0] as string);
    expect(parsed.level).toBe("info");
    expect(parsed.event).toBe("route.action_succeeded");
    expect(parsed.route_id).toBe("r-1");
    expect(parsed.stop_id).toBe("s-1");
    expect(typeof parsed.time).toBe("string");
  });

  it("routes each level to the matching console method", () => {
    logger.warn("x.y", {});
    logger.error("x.z", {});
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("debug is silent by default (no rotazro:log_debug flag set)", () => {
    logger.debug("x.debug", {});
    expect(debugSpy).not.toHaveBeenCalled();
  });

  it("works with no fields argument at all", () => {
    expect(() => logger.info("no.fields")).not.toThrow();
    const parsed = JSON.parse(infoSpy.mock.calls[0]![0] as string);
    expect(parsed.event).toBe("no.fields");
  });
});
