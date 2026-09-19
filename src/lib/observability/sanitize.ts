/**
 * Shared `beforeSend`/`beforeBreadcrumb` sanitization for Sentry — same
 * contract as the Web repo's copy, plus two APK-specific rules: precise GPS
 * coordinates are never forwarded, even inside an error's own extra data
 * (see docs/ROTazRO_OBSERVABILITY.md, "GPS"), and neither is any App
 * Link/deep link URL this app now handles (route share tokens in the path,
 * auth confirmation tokens in the query string or URL fragment).
 */

const SECRET_KEY_PATTERN =
  /token|password|senha|secret|api[_-]?key|service_role|authorization|cookie|jwt|refresh/i;

const PII_KEY_PATTERN =
  /^(customer_name|full_name|nome_completo|phone|telefone|address|endereco|payment|pagamento|cpf|email)$/i;

const GPS_KEY_PATTERN = /^(latitude|longitude|lat|lng|lon|coords?)$/i;

const REDACTED = "[redacted]";

/**
 * Sentry's own automatic HTTP/fetch breadcrumb instrumentation records the
 * full request URL — for every Supabase REST call, that includes the query
 * string, which is exactly where PostgREST filters put ids (e.g.
 * `?driver_profile_id=eq.<uuid>` from an .eq(), `?user_id=eq.<uuid>`, an
 * auth UUID in a path segment's neighboring param, etc). Key-based
 * redaction alone (above) can't catch this — it never inspects a string
 * VALUE, and this data was never under a key like "token" to begin with.
 * This keeps scheme+host+path (still useful: which endpoint, which
 * method/status stay visible via other breadcrumb fields) and drops
 * everything from the first "?" onward.
 */
const URL_QUERY_STRING_PATTERN = /(https?:\/\/[^\s"'?#]+)\?[^\s"'#]*/gi;

/**
 * The URL fragment is where Supabase's default (implicit-flow) e-mail
 * confirmation redirect puts a LIVE access_token/refresh_token pair — the
 * single most sensitive thing this app's deep links ever carry. Stripped
 * the same way a query string is, and checked independently of it since a
 * URL can have both (`?a=1#access_token=...`).
 */
const URL_FRAGMENT_PATTERN = /(https?:\/\/[^\s"'#]+)#[^\s"']*/gi;

/** `/e/<token>` — the driver portal share-link path (see
 * share-token.server.ts in the Web repo): a 40-char HMAC token embedded
 * directly in the path, not the query string, so URL_QUERY_STRING_PATTERN
 * alone would never catch it. Mirrors the Web repo's own
 * SHARE_LINK_PATH_PATTERN. */
const SHARE_LINK_PATH_PATTERN = /(\/e\/)[a-f0-9]{20,}/gi;

function stripUrlQueries(value: string): string {
  value = value.replace(SHARE_LINK_PATH_PATTERN, "$1[redacted]");
  value = value.replace(URL_FRAGMENT_PATTERN, "$1#[redacted]");
  return value.replace(URL_QUERY_STRING_PATTERN, "$1?[redacted]");
}

function sanitizeRecord(input: Record<string, unknown> | undefined | null): Record<string, unknown> | undefined {
  if (!input || typeof input !== "object") return input ?? undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (SECRET_KEY_PATTERN.test(key) || PII_KEY_PATTERN.test(key) || GPS_KEY_PATTERN.test(key)) {
      out[key] = REDACTED;
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = sanitizeRecord(value as Record<string, unknown>);
    } else if (typeof value === "string") {
      out[key] = stripUrlQueries(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export interface SanitizableEvent {
  request?: { headers?: Record<string, unknown>; cookies?: unknown; data?: unknown; [key: string]: unknown };
  extra?: Record<string, unknown>;
  contexts?: Record<string, Record<string, unknown>>;
  breadcrumbs?: Array<{ data?: Record<string, unknown>; [key: string]: unknown }>;
  [key: string]: unknown;
}

export function sanitizeEvent<T extends SanitizableEvent>(event: T): T {
  if (event.request) {
    const { headers, cookies: _cookies, data: _data, url, ...restRequest } = event.request;
    event.request = {
      ...restRequest,
      ...(typeof url === "string" ? { url: stripUrlQueries(url) } : {}),
      ...(headers ? { headers: sanitizeRecord(stripAuthHeaders(headers)) } : {}),
    };
  }
  if (event.extra) event.extra = sanitizeRecord(event.extra);
  if (event.contexts) {
    const sanitizedContexts: Record<string, Record<string, unknown>> = {};
    for (const [key, value] of Object.entries(event.contexts)) {
      sanitizedContexts[key] = sanitizeRecord(value) ?? {};
    }
    event.contexts = sanitizedContexts;
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((b) => ({
      ...b,
      ...(b.data ? { data: sanitizeRecord(b.data) } : {}),
      ...(typeof b.message === "string" ? { message: stripUrlQueries(b.message) } : {}),
    }));
  }
  return event;
}

function stripAuthHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (/^authorization$|^cookie$|^x-supabase-|^apikey$/i.test(key)) continue;
    out[key] = value;
  }
  return out;
}
