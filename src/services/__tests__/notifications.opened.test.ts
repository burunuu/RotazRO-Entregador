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
const getDeliveredMock = vi.fn(async () => ({ notifications: [] as unknown[] }))

vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    addListener: vi.fn((event: string, handler: Listener) => {
      listeners[event] = handler
      return Promise.resolve({ remove: vi.fn() })
    }),
    getDeliveredNotifications: getDeliveredMock,
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
  getDeliveredMock.mockClear()
  return import('../notifications')
}

describe('onNotificationOpened', () => {
  it('clears only the tapped notification from the tray, looked up by data (never the raw tap-event id)', async () => {
    // The tap event's own `notification.id` is the Android system's composite
    // key (e.g. "0:...%..."), not the plain int this plugin's native
    // removeDeliveredNotifications expects -- passing it straight through
    // crashes the whole app (BUG 1B, proven via physical-device logcat). The
    // fix looks the tapped notification up in getDeliveredNotifications() by
    // the data payload we control (route_id/offer_id) and removes THAT
    // properly-shaped entry (real int id) instead.
    const deliveredEntry = { id: 7, tag: 'FCM-Notification:123', data: { type: 'route_assigned', route_id: 'r-1' } }
    getDeliveredMock.mockResolvedValue({
      notifications: [{ id: 1, data: { type: 'offer_created', offer_id: 'o-unrelated' } }, deliveredEntry],
    })

    const { onNotificationOpened } = await loadModule()
    const handler = vi.fn()
    onNotificationOpened(handler)

    const tapped = { id: '0:1790907903218435%2fb5981d2fb5981d', data: { type: 'route_assigned', route_id: 'r-1' } }
    listeners['pushNotificationActionPerformed']({ actionId: 'tap', notification: tapped })
    await vi.waitFor(() => expect(removeDeliveredMock).toHaveBeenCalledTimes(1))

    expect(removeDeliveredMock).toHaveBeenCalledWith({ notifications: [deliveredEntry] })
    expect(handler).toHaveBeenCalledWith({ type: 'route_assigned', routeId: 'r-1', source: 'opened' })
  })

  it('does not call removeDeliveredNotifications when no matching delivered entry is found', async () => {
    getDeliveredMock.mockResolvedValue({ notifications: [] })

    const { onNotificationOpened } = await loadModule()
    const handler = vi.fn()
    onNotificationOpened(handler)

    const tapped = { id: '0:1790907903218435%2fb5981d2fb5981d', data: { type: 'route_assigned', route_id: 'r-1' } }
    listeners['pushNotificationActionPerformed']({ actionId: 'tap', notification: tapped })
    await vi.waitFor(() => expect(getDeliveredMock).toHaveBeenCalledTimes(1))

    expect(removeDeliveredMock).not.toHaveBeenCalled()
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
