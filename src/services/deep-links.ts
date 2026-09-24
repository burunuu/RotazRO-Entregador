import { App } from '@capacitor/app'
import { logger } from '../lib/observability/logger'
import { captureError } from '../lib/observability/capture'

/** The only domain this app ever acts on a deep link for — matches the
 * Android App Link intent-filter host exactly (see AndroidManifest.xml).
 * Any other scheme/host is ignored outright: this is what stops a
 * malicious or malformed deep link from being treated as one of ours
 * (open-redirect / spoofed-link concern), and also filters out
 * Capacitor's own internal navigation events (capacitor://localhost/...),
 * which also flow through the same native bridge. */
const ROTAZRO_HOST = 'rotazro.lovable.app'

export type RouteLinkPayload = { kind: 'route'; token: string }
export type AuthConfirmPayload = { kind: 'auth_confirm'; search: string; hash: string }
export type DeepLinkPayload = RouteLinkPayload | AuthConfirmPayload

export function parseDeepLink(rawUrl: string): DeepLinkPayload | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }

  if (url.protocol !== 'https:' || url.host !== ROTAZRO_HOST) {
    return null
  }

  if (url.pathname.startsWith('/e/')) {
    const token = url.pathname.slice('/e/'.length)
    if (!token) return null
    return { kind: 'route', token }
  }

  if (url.pathname.startsWith('/auth/confirm')) {
    return { kind: 'auth_confirm', search: url.search, hash: url.hash }
  }

  return null
}

/**
 * Registers the live appUrlOpen listener (app already running, foreground
 * or background — launchMode="singleTask" in AndroidManifest.xml is what
 * makes Android reuse the same activity instance instead of starting a
 * second one) AND checks getLaunchUrl() once for a cold start (app was
 * not running at all — appUrlOpen never fires for the link that launched
 * the process itself). Call once, near the top of the app.
 */
export function registerDeepLinkListener(onLink: (payload: DeepLinkPayload) => void): () => void {
  const listenerPromise = App.addListener('appUrlOpen', ({ url }) => {
    const payload = parseDeepLink(url)
    if (!payload) {
      logger.warn('deep_link.ignored_unrecognized_url', {})
      return
    }
    onLink(payload)
  })

  void App.getLaunchUrl()
    .then((result) => {
      if (!result?.url) return
      const payload = parseDeepLink(result.url)
      if (payload) onLink(payload)
    })
    .catch((error) => captureError(error, { event: 'deep_link.get_launch_url_failed' }))

  return () => {
    void listenerPromise.then((handle) => handle.remove())
  }
}
