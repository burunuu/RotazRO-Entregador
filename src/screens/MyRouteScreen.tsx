import { useEffect } from 'react'
import { useCurrentRoute } from '../hooks/useCurrentRoute'
import { RouteProgress } from '../components/RouteProgress'
import { RouteStopCard } from '../components/RouteStopCard'
import { deliveredCount, nextPendingStop } from '../services/routes'

function formatKm(meters: number | null): string {
  if (meters == null) return '—'
  return `${(meters / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`
}

function formatMinutes(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return '—'
  return `${Math.max(1, Math.round(seconds / 60))} min`
}

const STATUS_LABEL: Record<string, string> = {
  confirmed: 'Aguardando início',
  in_progress: 'Em andamento',
  completed: 'Concluída',
  cancelled: 'Cancelada',
}

/**
 * Reaproveita o mesmo modelo do portal do entregador (route_stops,
 * occurrence_type/occurrence_at, execution_note) — ver
 * src/lib/share/driver-portal.functions.ts no repo Web. Autorização aqui é
 * pela identidade do entregador (RLS via driver_owns_route), não por token.
 */
export function MyRouteScreen() {
  const currentRoute = useCurrentRoute()

  useEffect(() => {
    void currentRoute.refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const route = currentRoute.route

  if (currentRoute.loading && !route) {
    return (
      <section className="card">
        <p className="eyebrow">MINHA ROTA</p>
        <p>Carregando rota...</p>
      </section>
    )
  }

  if (!route) {
    return (
      <section className="card">
        <p className="eyebrow">MINHA ROTA</p>
        <h2>Nenhuma rota atribuída no momento.</h2>
        {currentRoute.error && <div className="error">{currentRoute.error}</div>}
        <button type="button" className="secondary" onClick={() => void currentRoute.refresh()}>
          Atualizar
        </button>
      </section>
    )
  }

  const delivered = deliveredCount(route)
  const total = route.stops.length
  const next = nextPendingStop(route)
  const finished = route.status !== 'completed' && route.status !== 'cancelled' && next === null

  return (
    <div className="my-route-screen">
      <section className="card">
        <p className="eyebrow">MINHA ROTA</p>
        <h2>{route.organizationName}</h2>
        <p className="route-status-label">{STATUS_LABEL[route.status] ?? route.status}</p>

        {route.status === 'in_progress' && <RouteProgress delivered={delivered} total={total} />}

        {currentRoute.error && <div className="error">{currentRoute.error}</div>}

        {route.status === 'confirmed' && (
          <button type="button" disabled={currentRoute.actionBusy} onClick={() => void currentRoute.start(route.id)}>
            {currentRoute.actionBusy ? 'Iniciando...' : 'Iniciar rota'}
          </button>
        )}
      </section>

      {route.status === 'in_progress' && next && (
        <RouteStopCard
          stop={next}
          busy={currentRoute.actionBusy}
          onDeliver={() => void currentRoute.deliver(next.id)}
          onReportOccurrence={(type, note) => void currentRoute.reportOccurrence(next.id, type, note)}
          onSetNote={(note) => void currentRoute.setNote(next.id, note)}
        />
      )}

      {(finished || route.status === 'completed') && (
        <section className="card">
          <p className="eyebrow">ROTA CONCLUÍDA</p>
          <div className="route-summary-grid">
            <div>
              <span className="offer-modal-label">Entregas realizadas</span>
              <strong>{delivered}</strong>
            </div>
            <div>
              <span className="offer-modal-label">Distância</span>
              <strong>{formatKm(route.totalDistanceM)}</strong>
            </div>
            <div>
              <span className="offer-modal-label">Tempo</span>
              <strong>{formatMinutes(route.estimatedDurationS)}</strong>
            </div>
            <div>
              <span className="offer-modal-label">Restaurante</span>
              <strong>{route.organizationName}</strong>
            </div>
          </div>

          {route.status !== 'completed' && (
            <button
              type="button"
              disabled={currentRoute.actionBusy}
              onClick={() => void currentRoute.complete(route.id)}
            >
              {currentRoute.actionBusy ? 'Finalizando...' : 'Finalizar rota'}
            </button>
          )}
        </section>
      )}
    </div>
  )
}
