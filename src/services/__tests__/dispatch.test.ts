import { describe, expect, it, vi, beforeEach } from 'vitest'
import { SessionExpiredError } from '../../lib/session-guard'

const ensureAuthenticatedSession = vi.fn()
const from = vi.fn()

vi.mock('../../lib/session-guard-runtime', () => ({
  ensureAuthenticatedSession: (...args: unknown[]) => ensureAuthenticatedSession(...args),
  SessionExpiredError,
}))

vi.mock('../../lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => from(...args) },
}))

const { fetchPendingOffer } = await import('../dispatch')

beforeEach(() => {
  ensureAuthenticatedSession.mockReset()
  from.mockReset()
})

describe('fetchPendingOffer — G) nunca consulta delivery_offers como anon', () => {
  it('sessão expirada: propaga SessionExpiredError e NUNCA chega a consultar o banco', async () => {
    ensureAuthenticatedSession.mockRejectedValue(new SessionExpiredError())

    await expect(fetchPendingOffer()).rejects.toBeInstanceOf(SessionExpiredError)
    expect(from).not.toHaveBeenCalled()
  })

  it('sessão válida: garante a sessão antes de consultar delivery_offers', async () => {
    ensureAuthenticatedSession.mockResolvedValue({ access_token: 'x' })
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const limit = vi.fn().mockReturnValue({ maybeSingle })
    const order = vi.fn().mockReturnValue({ limit })
    const eq = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ eq })
    from.mockReturnValue({ select })

    const result = await fetchPendingOffer()

    expect(ensureAuthenticatedSession).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith('delivery_offers')
    expect(result).toBeNull()
  })
})
