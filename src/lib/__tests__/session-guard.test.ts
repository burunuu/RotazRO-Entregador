import { describe, expect, it, vi } from 'vitest'
import { createSessionGuard, SessionExpiredError, type SessionLike } from '../session-guard'

const NOW_S = 1_000_000

/** Deixa as microtasks pendentes (os `await`s dentro de ensureAuthenticatedSession
 * até a chamada de refreshSession) rodarem antes de resolver o mock manualmente. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function session(expiresAt: number | null | undefined): SessionLike {
  return { access_token: 'token', expires_at: expiresAt }
}

describe('createSessionGuard', () => {
  it('A) sessão válida e longe de expirar: segue sem chamar refresh', async () => {
    const getSession = vi.fn().mockResolvedValue(session(NOW_S + 3600))
    const refreshSession = vi.fn()
    const guard = createSessionGuard({ getSession, refreshSession, now: () => NOW_S * 1000 })

    const result = await guard.ensureAuthenticatedSession()

    expect(result.access_token).toBe('token')
    expect(refreshSession).not.toHaveBeenCalled()
  })

  it('B) sessão perto de expirar (dentro da margem de 60s): renova antes de devolver', async () => {
    const getSession = vi.fn().mockResolvedValue(session(NOW_S + 30))
    const refreshSession = vi.fn().mockResolvedValue(session(NOW_S + 3600))
    const guard = createSessionGuard({ getSession, refreshSession, now: () => NOW_S * 1000 })

    await guard.ensureAuthenticatedSession()

    expect(refreshSession).toHaveBeenCalledTimes(1)
  })

  it('C) sessão expirada + refresh token válido: recupera e segue', async () => {
    const getSession = vi.fn().mockResolvedValue(session(NOW_S - 10))
    const refreshSession = vi.fn().mockResolvedValue(session(NOW_S + 3600))
    const guard = createSessionGuard({ getSession, refreshSession, now: () => NOW_S * 1000 })

    const result = await guard.ensureAuthenticatedSession()

    expect(refreshSession).toHaveBeenCalledTimes(1)
    expect(result.access_token).toBe('token')
  })

  it('D) sessão expirada + refresh falha (null): lança SessionExpiredError, nunca finge sucesso', async () => {
    const getSession = vi.fn().mockResolvedValue(session(NOW_S - 10))
    const refreshSession = vi.fn().mockResolvedValue(null)
    const guard = createSessionGuard({ getSession, refreshSession, now: () => NOW_S * 1000 })

    await expect(guard.ensureAuthenticatedSession()).rejects.toBeInstanceOf(SessionExpiredError)
  })

  it('sem sessão nenhuma (getSession devolve null): tenta refresh e, se também falhar, lança', async () => {
    const getSession = vi.fn().mockResolvedValue(null)
    const refreshSession = vi.fn().mockResolvedValue(null)
    const guard = createSessionGuard({ getSession, refreshSession, now: () => NOW_S * 1000 })

    await expect(guard.ensureAuthenticatedSession()).rejects.toBeInstanceOf(SessionExpiredError)
    expect(refreshSession).toHaveBeenCalledTimes(1)
  })

  it('I) duas chamadas concorrentes durante uma sessão expirada disparam só UM refresh', async () => {
    let resolveRefresh: (value: SessionLike) => void = () => {}
    const refreshSession = vi.fn().mockImplementation(
      () => new Promise<SessionLike>((resolve) => { resolveRefresh = resolve }),
    )
    const getSession = vi.fn().mockResolvedValue(session(NOW_S - 10))
    const guard = createSessionGuard({ getSession, refreshSession, now: () => NOW_S * 1000 })

    const p1 = guard.ensureAuthenticatedSession()
    const p2 = guard.ensureAuthenticatedSession()
    await flush()
    resolveRefresh(session(NOW_S + 3600))

    await Promise.all([p1, p2])

    expect(refreshSession).toHaveBeenCalledTimes(1)
  })

  it('J) chamadas concorrentes compartilham o mesmo resultado do refresh', async () => {
    let resolveRefresh: (value: SessionLike) => void = () => {}
    const refreshSession = vi.fn().mockImplementation(
      () => new Promise<SessionLike>((resolve) => { resolveRefresh = resolve }),
    )
    const getSession = vi.fn().mockResolvedValue(session(NOW_S - 10))
    const guard = createSessionGuard({ getSession, refreshSession, now: () => NOW_S * 1000 })

    const p1 = guard.ensureAuthenticatedSession()
    const p2 = guard.ensureAuthenticatedSession()
    await flush()
    resolveRefresh(session(NOW_S + 3600))

    const [r1, r2] = await Promise.all([p1, p2])

    expect(r1).toEqual(r2)
  })

  it('uma chamada nova depois do refresh concluído reavalia o frescor (não reusa o inflight antigo)', async () => {
    const getSession = vi.fn()
      .mockResolvedValueOnce(session(NOW_S + 3600))
      .mockResolvedValueOnce(session(NOW_S + 3600))
    const refreshSession = vi.fn()
    const guard = createSessionGuard({ getSession, refreshSession, now: () => NOW_S * 1000 })

    await guard.ensureAuthenticatedSession()
    await guard.ensureAuthenticatedSession()

    expect(getSession).toHaveBeenCalledTimes(2)
  })

  it('sessão sem expires_at conhecido é tratada como fresca (confia, não força refresh)', async () => {
    const getSession = vi.fn().mockResolvedValue(session(undefined))
    const refreshSession = vi.fn()
    const guard = createSessionGuard({ getSession, refreshSession, now: () => NOW_S * 1000 })

    await guard.ensureAuthenticatedSession()

    expect(refreshSession).not.toHaveBeenCalled()
  })
})
