import { describe, expect, it } from 'vitest'
import { parseOpenedPayload } from '../notifications'
import type { PushNotificationSchema } from '@capacitor/push-notifications'

function notification(data: Record<string, unknown>): PushNotificationSchema {
  return { id: 'n-1', data } as PushNotificationSchema
}

describe('parseOpenedPayload', () => {
  it('parses an offer_created push, extracting only offer_id', () => {
    const result = parseOpenedPayload(
      notification({ type: 'offer_created', offer_id: 'o-1', route_id: 'r-1' }),
      'received',
    )
    expect(result).toEqual({ type: 'offer_created', offerId: 'o-1', source: 'received' })
  })

  it('parses a route_assigned push, extracting only route_id', () => {
    const result = parseOpenedPayload(notification({ type: 'route_assigned', route_id: 'r-9' }), 'opened')
    expect(result).toEqual({ type: 'route_assigned', routeId: 'r-9', source: 'opened' })
  })

  it('falls back to type "unknown" for an unrecognized/missing type, never throws', () => {
    expect(parseOpenedPayload(notification({}), 'received')).toEqual({ type: 'unknown', source: 'received' })
    expect(parseOpenedPayload(notification({ type: 'something_else' }), 'received')).toEqual({
      type: 'unknown',
      source: 'received',
    })
  })

  it('never trusts a non-string id (defends against a malformed/malicious payload)', () => {
    const result = parseOpenedPayload(notification({ type: 'offer_created', offer_id: 12345 }), 'received')
    expect(result).toEqual({ type: 'offer_created', offerId: null, source: 'received' })
  })

  it('preserves the source (received vs opened) — this is what gates push.offer_stale_on_open', () => {
    expect(parseOpenedPayload(notification({ type: 'offer_created', offer_id: 'o-1' }), 'opened').source).toBe(
      'opened',
    )
  })
})
