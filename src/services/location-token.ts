import { supabase } from '../lib/supabase'
import { captureError } from '../lib/observability/capture'

/**
 * BUG 3: a long-lived, write-only, single-driver token for
 * @capgo/background-geolocation's native POST delivery
 * (StartOptions.url/headers) -- that path doesn't depend on the WebView
 * staying responsive, unlike the JS callback (see App.tsx's startGps()).
 * The normal Supabase session JWT would still go stale on a shift longer
 * than its ~1h lifetime with the app genuinely backgrounded, since
 * refreshing it requires JS to run. See
 * supabase/migrations/20261001000000_driver_location_tokens.sql (Web
 * repo) for the full server-side design.
 */
export interface DriverLocationToken {
  token: string
  expiresAt: string
}

/** Called right before starting the foreground service, and again on every
 * app open -- rotates the driver's token (the previous one is revoked
 * server-side as part of issuing a new one, one open token per driver). */
export async function issueMyDriverLocationToken(): Promise<DriverLocationToken> {
  const { data, error } = await supabase.rpc('issue_my_driver_location_token')
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('Falha ao preparar o envio de localização em segundo plano.')
  return { token: row.token as string, expiresAt: row.expires_at as string }
}

/** Called on "Encerrar trabalho" and on logout, alongside stopping the
 * native service itself -- defense in depth so a token can't keep working
 * after the driver believes tracking has stopped. Never throws: revoking
 * the token is a cleanup step, not something that should block the rest of
 * stopGps()/handleLogout() if it fails. */
export async function revokeMyDriverLocationToken(): Promise<void> {
  try {
    const { error } = await supabase.rpc('revoke_my_driver_location_token')
    if (error) throw error
  } catch (error) {
    captureError(error, { event: 'gps.location_token_revoke_failed' })
  }
}
