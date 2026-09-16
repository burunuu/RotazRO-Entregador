import type { MyRoute } from '../services/routes'

function km(meters: number | null): string {
  if (meters == null) return '—'
  return `${(meters / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`
}

function minutes(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return '—'
  return `${Math.max(1, Math.round(seconds / 60))} min`
}

function timeOf(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

type AssignedRouteModalProps = {
  route: MyRoute
  onViewRoute: () => void
  onLater: () => void
}

/**
 * Fluxo "entregador da loja": a rota já foi atribuída explicitamente pelo
 * restaurante — não existe ACEITAR/RECUSAR aqui, só avisar e levar para a
 * tela de execução. Isso é diferente da oferta regional (DeliveryOfferModal),
 * onde o entregador ainda decide.
 */
export function AssignedRouteModal({ route, onViewRoute, onLater }: AssignedRouteModalProps) {
  return (
    <div className="offer-modal-backdrop" role="presentation">
      <section className="offer-modal card" role="dialog" aria-modal="true" aria-label="Nova rota atribuída">
        <p className="eyebrow">NOVA ROTA ATRIBUÍDA</p>

        <div className="offer-modal-field">
          <span className="offer-modal-label">Restaurante</span>
          <strong>{route.organizationName}</strong>
        </div>

        <div className="offer-modal-grid">
          <div>
            <span className="offer-modal-label">Entregas</span>
            <strong>{route.stops.length}</strong>
          </div>
          <div>
            <span className="offer-modal-label">Distância total</span>
            <strong>{km(route.totalDistanceM)}</strong>
          </div>
          <div>
            <span className="offer-modal-label">Tempo estimado</span>
            <strong>{minutes(route.estimatedDurationS)}</strong>
          </div>
          <div>
            <span className="offer-modal-label">Horário</span>
            <strong>{timeOf(route.createdAt)}</strong>
          </div>
        </div>

        <div className="offer-modal-actions">
          <button type="button" className="secondary" onClick={onLater}>
            Mais tarde
          </button>
          <button type="button" onClick={onViewRoute}>
            Ver minha rota
          </button>
        </div>
      </section>
    </div>
  )
}
