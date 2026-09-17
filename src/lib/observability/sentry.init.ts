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
import { appRelease, appEnvironment, appTracesSampleRate, appCommit } from "./version";

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
      // See version.ts for the default and the optional
      // VITE_SENTRY_TRACES_SAMPLE_RATE override.
      tracesSampleRate: appTracesSampleRate(),
      // "Logs" (Sentry.logger.*) defaults to enabled in this SDK version;
      // nothing here calls it — logger.ts stays the independent structured
      // log source (see sentry.browser-init.ts in the Web repo for the same
      // rationale). Disabled explicitly so it can't turn on by accident.
      enableLogs: false,
      // Defense in depth on top of beforeSend/sanitizeEvent below. IMPORTANT
      // caveat straight from @sentry/capacitor's own CapacitorOptions type:
      // these dataCollection categories are fully honored on the JS layer
      // (fetch/XHR breadcrumbs, this SDK's own request capture), but on the
      // native Android/iOS layer only `userInfo` is bridged (as
      // `sendDefaultPii`) — the native crash handler's own payload (device/
      // OS info, stack trace) isn't shaped by this option at all. That's an
      // acceptable gap here: a native crash report doesn't carry HTTP
      // headers/cookies/bodies in the first place, only device/process
      // state, so there's nothing PII-shaped for dataCollection to have
      // suppressed on that path.
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: { request: false, response: false },
        httpBodies: [],
        urlQueryParams: false,
        genAI: { inputs: false, outputs: false },
        databaseQueryData: false,
        stackFrameVariables: false,
      },
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
        // git_commit is separate from `release` (see version.ts's
        // appRelease() doc comment) but still visible/filterable per event.
        tags: { app: "android", git_commit: appCommit() },
      },
    },
    SentryReact.init,
  );

  setSentryEnabled(true);
}
