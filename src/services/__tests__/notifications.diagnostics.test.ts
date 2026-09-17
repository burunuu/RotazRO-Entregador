import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Tests for the TEMPORARY VITE_PUSH_DIAGNOSTICS instrumentation in
 * notifications.ts (registerForPush/upsertDeviceToken). Separate file from
 * notifications.test.ts so both can be deleted together once the flag is
 * removed. The flag is read from import.meta.env at module load time, so
 * every test re-imports the module fresh via loadModule() after stubbing it.
 */

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
  },
}))

type Listener = (arg: unknown) => void
let listeners: Record<string, Listener>

vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    checkPermissions: vi.fn(async () => ({ receive: 'granted' })),
    requestPermissions: vi.fn(async () => ({ receive: 'granted' })),
    createChannel: vi.fn(async () => undefined),
    addListener: vi.fn((event: string, handler: Listener) => {
      listeners[event] = handler
      return Promise.resolve({ remove: vi.fn() })
    }),
    register: vi.fn(async () => undefined),
    getDeliveredNotifications: vi.fn(async () => ({ notifications: [] })),
    removeAllDeliveredNotifications: vi.fn(async () => undefined),
  },
}))

const upsertMock = vi.fn(async () => ({ error: null as { message: string } | null }))
vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn((fn: string) => (fn === 'register_my_driver_device' ? upsertMock() : Promise.resolve({ error: null }))),
  },
}))

const captureErrorMock = vi.fn()
const captureMessageMock = vi.fn()
vi.mock('../../lib/observability/capture', () => ({
  captureError: captureErrorMock,
  captureMessage: captureMessageMock,
}))

/** Flushes pending microtask chains (upsertDeviceToken's await) without fake timers. */
function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function loadModule(diagnosticsEnabled: boolean) {
  vi.resetModules()
  listeners = {}
  vi.stubEnv('VITE_PUSH_DIAGNOSTICS', diagnosticsEnabled ? '1' : '0')
  return import('../notifications')
}

describe('push registration diagnostics (VITE_PUSH_DIAGNOSTICS)', () => {
  beforeEach(() => {
    captureErrorMock.mockClear()
    captureMessageMock.mockClear()
    upsertMock.mockClear()
    upsertMock.mockResolvedValue({ error: null })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('emits push.registration_started and push.permission_result', async () => {
    const { registerForPush } = await loadModule(true)
    await registerForPush('driver-1')

    const events = captureMessageMock.mock.calls.map((c) => c[0])
    expect(events).toContain('push.registration_started')
    expect(events).toContain('push.permission_result')
  })

  it('emits push.registration_success and push.device_save_success on a successful token registration, never the token itself', async () => {
    const { registerForPush } = await loadModule(true)
    await registerForPush('driver-1')
    listeners['registration']({ value: 'fake-fcm-token' })
    await flush()

    const events = captureMessageMock.mock.calls.map((c) => c[0])
    expect(events).toContain('push.registration_success')
    expect(events).toContain('push.device_save_success')
    expect(upsertMock).toHaveBeenCalledTimes(1)

    const serialized = JSON.stringify([...captureMessageMock.mock.calls, ...captureErrorMock.mock.calls])
    expect(serialized).not.toContain('fake-fcm-token')
  })

  it('emits push.registration_error on a native registrationError, never the token', async () => {
    const { registerForPush } = await loadModule(true)
    await registerForPush('driver-1')
    listeners['registrationError']({ error: 'SERVICE_NOT_AVAILABLE' })

    const events = captureErrorMock.mock.calls.map((c) => c[1]?.event)
    expect(events).toContain('push.registration_error')
  })

  it('emits push.device_save_error when the Supabase upsert fails, never the token', async () => {
    upsertMock.mockResolvedValueOnce({ error: { message: 'boom' } })
    const { registerForPush } = await loadModule(true)
    await registerForPush('driver-1')
    listeners['registration']({ value: 'fake-fcm-token' })
    await flush()

    const events = captureErrorMock.mock.calls.map((c) => c[1]?.event)
    expect(events).toContain('push.device_save_error')

    const serialized = JSON.stringify(captureErrorMock.mock.calls)
    expect(serialized).not.toContain('fake-fcm-token')
  })

  it('emits push.registration_timeout when neither listener fires within the timeout window', async () => {
    vi.useFakeTimers()
    try {
      const { registerForPush } = await loadModule(true)
      await registerForPush('driver-1')
      await vi.advanceTimersByTimeAsync(15_000)

      const events = captureMessageMock.mock.calls.map((c) => c[0])
      expect(events).toContain('push.registration_timeout')
    } finally {
      vi.useRealTimers()
    }
  })

  it('sends none of the diagnostic events when the flag is off', async () => {
    vi.useFakeTimers()
    try {
      const { registerForPush } = await loadModule(false)
      await registerForPush('driver-1')
      listeners['registration']({ value: 'fake-fcm-token' })
      await vi.advanceTimersByTimeAsync(15_000)

      expect(captureMessageMock).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
