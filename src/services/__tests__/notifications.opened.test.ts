import { describe, expect, it, vi } from 'vitest'

/**
 * Tests for onNotificationOpened's tray-clearing behavior (item: tapping a
 * notification must clear only THAT notification from the tray, never the
 * whole tray, and never on a mere foreground "received" delivery). Same
 * mocking pattern as notifications.diagnostics.test.ts.
 */

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
  },
}))

type Listener = (arg: unknown) => void
let listeners: Record<string, Listener>
const removeDeliveredMock = vi.fn(async (_delivered: unknown) => undefined)

vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    addListener: vi.fn((event: string, handler: Listener) => {
      listeners[event] = handler
      return Promise.resolve({ remove: vi.fn() })
    }),
    removeDeliveredNotifications: removeDeliveredMock,
  },
}))

vi.mock('../../lib/observability/capture', () => ({
  captureError: vi.fn(),
  captureMessage: vi.fn(),
}))

async function loadModule() {
  vi.resetModules()
  listeners = {}
  removeDeliveredMock.mockClear()
  return import('../notifications')
}

describe('onNotificationOpened', () => {
  it('clears only the tapped notification from the tray (tap = pushNotificationActionPerformed)', async () => {
    const { onNotificationOpened } = await loadModule()
    const handler = vi.fn()
    onNotificationOpened(handler)

    const notification = { id: 'n-42', data: { type: 'route_assigned', route_id: 'r-1' } }
    listeners['pushNotificationActionPerformed']({ actionId: 'tap', notification })

    expect(removeDeliveredMock).toHaveBeenCalledTimes(1)
    expect(removeDeliveredMock).toHaveBeenCalledWith({ notifications: [notification] })
    expect(handler).toHaveBeenCalledWith({ type: 'route_assigned', routeId: 'r-1', source: 'opened' })
  })

  it('does NOT touch the tray on a foreground "received" delivery (only a tap clears it)', async () => {
    const { onNotificationOpened } = await loadModule()
    const handler = vi.fn()
    onNotificationOpened(handler)

    listeners['pushNotificationReceived']({ id: 'n-1', data: { type: 'offer_created', offer_id: 'o-1' } })

    expect(removeDeliveredMock).not.toHaveBeenCalled()
    expect(handler).toHaveBeenCalledWith({ type: 'offer_created', offerId: 'o-1', source: 'received' })
  })
})
