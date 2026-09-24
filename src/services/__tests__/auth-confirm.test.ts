import { describe, expect, it, vi, beforeEach } from 'vitest'

const getUser = vi.fn()
const updateUser = vi.fn()
const verifyOtp = vi.fn()
const setSession = vi.fn()
const getSession = vi.fn()
const completeDriverSignup = vi.fn()

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: (...args: unknown[]) => getUser(...args),
      updateUser: (...args: unknown[]) => updateUser(...args),
      verifyOtp: (...args: unknown[]) => verifyOtp(...args),
      setSession: (...args: unknown[]) => setSession(...args),
      getSession: (...args: unknown[]) => getSession(...args),
    },
  },
}))

vi.mock('../driver-identity', () => ({
  completeDriverSignup: (...args: unknown[]) => completeDriverSignup(...args),
}))

const { confirmFromLink, finishSignupFromMetadata } = await import('../auth-confirm')

beforeEach(() => {
  getUser.mockReset()
  updateUser.mockReset()
  verifyOtp.mockReset()
  setSession.mockReset()
  getSession.mockReset()
  completeDriverSignup.mockReset()
})

describe('finishSignupFromMetadata', () => {
  it('finishes the driver profile from user_metadata, then clears name/CPF/phone from the account', async () => {
    getUser.mockResolvedValue({
      data: { user: { user_metadata: { full_name: 'Fulano', cpf: '11144477735', phone: '69988887777' } } },
    })
    completeDriverSignup.mockResolvedValue({ id: 'profile-1' })
    updateUser.mockResolvedValue({ data: {}, error: null })

    await finishSignupFromMetadata()

    expect(completeDriverSignup).toHaveBeenCalledWith('Fulano', '11144477735', '69988887777')
    expect(updateUser).toHaveBeenCalledExactlyOnceWith({
      data: { full_name: null, cpf: null, phone: null },
    })
  })

  it('does nothing when there is no pending metadata (already-clean account)', async () => {
    getUser.mockResolvedValue({ data: { user: { user_metadata: {} } } })

    await finishSignupFromMetadata()

    expect(completeDriverSignup).not.toHaveBeenCalled()
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('swallows a complete_driver_signup failure without throwing (CompleteProfileScreen is the fallback)', async () => {
    getUser.mockResolvedValue({ data: { user: { user_metadata: { full_name: 'Fulano' } } } })
    completeDriverSignup.mockRejectedValue(new Error('CPF inválido.'))

    await expect(finishSignupFromMetadata()).resolves.toBeUndefined()
    expect(updateUser).not.toHaveBeenCalled()
  })
})

describe('confirmFromLink', () => {
  it('verifies via token_hash, finishes signup from metadata, and reports confirmed', async () => {
    verifyOtp.mockResolvedValue({ error: null })
    getUser.mockResolvedValue({ data: { user: { user_metadata: { full_name: 'Fulano', cpf: '1', phone: '2' } } } })
    completeDriverSignup.mockResolvedValue({ id: 'p1' })
    updateUser.mockResolvedValue({ data: {}, error: null })

    const state = await confirmFromLink('?token_hash=abc&type=signup', '')

    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc', type: 'signup' })
    expect(state).toBe('confirmed')
    expect(updateUser).toHaveBeenCalledExactlyOnceWith({
      data: { full_name: null, cpf: null, phone: null },
    })
  })

  it('reports already_active when verifyOtp fails but a session already exists (repeated tap)', async () => {
    verifyOtp.mockResolvedValue({ error: { message: 'Token has expired or is invalid' } })
    getSession.mockResolvedValue({ data: { session: { access_token: 'x' } } })

    const state = await confirmFromLink('?token_hash=abc&type=signup', '')

    expect(state).toBe('already_active')
    expect(completeDriverSignup).not.toHaveBeenCalled()
  })

  it('reports error when verifyOtp fails and there is no session at all', async () => {
    verifyOtp.mockResolvedValue({ error: { message: 'Token has expired or is invalid' } })
    getSession.mockResolvedValue({ data: { session: null } })

    const state = await confirmFromLink('?token_hash=abc&type=signup', '')

    expect(state).toBe('error')
  })

  it('falls back to the fragment (access_token/refresh_token) shape when there is no token_hash', async () => {
    setSession.mockResolvedValue({ error: null })
    getUser.mockResolvedValue({ data: { user: { user_metadata: {} } } })

    const state = await confirmFromLink('', '#access_token=live&refresh_token=rt&type=signup')

    expect(setSession).toHaveBeenCalledWith({ access_token: 'live', refresh_token: 'rt' })
    expect(state).toBe('confirmed')
  })

  it('reports error with neither token_hash nor a usable fragment and no existing session', async () => {
    getSession.mockResolvedValue({ data: { session: null } })

    const state = await confirmFromLink('', '')

    expect(state).toBe('error')
  })
})
