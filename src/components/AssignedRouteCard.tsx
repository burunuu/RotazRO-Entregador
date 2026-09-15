import type { MyRoute, MyRouteStop } from '../services/routes'
import { deliveredCount } from '../services/routes'

function km(meters: number | null): string {
  if (meters == null) return '—'
  return `${(meters / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`
}

function minutes(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return '—'
  return `${Math.max(1, Math.round(seconds / 60))} min`
}

type AssignedRouteCardProps = {
  route: MyRoute
  nextStop: MyRouteStop | null
  onOpen: () => void
}

/**
 * Card operacional persistente na Home — fica visível enquanto houver uma
 * rota atribuída (confirmed) ou em andamento (in_progress), independente
 * de ela ter vindo do fluxo "entregador da loja" ou de uma oferta regional
 * aceita. A partir do momento em que a rota existe, a experiência é única.
 */
export function AssignedRouteCard({ route, nextStop, onOpen }: AssignedRouteCardProps) {
  const running = route.status === 'in_progress'
  const total = route.stops.length
  const delivered = deliveredCount(route)

  if (running) {
    return (
      <section className="card assigned-route-card assigned-route-card--running">
        <p className="eyebrow">ROTA EM ANDAMENTO</p>
        <p className="assigned-route-progress">
          {delivered} de {total} entregas
        </p>
        {nextStop && <p className="assigned-route-next">Próxima: {nextStop.customerName}</p>}
        <button type="button" onClick={onOpen}>
          Continuar rota
        </button>
      </section>
    )
  }

  return (
    <section className="card assigned-route-card">
      <p className="eyebrow">ROTA ATRIBUÍDA</p>
      <p className="assigned-route-org">{route.organizationName}</p>
      <p className="assigned-route-meta">
        {total} {total === 1 ? 'entrega' : 'entregas'} · {km(route.totalDistanceM)} ·{' '}
        {minutes(route.estimatedDurationS)}
      </p>
      <button type="button" onClick={onOpen}>
        Ver minha rota
      </button>
    </section>
  )
}
