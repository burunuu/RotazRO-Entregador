/**
 * Sentry init for the APK. Called once from main.tsx, before rendering.
 * Genuinely optional: with no VITE_SENTRY_DSN set, Sentry.init() is never
 * called and setSentryEnabled stays false, so every function in
 * capture.ts is a guaranteed no-op — see
 * docs/ROTazRO_OBSERVABILITY.md, "Funciona sem Sentry configurado".
 *
 * Sentry.init() here comes from @sentry/capacitor — its second argument
 * (SentryReact.init) is the official pattern for combining Capacitor's
 * native context (device/OS info, native crash capture) with @sentry/react's
 * own React integrations (error boundary, component stack traces).
 */
import * as Sentry from "@sentry/capacitor";
import * as SentryReact from "@sentry/react";
import { setSentryEnabled } from "./capture";
import { sanitizeEvent, type SanitizableEvent } from "./sanitize";
import { appRelease, appEnvironment } from "./version";

let initialized = false;

export function initSentry() {
  if (initialized) return;
  initialized = true;

  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

  Sentry.init(
    {
      dsn,
      release: appRelease(),
      environment: appEnvironment(),
      // Low, fixed sampling per explicit instruction — basic slow-call
      // visibility, not a full APM rollout.
      tracesSampleRate: 0.1,
      // See sanitize.ts's SanitizableEvent doc comment for why this cast
      // exists — it keeps sanitize.ts SDK-agnostic and independently
      // typecheckable/testable without @sentry/capacitor installed.
      beforeSend: (event) =>
        sanitizeEvent(event as unknown as SanitizableEvent) as unknown as typeof event,
      beforeBreadcrumb: (breadcrumb) => {
        if (breadcrumb.category === "console" && /authorization|cookie|token/i.test(breadcrumb.message ?? "")) {
          return null;
        }
        return breadcrumb;
      },
      initialScope: {
        tags: { app: "android" },
      },
    },
    SentryReact.init,
  );

  setSentryEnabled(true);
}
