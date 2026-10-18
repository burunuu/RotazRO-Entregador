import { describe, expect, it, vi, beforeEach } from 'vitest'
import { SessionExpiredError } from '../../lib/session-guard'

const ensureAuthenticatedSession = vi.fn()
const rpc = vi.fn()

vi.mock('../../lib/session-guard-runtime', () => ({
  ensureAuthenticatedSession: (...args: unknown[]) => ensureAuthenticatedSession(...args),
  SessionExpiredError,
}))

vi.mock('../../lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}))

vi.mock('../../lib/observability/capture', () => ({
  captureError: vi.fn(),
}))

const { issueMyDriverLocationToken } = await import('../location-token')

beforeEach(() => {
  ensureAuthenticatedSession.mockReset()
  rpc.mockReset()
})

describe('issueMyDriverLocationToken — H) só emite token de background com sessão válida', () => {
  it('sessão expirada: propaga SessionExpiredError e NUNCA chama issue_my_driver_location_token', async () => {
    ensureAuthenticatedSession.mockRejectedValue(new SessionExpiredError())

    await expect(issueMyDriverLocationToken()).rejects.toBeInstanceOf(SessionExpiredError)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('sessão renovada com sucesso: emite o token normalmente', async () => {
    ensureAuthenticatedSession.mockResolvedValue({ access_token: 'x' })
    rpc.mockResolvedValue({ data: [{ token: 'tok_123', expires_at: '2026-01-01T00:00:00Z' }], error: null })

    const result = await issueMyDriverLocationToken()

    expect(ensureAuthenticatedSession).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('issue_my_driver_location_token')
    expect(result.token).toBe('tok_123')
  })
})
