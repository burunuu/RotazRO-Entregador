import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// Short git commit hash + package.json version baked in at build time for
// Sentry's `release` tag — see src/lib/observability/version.ts. Falls
// back to "unknown"/"0.0.0" rather than ever failing the build.
function gitShortHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'unknown'
  }
}

function packageVersion(): string {
  try {
    return (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version?: string })
      .version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

// android/app/build.gradle's versionCode — used as the release's build
// number (Sentry's `dist`-style suffix, see version.ts's appRelease()).
// Read via regex rather than a Gradle parser: it's one integer literal on
// its own line, not worth a real parser dependency for. Falls back to "0"
// rather than ever failing the build.
function androidVersionCode(): string {
  try {
    const gradle = readFileSync(new URL('./android/app/build.gradle', import.meta.url), 'utf8')
    const match = /versionCode\s+(\d+)/.exec(gradle)
    return match?.[1] ?? '0'
  } catch {
    return '0'
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __ROTAZRO_COMMIT__: JSON.stringify(gitShortHash()),
    __ROTAZRO_PKG_VERSION__: JSON.stringify(packageVersion()),
    __ROTAZRO_VERSION_CODE__: JSON.stringify(androidVersionCode()),
  },
})
