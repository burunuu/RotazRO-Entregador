/**
 * Everything that touches the Sentry SDK directly lives in this one file —
 * sentry.init.ts calls setSentryEnabled(true) once Sentry.init() actually
 * ran with a real DSN; every function here checks that flag first and is a
 * true no-op otherwise (never throws, never touches the SDK), so the app
 * works identically with or without Sentry configured — see
 * docs/ROTazRO_OBSERVABILITY.md, "Funciona sem Sentry configurado".
 */
import * as Sentry from "@sentry/capacitor";
import { logger } from "./logger";
import { contextToFields, type ObservabilityContext } from "./context";

let sentryEnabled = false;

export function setSentryEnabled(value: boolean) {
  sentryEnabled = value;
}

export function isSentryEnabled(): boolean {
  return sentryEnabled;
}

function applyContext(scope: Sentry.Scope, context: ObservabilityContext) {
  const fields = contextToFields(context);
  for (const [key, value] of Object.entries(fields)) {
    scope.setTag(key, String(value));
  }
  scope.setContext("rotazro", fields);
}

/**
 * True when the device itself has no connectivity right now. Used to tell
 * apart "a real bug happened" from "the phone simply has no signal" —
 * dozens of fetch/Realtime failures during a genuine connectivity gap
 * would otherwise flood Sentry with noise that tells nobody anything
 * useful. See docs/ROTazRO_OBSERVABILITY.md, "Offline vs erro real".
 */
function isDeviceOffline(): boolean {
  try {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  } catch {
    return false;
  }
}

/**
 * Captures a genuinely unexpected exception — NOT an expected/operational
 * outcome. Always logs a structured "error" line too (logger.ts), so this
 * is safe to call even when Sentry isn't configured.
 *
 * While the device is offline, this downgrades to a breadcrumb instead of
 * a full Sentry exception — the structured log line still records it
 * (nothing is silently dropped locally), but Sentry only needs to know
 * "there was connectivity trouble around this time", not one event per
 * failed request. Pass `force: true` to always capture regardless (use
 * sparingly, for errors that are clearly not network-shaped).
 */
export function captureError(
  error: unknown,
  context: ObservabilityContext & { event?: string; force?: boolean } = {},
) {
  const { event = "unhandled_exception", force = false, ...rest } = context;
  logger.error(event, { ...contextToFields(rest), message: errorMessage(error), offline: isDeviceOffline() });
  if (!sentryEnabled) return;
  try {
    if (!force && isDeviceOffline()) {
      Sentry.addBreadcrumb({ category: event, level: "error", message: "offline_suppressed", data: contextToFieldsSafe(rest) });
      return;
    }
    Sentry.withScope((scope) => {
      applyContext(scope, rest);
      Sentry.captureException(error);
    });
  } catch {
    // Observability must never be the reason a real error goes unhandled.
  }
}

/**
 * Captures a Sentry Issue/Event for an expected, informational milestone —
 * NOT an exception (use captureError for that). Same no-op-without-Sentry
 * guarantee, same context shape. Independent of `enableLogs` in
 * sentry.init.ts — that flag gates the separate Sentry Logs product; this
 * uses the classic Issues/Events pipeline (Sentry.captureMessage), which
 * has always been on.
 */
export function captureMessage(
  message: string,
  context: ObservabilityContext & { level?: "info" | "warning" | "error" } = {},
) {
  const { level = "info", ...rest } = context;
  logger.info(message, contextToFields(rest));
  if (!sentryEnabled) return;
  try {
    Sentry.withScope((scope) => {
      applyContext(scope, rest);
      Sentry.captureMessage(message, level);
    });
  } catch {
    // Observability must never be the reason a real error goes unhandled.
  }
}

function contextToFieldsSafe(context: ObservabilityContext): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(contextToFields(context))) {
    out[key] = String(value);
  }
  return out;
}

export function addBreadcrumbSafe(breadcrumb: Sentry.Breadcrumb) {
  if (!sentryEnabled) return;
  try {
    Sentry.addBreadcrumb(breadcrumb);
  } catch {
    // Same rationale as captureError's catch.
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
