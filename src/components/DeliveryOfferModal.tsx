import type { PendingOffer } from '../services/dispatch'

function km(meters: number | null): string {
  if (meters == null) return '—'
  return `${(meters / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`
}

function minutes(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return '—'
  return `${Math.max(1, Math.round(seconds / 60))} min`
}

type DeliveryOfferModalProps = {
  offer: PendingOffer
  busy: boolean
  error: string | null
  onAccept: () => void
  onDecline: () => void
}

/**
 * Antes do aceite: só o necessário para decidir. Nunca mostra dados de
 * clientes (nome completo, telefone, endereço residencial, observações) —
 * isso só é liberado depois do aceite, na tela Minha Rota.
 */
export function DeliveryOfferModal({ offer, busy, error, onAccept, onDecline }: DeliveryOfferModalProps) {
  return (
    <div className="offer-modal-backdrop" role="presentation">
      <section className="offer-modal card" role="dialog" aria-modal="true" aria-label="Nova entrega">
        <p className="eyebrow">NOVA ENTREGA</p>

        <div className="offer-modal-field">
          <span className="offer-modal-label">Restaurante</span>
          <strong>{offer.organizationName ?? 'Restaurante'}</strong>
        </div>

        <div className="offer-modal-field">
          <span className="offer-modal-label">Coleta</span>
          <strong>{offer.pickupAddress ?? '—'}</strong>
        </div>

        <div className="offer-modal-grid">
          <div>
            <span className="offer-modal-label">Paradas</span>
            <strong>{offer.stopsCount ?? '—'}</strong>
          </div>
          <div>
            <span className="offer-modal-label">Distância da rota</span>
            <strong>{km(offer.routeDistanceM)}</strong>
          </div>
          <div>
            <span className="offer-modal-label">Tempo estimado</span>
            <strong>{minutes(offer.routeDurationS)}</strong>
          </div>
          <div>
            <span className="offer-modal-label">Até a coleta</span>
            <strong>{km(offer.distanceToPickupM)}</strong>
          </div>
          <div>
            <span className="offer-modal-label">Chegada estimada</span>
            <strong>{minutes(offer.etaToPickupS)}</strong>
          </div>
        </div>

        {error && <div className="error">{error}</div>}

        <div className="offer-modal-actions">
          <button type="button" className="secondary" onClick={onDecline} disabled={busy}>
            Recusar
          </button>
          <button type="button" onClick={onAccept} disabled={busy}>
            {busy ? 'Aceitando...' : 'Aceitar entrega'}
          </button>
        </div>
      </section>
    </div>
  )
}
