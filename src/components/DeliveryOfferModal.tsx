import { useRef, useState } from 'react'
import type { PendingOffer } from '../services/dispatch'

function km(meters: number | null): string {
  if (meters == null) return '—'
  return `${(meters / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`
}

function minutes(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return '—'
  return `${Math.max(1, Math.round(seconds / 60))} min`
}

const ACCEPT_THRESHOLD = 0.72

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
 *
 * Aceite é por "arrastar para confirmar" (não um simples toque) para evitar
 * aceite acidental — a recusa continua sendo um toque direto, já que
 * recusar por engano tem consequência baixa (só perde essa oferta
 * específica). Existe um botão de aceite alternativo (toque + confirmação)
 * para quem não conseguir arrastar.
 */
export function DeliveryOfferModal({ offer, busy, error, onAccept, onDecline }: DeliveryOfferModalProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [armed, setArmed] = useState(false)
  const [trackWidth, setTrackWidth] = useState(1)
  const startX = useRef(0)

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (busy) return
    const track = trackRef.current
    if (!track) return
    const width = Math.max(1, track.clientWidth - 52) // 52 = largura do handle
    setTrackWidth(width)
    startX.current = e.clientX
    setDragging(true)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return
    const delta = Math.min(trackWidth, Math.max(0, e.clientX - startX.current))
    setDragX(delta)
    setArmed(delta / trackWidth >= ACCEPT_THRESHOLD)
  }

  function handlePointerUp() {
    if (!dragging) return
    setDragging(false)
    if (armed) {
      onAccept()
    }
    setDragX(0)
    setArmed(false)
  }

  const fillPercent = Math.round((dragX / trackWidth) * 100)

  return (
    <div className="offer-modal-backdrop" role="presentation">
      <section className="offer-modal card" role="dialog" aria-modal="true" aria-label="Nova entrega disponível">
        <p className="eyebrow">NOVA ENTREGA DISPONÍVEL</p>

        <div className="offer-modal-field">
          <span className="offer-modal-label">Restaurante</span>
          <strong>{offer.organizationName ?? 'Restaurante'}</strong>
        </div>

        <div className="offer-modal-field">
          <span className="offer-modal-label">Coleta</span>
          <strong>{offer.pickupAddress ?? '—'}</strong>
        </div>

        {offer.neighborhoods.length > 0 && (
          <div className="offer-modal-field">
            <span className="offer-modal-label">Região</span>
            <strong>{offer.neighborhoods.join(', ')}</strong>
          </div>
        )}

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

        <div className="offer-swipe-row">
          <button type="button" className="offer-decline-button" onClick={onDecline} disabled={busy}>
            Recusar
          </button>

          <div
            ref={trackRef}
            className={`offer-swipe-track ${armed ? 'armed' : ''}`}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <div className="offer-swipe-fill" style={{ width: `${Math.min(100, fillPercent + 12)}%` }} />
            <span className="offer-swipe-label">{busy ? 'Aceitando...' : armed ? 'Solte para aceitar' : 'Arraste para aceitar →'}</span>
            <div
              className="offer-swipe-handle"
              onPointerDown={handlePointerDown}
              style={{ transform: `translateX(${dragX}px)` }}
              role="slider"
              aria-label="Arraste para aceitar a entrega"
              aria-valuenow={fillPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              tabIndex={0}
            >
              →
            </div>
          </div>
        </div>

        <button
          type="button"
          className="secondary offer-accept-fallback"
          disabled={busy}
          onClick={() => {
            if (window.confirm('Aceitar esta entrega?')) onAccept()
          }}
        >
          Não consigo arrastar — aceitar com toque
        </button>
      </section>
    </div>
  )
}
