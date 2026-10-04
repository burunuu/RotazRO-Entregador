import { describe, expect, it } from 'vitest'
import { computeHistoryMetrics, getRouteDistance, type RouteHistoryItem } from '../history-metrics'

// Every timestamp here is built with `new Date(y, m, d, h, min)` — the LOCAL
// constructor — never a hardcoded UTC/ISO string. computeHistoryMetrics
// compares wall-clock local time (device timezone), so a test that assumes
// a specific UTC offset would only pass by coincidence on a machine that
// happens to share it, and silently test the wrong thing everywhere else.
// Using the local constructor for both `now` and each route's completed_at
// keeps the test correct on any machine, in any timezone.

function route(overrides: Partial<RouteHistoryItem>): RouteHistoryItem {
  return {
    id: 'r-1',
    organization_id: 'org-1',
    status: 'completed',
    total_distance_m: 1000,
    actual_distance_m: null,
    estimated_duration_s: 600,
    started_at: null,
    completed_at: null,
    created_at: new Date(2026, 8, 1, 12, 0).toISOString(),
    organization_name: 'Loja',
    deliveries: 2,
    amount_cents: 500,
    ...overrides,
  }
}

describe('computeHistoryMetrics — day/week/month boundaries follow local wall-clock time', () => {
  it('a route completed at 23:59 local counts in "today" for that local day, even though the UTC date may already have rolled to tomorrow', () => {
    const now = new Date(2026, 8, 28, 23, 59)
    const routeCompletedAt = new Date(2026, 8, 28, 23, 58)

    const history = [route({ completed_at: routeCompletedAt.toISOString() })]
    const metrics = computeHistoryMetrics(history, now)

    expect(metrics.today.routes).toBe(1)
  })

  it('a route completed 2 minutes into the new local day does NOT count in "today" for the PREVIOUS local day', () => {
    const now = new Date(2026, 8, 29, 0, 2) // just past local midnight, day 29 started
    const routeCompletedYesterday = new Date(2026, 8, 28, 23, 58) // still day 28

    const history = [route({ completed_at: routeCompletedYesterday.toISOString() })]
    const metrics = computeHistoryMetrics(history, now)

    expect(metrics.today.routes).toBe(0)
    // Still counts in the month, since it's the same calendar month.
    expect(metrics.month.routes).toBe(1)
  })

  it('a route completed earlier in the same local day counts in today/week/month', () => {
    const now = new Date(2026, 8, 28, 16, 0)
    const routeThisMorning = new Date(2026, 8, 28, 9, 0)

    const history = [route({ completed_at: routeThisMorning.toISOString() })]
    const metrics = computeHistoryMetrics(history, now)

    expect(metrics.today.routes).toBe(1)
    expect(metrics.week.routes).toBe(1)
    expect(metrics.month.routes).toBe(1)
  })

  it('a route completed last month does not count in today/week/month', () => {
    const now = new Date(2026, 8, 28, 16, 0)
    const routeLastMonth = new Date(2026, 7, 31, 16, 0)

    const history = [route({ completed_at: routeLastMonth.toISOString() })]
    const metrics = computeHistoryMetrics(history, now)

    expect(metrics.today.routes).toBe(0)
    expect(metrics.week.routes).toBe(0)
    expect(metrics.month.routes).toBe(0)
  })

  it('a route not yet completed (still in progress, no completed_at) is excluded entirely', () => {
    const now = new Date(2026, 8, 28, 16, 0)
    const history = [route({ status: 'in_progress', completed_at: null })]
    const metrics = computeHistoryMetrics(history, now)

    expect(metrics.today.routes).toBe(0)
    expect(metrics.month.routes).toBe(0)
  })

  it('sums deliveries/distance/value across multiple routes in the period, using real data only — never invents a value', () => {
    const now = new Date(2026, 8, 28, 16, 0)
    const history = [
      route({
        completed_at: new Date(2026, 8, 28, 9, 0).toISOString(),
        deliveries: 3,
        actual_distance_m: 5000,
        amount_cents: 1000,
      }),
      route({
        completed_at: new Date(2026, 8, 28, 10, 0).toISOString(),
        deliveries: 2,
        actual_distance_m: null,
        total_distance_m: 2000, // falls back to the planned distance, never fabricates one
        amount_cents: null,
      }),
    ]
    const metrics = computeHistoryMetrics(history, now)

    expect(metrics.today.deliveries).toBe(5)
    expect(metrics.today.distanceMeters).toBe(7000)
    expect(metrics.today.amountCents).toBe(1000)
  })

  it('getRouteDistance prefers the real GPS-tracked distance over the pre-planned estimate, never invents a number', () => {
    expect(getRouteDistance(route({ actual_distance_m: 4200, total_distance_m: 5000 }))).toBe(4200)
    expect(getRouteDistance(route({ actual_distance_m: null, total_distance_m: 5000 }))).toBe(5000)
    expect(getRouteDistance(route({ actual_distance_m: null, total_distance_m: null }))).toBe(0)
  })

  it('an external route (different organization_id) counts toward the driver stats exactly like a linked one — the metrics layer draws no distinction', () => {
    const now = new Date(2026, 8, 28, 16, 0)
    const history = [
      route({ completed_at: new Date(2026, 8, 28, 9, 0).toISOString(), organization_id: 'org-linked' }),
      route({
        completed_at: new Date(2026, 8, 28, 10, 0).toISOString(),
        organization_id: 'org-external',
      }),
    ]
    const metrics = computeHistoryMetrics(history, now)

    expect(metrics.today.routes).toBe(2)
    expect(metrics.today.restaurants).toBe(2)
  })
})
