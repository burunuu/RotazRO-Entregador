import { supabase } from '../lib/supabase'
import { completeDriverSignup } from './driver-identity'
import { captureError } from '../lib/observability/capture'

export type ConfirmState = 'confirming' | 'confirmed' | 'already_active' | 'error'

type PendingMetadata = { full_name?: string; cpf?: string; phone?: string }

/**
 * Reads back the name/CPF/phone SignUpScreen stashed in user_metadata,
 * finishes the driver profile, then clears those fields from the account
 * (they've served their one purpose — no reason to keep CPF sitting in
 * user_metadata, and therefore in the session JWT, any longer than this).
 * Failure here never blocks confirmation itself — CompleteProfileScreen
 * (driven by App.tsx's existing profileIncomplete detection) is the
 * fallback if this doesn't run or doesn't succeed for any reason.
 */
export async function finishSignupFromMetadata(): Promise<void> {
  const { data } = await supabase.auth.getUser()
  const meta = data.user?.user_metadata as PendingMetadata | undefined
  if (!meta?.full_name) return

  try {
    await completeDriverSignup(meta.full_name, meta.cpf ?? '', meta.phone ?? '')
    await supabase.auth.updateUser({ data: { full_name: null, cpf: null, phone: null } })
  } catch (error) {
    captureError(error, { event: 'auth.finish_signup_after_confirm_failed' })
  }
}

/**
 * Supports both the custom `token_hash`/`type` redirect (recommended) and
 * the default GoTrue verify-then-fragment redirect
 * (`#access_token=...&refresh_token=...`) — see
 * docs/ROTAZRO_APP_LINKS.md in the Web repo for which one the Supabase
 * dashboard ends up configured with.
 */
export async function confirmFromLink(search: string, hash: string): Promise<ConfirmState> {
  const params = new URLSearchParams(search)
  const tokenHash = params.get('token_hash')
  const type = params.get('type')

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type === 'email' ? 'email' : 'signup',
    })
    if (!error) {
      await finishSignupFromMetadata()
      return 'confirmed'
    }
    const { data } = await supabase.auth.getSession()
    return data.session ? 'already_active' : 'error'
  }

  const fragment = new URLSearchParams(hash.replace(/^#/, ''))
  const accessToken = fragment.get('access_token')
  const refreshToken = fragment.get('refresh_token')

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
    if (!error) {
      await finishSignupFromMetadata()
      return 'confirmed'
    }
    return 'error'
  }

  const { data } = await supabase.auth.getSession()
  return data.session ? 'already_active' : 'error'
}
