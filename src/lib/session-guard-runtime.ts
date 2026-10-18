/**
 * Ligação real do session guard: client `supabase` real + ciclo de vida do
 * Capacitor (`App.addListener('appStateChange', ...)`, mesmo mecanismo já
 * usado em theme-runtime.ts). Lógica pura em ./session-guard.ts.
 */
import { App } from '@capacitor/app'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { createSessionGuard, SessionExpiredError, type SessionLike } from './session-guard'
import { logger } from './observability/logger'

export { SessionExpiredError }

function toSessionLike(session: Session | null): SessionLike | null {
  if (!session) return null
  return { access_token: session.access_token, expires_at: session.expires_at }
}

const guard = createSessionGuard({
  getSession: async () => {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    return toSessionLike(data.session)
  },
  refreshSession: async () => {
    const { data, error } = await supabase.auth.refreshSession()
    if (error) {
      // Esperado quando o refresh_token também expirou/foi revogado — não é
      // um erro inesperado, por isso logger.warn (estruturado) em vez de
      // captureError (que dispara pro Sentry).
      logger.warn('session.refresh_failed', { message: error.message })
      return null
    }
    return toSessionLike(data.session)
  },
})

/** Garante sessão autenticada fresca ou lança SessionExpiredError. Cada
 * chamador decide o que fazer com o erro (GPS, polling de ofertas, emissão
 * de token) — nenhuma operação autenticada deve seguir em frente como
 * `anon` depois disso. Nunca loga access_token/refresh_token. */
export async function ensureAuthenticatedSession(): Promise<SessionLike> {
  try {
    return await guard.ensureAuthenticatedSession()
  } catch (error) {
    if (error instanceof SessionExpiredError) {
      logger.warn('session.expired_no_valid_refresh', {})
    }
    throw error
  }
}

let lifecycleStarted = false

/** Chamar UMA vez, no boot (main.tsx) — mesmo padrão de initTheme(). Reforça
 * autoRefreshToken conforme o app entra/sai de primeiro plano (guia oficial
 * do supabase-js para ambientes não-browser, onde visibilitychange sozinho
 * não é confiável) e loga os eventos de auth (nunca os tokens) — serve tanto
 * de diagnóstico quanto de sinal pro soak test (TOKEN_REFRESHED). */
export function startSessionLifecycle(): () => void {
  if (lifecycleStarted) return () => {}
  lifecycleStarted = true

  const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
    // `auth_event`, não `event` — `logger.info(event, fields)` já usa a
    // chave `event` pro nome do log; nomear o campo igual sobrescreveria
    // "session.auth_state_change" pelo valor do evento do supabase-js.
    logger.info('session.auth_state_change', { auth_event: event })
  })

  let removeAppListener: (() => void) | null = null
  App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      supabase.auth.startAutoRefresh()
      // Best-effort: valida/renova no resume. Quem precisar de sessão vai
      // checar de novo na própria chamada — isto não bloqueia o resume.
      void ensureAuthenticatedSession().catch(() => {})
    } else {
      supabase.auth.stopAutoRefresh()
    }
  })
    .then((handle) => {
      removeAppListener = () => void handle.remove()
    })
    .catch(() => {
      // Plugin indisponível (ex.: navegador de desenvolvimento) — o timer
      // interno padrão do supabase-js continua sendo a única defesa.
    })

  // Primeira ativação explícita — supabase-js já liga isso ao criar uma
  // sessão, mas reforçamos no boot para o ambiente Capacitor.
  supabase.auth.startAutoRefresh()

  return () => {
    lifecycleStarted = false
    authSub.subscription.unsubscribe()
    removeAppListener?.()
  }
}
