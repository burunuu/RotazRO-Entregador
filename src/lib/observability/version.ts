/**
 * App version/commit exposed to Sentry's `release`. `__ROTAZRO_COMMIT__`
 * is injected by vite.config.ts's `define` at build time (git short hash)
 * — see docs/ROTazRO_OBSERVABILITY.md, "Versionamento". Falls back to
 * "dev" for local `npm run dev`.
 */
declare const __ROTAZRO_COMMIT__: string | undefined;
declare const __ROTAZRO_PKG_VERSION__: string | undefined;

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

export function appRelease(): string {
  return `rotazro-entregador@${appPackageVersion()}+${appCommit()}`;
}

export function appEnvironment(): string {
  try {
    if (typeof import.meta !== "undefined" && import.meta.env?.VITE_SENTRY_ENVIRONMENT) {
      return import.meta.env.VITE_SENTRY_ENVIRONMENT;
    }
  } catch {
    // fall through to default below
  }
  return "production";
}
