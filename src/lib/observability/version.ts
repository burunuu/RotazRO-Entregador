/**
 * App version/commit exposed to Sentry's `release`. `__ROTAZRO_COMMIT__`
 * is injected by vite.config.ts's `define` at build time (git short hash)
 * — see docs/ROTazRO_OBSERVABILITY.md, "Versionamento". Falls back to
 * "dev" for local `npm run dev`.
 */
declare const __ROTAZRO_COMMIT__: string | undefined;
declare const __ROTAZRO_PKG_VERSION__: string | undefined;
declare const __ROTAZRO_VERSION_CODE__: string | undefined;

export function appCommit(): string {
  try {
    return typeof __ROTAZRO_COMMIT__ !== "undefined" && __ROTAZRO_COMMIT__ ? __ROTAZRO_COMMIT__ : "dev";
  } catch {
    return "dev";
  }
}

export function appPackageVersion(): string {
  try {
    return typeof __ROTAZRO_PKG_VERSION__ !== "undefined" && __ROTAZRO_PKG_VERSION__
      ? __ROTAZRO_PKG_VERSION__
      : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** android/app/build.gradle's versionCode — the Play Store's own build
 * number, injected the same way as commit/package version (see
 * vite.config.ts). Falls back to "0" for local `vite dev`. */
export function appVersionCode(): string {
  try {
    return typeof __ROTAZRO_VERSION_CODE__ !== "undefined" && __ROTAZRO_VERSION_CODE__
      ? __ROTAZRO_VERSION_CODE__
      : "0";
  } catch {
    return "0";
  }
}

/** `rotazro-entregador@<versionName>+<versionCode>` — mirrors the Play
 * Store's own version identifiers exactly, so a release in Sentry always
 * matches what's visible in the Play Console/APK itself. The git commit
 * (appCommit()) is attached separately as the `git_commit` tag in
 * sentry.init.ts's initialScope rather than folded into the release string
 * — GitHub suspect-commit correlation doesn't depend on the release name
 * containing a SHA (it comes from the source-maps upload step's
 * `setCommits`, see docs/ROTazRO_OBSERVABILITY.md, "Source maps"), so
 * nothing is lost by using versionCode here instead. */
export function appRelease(): string {
  return `rotazro-entregador@${appPackageVersion()}+${appVersionCode()}`;
}

/**
 * Explicit env var wins always. Absent that, falls back to "development"
 * when actually running `vite dev` (Vite's own `import.meta.env.DEV`), and
 * "production" otherwise — previously this defaulted to "production"
 * unconditionally, which mislabeled every local dev session.
 */
export function appEnvironment(): string {
  try {
    if (typeof import.meta !== "undefined" && import.meta.env?.VITE_SENTRY_ENVIRONMENT) {
      return import.meta.env.VITE_SENTRY_ENVIRONMENT;
    }
    if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
      return "development";
    }
  } catch {
    // fall through to default below
  }
  return "production";
}

/**
 * Performance tracing sample rate, 0..1. Configurable via env var, defaults
 * to a low, fixed 10% — deliberately not 100%, this is basic slow-call
 * visibility, not a full APM rollout. An invalid or out-of-range value
 * falls back to the default rather than silently clamping.
 */
export function appTracesSampleRate(): number {
  const DEFAULT_RATE = 0.1;
  try {
    const raw = import.meta.env?.VITE_SENTRY_TRACES_SAMPLE_RATE as string | undefined;
    if (raw === undefined) return DEFAULT_RATE;
    const parsed = Number(raw);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 1) return DEFAULT_RATE;
    return parsed;
  } catch {
    return DEFAULT_RATE;
  }
}
