import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { completeDriverSignup } from '../services/driver-identity'
import { logger } from '../lib/observability/logger'
import { captureError } from '../lib/observability/capture'

type ConfirmState = 'confirming' | 'confirmed' | 'already_active' | 'error'

type AuthConfirmScreenProps = {
  search: string
  hash: string
  onDone: () => void
}

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
async function finishSignupFromMetadata(): Promise<void> {
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
async function confirmFromLink(search: string, hash: string): Promise<ConfirmState> {
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

export function AuthConfirmScreen({ search, hash, onDone }: AuthConfirmScreenProps) {
  const [state, setState] = useState<ConfirmState>('confirming')

  useEffect(() => {
    void confirmFromLink(search, hash)
      .then(setState)
      .catch((error) => {
        logger.warn('auth.confirm_failed', {
          message: error instanceof Error ? error.message : String(error),
        })
        setState('error')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <main className="app">
      <section className="card login-card">
        <p className="eyebrow">ROTAZRO ENTREGADOR</p>

        {state === 'confirming' && (
          <>
            <h1>Confirmando...</h1>
            <p className="description">Só um instante.</p>
          </>
        )}

        {(state === 'confirmed' || state === 'already_active') && (
          <>
            <h1>
              {state === 'confirmed' ? 'Conta ativada com sucesso.' : 'Esta conta já foi ativada.'}
            </h1>
            <button type="button" onClick={onDone}>
              Continuar
            </button>
          </>
        )}

        {state === 'error' && (
          <>
            <h1>Este link expirou ou não é mais válido.</h1>
            <p className="description">
              Entre com seu e-mail e senha — se a conta ainda não estiver confirmada, você poderá
              reenviar o e-mail de ativação por lá.
            </p>
            <button type="button" onClick={onDone}>
              Voltar para o login
            </button>
          </>
        )}
      </section>
    </main>
  )
}
