import type { MyRouteStop } from '../services/routes'
import { singleStopMapsUrl } from '../services/maps-links'
import { OCCURRENCE_LABELS } from '../lib/occurrence-options'

function formatCents(cents: number | null): string | null {
  if (cents == null) return null
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const PAYMENT_LABELS: Record<string, string> = {
  dinheiro: 'Dinheiro',
  cash: 'Dinheiro',
  pix: 'Pix',
  cartao: 'Cartão',
  cartão: 'Cartão',
  card: 'Cartão',
  credito: 'Cartão de crédito',
  debito: 'Cartão de débito',
  online: 'Pago online',
  pago: 'Já pago',
}

function paymentLabel(value: string | null): string | null {
  const raw = (value ?? '').trim()
  if (!raw) return null
  return PAYMENT_LABELS[raw.toLowerCase()] ?? raw
}

type RouteStopCardProps = {
  stop: MyRouteStop
  isNext: boolean
  running: boolean
  busy: boolean
  onDeliver: () => void
}

/**
 * Card individual de uma parada — paridade visual com o portal Web
 * (e.$token.tsx). Ações por card: Maps, Ligar, Entregue. "Problema na
 * entrega" deixou de ser por card — agora é uma ação única no fim da
 * lista (ver OccurrenceSheet em MyRouteScreen), escolhendo a parada lá.
 * Observação de execução (set_my_stop_note) segue disponível no
 * serviço/hook (useCurrentRoute.setNote), só não tem mais gatilho na UI
 * principal.
 */
export function RouteStopCard({ stop, isNext, running, busy, onDeliver }: RouteStopCardProps) {
  const amount = formatCents(stop.amountDueCents)
  const change = formatCents(stop.changeForCents)
  const method = paymentLabel(stop.paymentMethod)
  const hasCoords = stop.latitude != null && stop.longitude != null
  const hasPayment = amount != null || method != null || change != null

  const done = stop.status === 'delivered'
  const failed = stop.status === 'failed'
  const closed = done || failed || stop.status === 'skipped'

  const badgeClass = failed ? 'warning' : done ? 'done' : isNext ? 'next' : ''
  const cardClass = failed
    ? 'route-stop-card--warning'
    : done
      ? 'route-stop-card--done'
      : isNext
        ? 'route-stop-card--next'
        : ''

  return (
    <article className={`route-stop-card ${cardClass}`}>
      <div className="route-stop-top">
        <span className={`route-stop-badge ${badgeClass}`}>{done ? '✓' : failed ? '!' : stop.position}</span>
        <div className="route-stop-main">
          <h3>{stop.customerName}</h3>
          {failed && stop.occurrenceType && (
            <p className="route-stop-occurrence-label">{OCCURRENCE_LABELS[stop.occurrenceType] ?? stop.occurrenceType}</p>
          )}
          <p className="route-stop-address">
            {stop.address}
            {stop.complement ? `, ${stop.complement}` : ''}
            {stop.neighborhood ? ` — ${stop.neighborhood}` : ''}
          </p>
          {stop.phone && <p className="route-stop-phone">{stop.phone}</p>}

          {stop.orderDescription && <p className="route-stop-order-block">{stop.orderDescription}</p>}
          {stop.notes && (
            <p className="route-stop-notes">
              <strong>Obs.:</strong> {stop.notes}
            </p>
          )}

          {hasPayment && (
            <dl className="route-stop-payment">
              {amount != null && (
                <div>
                  <dt>Valor do pedido:</dt>
                  <dd>{amount}</dd>
                </div>
              )}
              {method && (
                <div>
                  <dt>Pagamento:</dt>
                  <dd>{method}</dd>
                </div>
              )}
              {change != null && (
                <div>
                  <dt>Troco para:</dt>
                  <dd>{change}</dd>
                </div>
              )}
            </dl>
          )}

          {stop.executionNote && (
            <p className="route-stop-execution-note">
              <strong>Observação da entrega:</strong> {stop.executionNote}
            </p>
          )}
        </div>
      </div>

      <div className="route-stop-actions-grid">
        {(hasCoords || stop.phone) && (
          <div className="route-stop-actions-row">
            {hasCoords && (
              <a
                className="button-like secondary"
                href={singleStopMapsUrl(stop.latitude as number, stop.longitude as number)}
                target="_blank"
                rel="noreferrer"
              >
                Abrir no Maps
              </a>
            )}
            {stop.phone && (
              <a className="button-like secondary" href={`tel:${stop.phone}`}>
                Ligar
              </a>
            )}
          </div>
        )}
        {!closed && (
          <button
            type="button"
            className="button-accent"
            disabled={!running || busy}
            onClick={() => {
              if (window.confirm(`Confirmar entrega de ${stop.customerName}?`)) onDeliver()
            }}
          >
            Entregue
          </button>
        )}
      </div>
    </article>
  )
}
