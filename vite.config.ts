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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __ROTAZRO_COMMIT__: JSON.stringify(gitShortHash()),
    __ROTAZRO_PKG_VERSION__: JSON.stringify(packageVersion()),
  },
})
