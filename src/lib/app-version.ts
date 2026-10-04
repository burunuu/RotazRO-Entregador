import { appPackageVersion } from './observability/version'

/**
 * Fonte única da versão do app: `package.json` → `version` (ex.: "1.0.0-beta").
 *  - UI: vite.config.ts injeta esse valor no build (`__ROTAZRO_PKG_VERSION__`);
 *  - Android: android/app/build.gradle lê o MESMO arquivo para o `versionName`;
 *  - Sentry: appRelease() usa o mesmo valor.
 * Só o `versionCode` (inteiro que sempre cresce) fica no build.gradle.
 * Para subir de versão: mude `package.json` e some +1 no `versionCode`.
 */
const SEMVER = /^(\d+\.\d+\.\d+)(?:-([0-9A-Za-z.-]+))?$/

/** "1.0.0-beta" → "v1.0.0 (beta)"; "1.0.0" → "v1.0.0". */
export function formatDisplayVersion(version: string): string {
  const match = SEMVER.exec(version)
  if (!match) return `v${version}`
  const [, core, prerelease] = match
  return prerelease ? `v${core} (${prerelease})` : `v${core}`
}

export const APP_VERSION = appPackageVersion()

export function appDisplayVersion(): string {
  return formatDisplayVersion(APP_VERSION)
}
