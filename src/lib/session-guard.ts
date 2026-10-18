/**
 * Garante que uma chamada autenticada (RPC/REST) só acontece com uma sessão
 * fresca — nunca deixa uma operação prosseguir silenciosamente como `anon`
 * porque o access_token expirou sem ser renovado. Módulo puro (sem
 * Capacitor, sem o client `supabase`): tudo entra por `SessionGuardDeps`,
 * para ser testável sem WebView — mesmo padrão de ./theme.ts /
 * ./theme-runtime.ts. A ligação real está em ./session-guard-runtime.ts.
 *
 * Causa raiz que este módulo existe para evitar: o client supabase-js é
 * criado com as opções padrão (ver supabase.ts), cujo autoRefreshToken
 * depende de um timer interno correndo no JS. Em um WebView Capacitor isso
 * não é garantido com o app em segundo plano ou a tela apagada — quando o
 * timer não dispara, getSession() continua devolvendo o token antigo
 * (expirado), e toda chamada passa a ser avaliada pelo PostgREST como
 * `anon`, falhando com "permission denied" em vez de "JWT expired".
 */

export class SessionExpiredError extends Error {
  constructor() {
    super('Sessão expirada — faça login novamente.')
    this.name = 'SessionExpiredError'
  }
}

/** Formato mínimo de sessão que este módulo precisa — não é o `Session`
 * inteiro do supabase-js, só o necessário para decidir frescor. */
export type SessionLike = {
  access_token: string
  /** Unix seconds, igual a `Session.expires_at`. `undefined`/`null` é
   * tratado como "sem expiração conhecida" — confia na sessão. */
  expires_at?: number | null
}

export type SessionGuardDeps = {
  getSession: () => Promise<SessionLike | null>
  refreshSession: () => Promise<SessionLike | null>
  /** Injetável nos testes; por padrão, `Date.now()`. */
  now?: () => number
}

/** Mesma margem usada em outros checks de expiração no projeto (ver
 * dm-auth.ts, EXPIRY_SAFETY_MARGIN_MS = 60_000, no repo Web). */
const EXPIRY_MARGIN_S = 60

export type SessionGuard = {
  /** Devolve uma sessão fresca ou lança SessionExpiredError. Chamadas
   * concorrentes durante um refresh em andamento compartilham a mesma
   * tentativa — nunca disparam refresh duplicado. */
  ensureAuthenticatedSession: () => Promise<SessionLike>
}

export function createSessionGuard(deps: SessionGuardDeps): SessionGuard {
  let inflight: Promise<SessionLike> | null = null

  function isFresh(session: SessionLike | null): session is SessionLike {
    if (!session) return false
    if (session.expires_at == null) return true
    const nowS = (deps.now ? deps.now() : Date.now()) / 1000
    return session.expires_at - EXPIRY_MARGIN_S > nowS
  }

  async function ensureAuthenticatedSession(): Promise<SessionLike> {
    if (inflight) return inflight

    inflight = (async () => {
      try {
        const current = await deps.getSession()
        if (isFresh(current)) return current

        const refreshed = await deps.refreshSession()
        if (isFresh(refreshed)) return refreshed

        throw new SessionExpiredError()
      } finally {
        inflight = null
      }
    })()

    return inflight
  }

  return { ensureAuthenticatedSession }
}
