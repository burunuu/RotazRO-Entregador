/**
 * Standard context fields attachable to any observability event (log line
 * or Sentry exception). Deliberately NOT a place for free-form PII — every
 * field here is an id/enum, never a name/phone/address/payment detail, and
 * NEVER precise GPS coordinates (see capture.ts). `extra` exists for a
 * handful of event-specific, still-non-PII details — see
 * docs/ROTazRO_OBSERVABILITY.md, "O que pode ir em `extra`".
 */
export interface ObservabilityContext {
  organization_id?: string;
  route_id?: string;
  driver_id?: string;
  driver_profile_id?: string;
  offer_id?: string;
  stop_id?: string;
  order_id?: string;
  extra?: Record<string, string | number | boolean | null | undefined>;
}

export function contextToFields(context: ObservabilityContext): Record<string, unknown> {
  const { extra, ...ids } = context;
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(ids)) {
    if (value !== undefined) fields[key] = value;
  }
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value !== undefined) fields[key] = value;
    }
  }
  return fields;
}
