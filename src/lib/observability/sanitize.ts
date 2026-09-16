/**
 * Shared `beforeSend`/`beforeBreadcrumb` sanitization for Sentry — same
 * contract as the Web repo's copy, plus one APK-specific rule: precise GPS
 * coordinates are never forwarded, even inside an error's own extra data
 * (see docs/ROTazRO_OBSERVABILITY.md, "GPS").
 */

const SECRET_KEY_PATTERN =
  /token|password|senha|secret|api[_-]?key|service_role|authorization|cookie|jwt|refresh/i;

const PII_KEY_PATTERN =
  /^(customer_name|full_name|nome_completo|phone|telefone|address|endereco|payment|pagamento|cpf|email)$/i;

const GPS_KEY_PATTERN = /^(latitude|longitude|lat|lng|lon|coords?)$/i;

const REDACTED = "[redacted]";

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
    const { headers, cookies: _cookies, data: _data, ...restRequest } = event.request;
    event.request = {
      ...restRequest,
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
    event.breadcrumbs = event.breadcrumbs.map((b) => (b.data ? { ...b, data: sanitizeRecord(b.data) } : b));
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
