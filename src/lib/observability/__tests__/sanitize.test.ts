import { describe, expect, it } from "vitest";
import { sanitizeEvent } from "../sanitize";

describe("sanitizeEvent", () => {
  it("strips Authorization/Cookie headers, never redacts-in-place", () => {
    const event = {
      request: {
        headers: { authorization: "Bearer secret", cookie: "session=abc", "user-agent": "test" },
        cookies: "session=abc",
        data: "raw body",
        url: "https://example.com",
      },
    };
    const result = sanitizeEvent(event);
    expect(result.request?.headers).not.toHaveProperty("authorization");
    expect(result.request?.headers).not.toHaveProperty("cookie");
    expect(result.request?.headers?.["user-agent"]).toBe("test");
    expect(result.request).not.toHaveProperty("cookies");
    expect(result.request).not.toHaveProperty("data");
    expect(result.request?.url).toBe("https://example.com");
  });

  it("redacts secret-shaped keys anywhere in extra, nested included", () => {
    const event = {
      extra: {
        access_token: "abc123",
        SERVICE_ROLE_KEY: "sekrit",
        nested: { refreshToken: "xyz", safe_value: 42 },
        route_id: "r-1",
      },
    };
    const result = sanitizeEvent(event);
    const nested = result.extra?.["nested"] as Record<string, unknown> | undefined;
    expect(result.extra?.["access_token"]).toBe("[redacted]");
    expect(result.extra?.["SERVICE_ROLE_KEY"]).toBe("[redacted]");
    expect(nested?.["refreshToken"]).toBe("[redacted]");
    expect(nested?.["safe_value"]).toBe(42);
    expect(result.extra?.["route_id"]).toBe("r-1");
  });

  it("redacts PII-shaped keys (customer name, phone, address)", () => {
    const event = {
      extra: { customer_name: "João", phone: "69999999999", address: "Rua X, 123", order_id: "o-1" },
    };
    const result = sanitizeEvent(event);
    expect(result.extra?.["customer_name"]).toBe("[redacted]");
    expect(result.extra?.["phone"]).toBe("[redacted]");
    expect(result.extra?.["address"]).toBe("[redacted]");
    expect(result.extra?.["order_id"]).toBe("o-1");
  });

  it("redacts GPS-shaped keys — APK-only rule, precise coordinates never leave the device", () => {
    const event = {
      extra: { latitude: -8.76, longitude: -63.9, lat: -8.76, lng: -63.9, coords: "x,y", speed_kmh: 42 },
    };
    const result = sanitizeEvent(event);
    expect(result.extra?.["latitude"]).toBe("[redacted]");
    expect(result.extra?.["longitude"]).toBe("[redacted]");
    expect(result.extra?.["lat"]).toBe("[redacted]");
    expect(result.extra?.["lng"]).toBe("[redacted]");
    expect(result.extra?.["coords"]).toBe("[redacted]");
    expect(result.extra?.["speed_kmh"]).toBe(42);
  });

  it("sanitizes every contexts bucket and every breadcrumb's data", () => {
    const event = {
      contexts: { rotazro: { token: "abc", route_id: "r-1" } },
      breadcrumbs: [{ category: "http", data: { authorization: "Bearer x", url: "https://x" } }],
    };
    const result = sanitizeEvent(event);
    expect(result.contexts?.["rotazro"]?.["token"]).toBe("[redacted]");
    expect(result.contexts?.["rotazro"]?.["route_id"]).toBe("r-1");
    expect(result.breadcrumbs?.[0]?.data?.["authorization"]).toBe("[redacted]");
    expect(result.breadcrumbs?.[0]?.data?.["url"]).toBe("https://x");
  });

  it("strips query strings from URLs in HTTP breadcrumb data — the real leak (ids/UUIDs in PostgREST filters)", () => {
    const uuid = "db0cfd84-1234-4d56-8abc-1234567890ab";
    const event = {
      breadcrumbs: [
        {
          category: "fetch",
          data: {
            url: `https://xxx.supabase.co/rest/v1/driver_devices?driver_profile_id=eq.${uuid}&on_conflict=push_token`,
            method: "POST",
            status_code: 403,
          },
        },
      ],
    };
    const result = sanitizeEvent(event);
    const url = result.breadcrumbs?.[0]?.data?.["url"] as string;
    expect(url).not.toContain(uuid);
    expect(url).not.toContain("driver_profile_id");
    expect(url).toBe("https://xxx.supabase.co/rest/v1/driver_devices?[redacted]");
    // Method/status (non-identifying) stay visible — sanitizing isn't the
    // same as deleting all observability value.
    expect(result.breadcrumbs?.[0]?.data?.["method"]).toBe("POST");
    expect(result.breadcrumbs?.[0]?.data?.["status_code"]).toBe(403);
  });

  it("strips a query string embedded in a breadcrumb's message, and in request.url", () => {
    const uuid = "22222222-2222-2222-2222-222222222222";
    const event = {
      request: { url: `https://xxx.supabase.co/auth/v1/user?user_id=${uuid}` },
      breadcrumbs: [{ category: "fetch", message: `GET https://xxx.supabase.co/rest/v1/drivers?id=eq.${uuid}` }],
    };
    const result = sanitizeEvent(event);
    expect(result.request?.url).toBe("https://xxx.supabase.co/auth/v1/user?[redacted]");
    const message = result.breadcrumbs?.[0]?.message as string;
    expect(message).not.toContain(uuid);
    expect(message).toBe("GET https://xxx.supabase.co/rest/v1/drivers?[redacted]");
  });

  it("leaves a query-string-free URL untouched (host/path stay useful for debugging)", () => {
    const event = { breadcrumbs: [{ category: "fetch", data: { url: "https://xxx.supabase.co/rest/v1/routes" } }] };
    const result = sanitizeEvent(event);
    expect(result.breadcrumbs?.[0]?.data?.["url"]).toBe("https://xxx.supabase.co/rest/v1/routes");
  });

  it("is a no-op on an event with none of these fields present", () => {
    const event = { message: "hello", level: "info" };
    const result = sanitizeEvent(event);
    expect(result).toEqual({ message: "hello", level: "info" });
  });
});
