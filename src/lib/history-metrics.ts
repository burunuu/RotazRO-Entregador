// Lógica pura de estatísticas de histórico — extraída de App.tsx para ser
// testável sem precisar montar o componente inteiro (Capacitor/Supabase
// mockados). `now` é sempre recebido por parâmetro (nunca `new Date()`
// direto aqui dentro) para permitir testar limites de dia/semana/mês de
// forma determinística, inclusive perto da virada da meia-noite.

export type RouteRow = {
  id: string
  organization_id: string
  status: string
  total_distance_m: number | null
  actual_distance_m: number | null
  estimated_duration_s: number | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export type RouteHistoryItem = RouteRow & {
  organization_name: string
  deliveries: number
  amount_cents: number | null
}

export type HistoryMetrics = {
  routes: number
  deliveries: number
  distanceMeters: number
  durationSeconds: number
  amountCents: number
  restaurants: number
}

export const EMPTY_METRICS: HistoryMetrics = {
  routes: 0,
  deliveries: 0,
  distanceMeters: 0,
  durationSeconds: 0,
  amountCents: 0,
  restaurants: 0,
}

export function getRouteDate(route: RouteHistoryItem) {
  return new Date(route.completed_at ?? route.started_at ?? route.created_at)
}

export function getRouteDuration(route: RouteHistoryItem) {
  if (route.started_at && route.completed_at) {
    const start = new Date(route.started_at).getTime()
    const end = new Date(route.completed_at).getTime()

    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      return Math.round((end - start) / 1000)
    }
  }

  return route.estimated_duration_s ?? 0
}

export function getRouteDistance(route: RouteHistoryItem) {
  return route.actual_distance_m ?? route.total_distance_m ?? 0
}

export function calculateMetrics(routes: RouteHistoryItem[]): HistoryMetrics {
  if (routes.length === 0) {
    return EMPTY_METRICS
  }

  const restaurants = new Set<string>()

  let deliveries = 0
  let distanceMeters = 0
  let durationSeconds = 0
  let amountCents = 0

  for (const route of routes) {
    deliveries += route.deliveries
    distanceMeters += getRouteDistance(route)
    durationSeconds += getRouteDuration(route)
    amountCents += route.amount_cents ?? 0

    if (route.organization_id) {
      restaurants.add(route.organization_id)
    }
  }

  return {
    routes: routes.length,
    deliveries,
    distanceMeters,
    durationSeconds,
    amountCents,
    restaurants: restaurants.size,
  }
}

/**
 * Hoje/semana(seg-dom)/mês, todos calculados a partir do relógio LOCAL do
 * aparelho (getFullYear/getMonth/getDate, não getUTC*) — é o que faz uma
 * rota concluída às 23h58 em Rondônia contar no dia certo mesmo o servidor
 * guardando completed_at em UTC: `getRouteDate` já devolve o instante
 * absoluto, e comparar esse instante contra a meia-noite local (também um
 * instante absoluto, construído com o construtor `new Date(y, m, d)` que
 * interpreta os argumentos como hora local) dá a resposta certa
 * independente de fuso, contanto que o relógio do aparelho esteja correto.
 */
export function computeHistoryMetrics(history: RouteHistoryItem[], now: Date) {
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const day = now.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day

  const startWeek = new Date(startToday)
  startWeek.setDate(startToday.getDate() + mondayOffset)

  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const completedRoutes = history.filter(
    (route) => route.completed_at != null || route.status === 'completed',
  )

  return {
    today: calculateMetrics(completedRoutes.filter((route) => getRouteDate(route) >= startToday)),
    week: calculateMetrics(completedRoutes.filter((route) => getRouteDate(route) >= startWeek)),
    month: calculateMetrics(completedRoutes.filter((route) => getRouteDate(route) >= startMonth)),
  }
}
