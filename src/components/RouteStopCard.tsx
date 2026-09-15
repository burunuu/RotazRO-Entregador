import { useState } from 'react'
import type { MyRouteStop } from '../services/routes'
import { singleStopMapsUrl } from '../services/maps-links'

const OCCURRENCE_OPTIONS: { value: string; label: string }[] = [
  { value: 'customer_absent', label: 'Cliente ausente' },
  { value: 'no_answer', label: 'Não atendeu' },
  { value: 'wrong_address', label: 'Endereço incorreto' },
  { value: 'refused', label: 'Cliente recusou' },
  { value: 'reschedule', label: 'Reagendar' },
  { value: 'other', label: 'Outro' },
]

const OCCURRENCE_LABELS: Record<string, string> = Object.fromEntries(
  OCCURRENCE_OPTIONS.map((o) => [o.value, o.label]),
)

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
  onReportOccurrence: (occurrenceType: string, note: string) => void
  onSetNote: (note: string) => void
}

export function RouteStopCard({
  stop,
  isNext,
  running,
  busy,
  onDeliver,
  onReportOccurrence,
  onSetNote,
}: RouteStopCardProps) {
  const [occurrenceOpen, setOccurrenceOpen] = useState(false)
  const [occurrenceType, setOccurrenceType] = useState(OCCURRENCE_OPTIONS[0].value)
  const [occurrenceNote, setOccurrenceNote] = useState('')

  // Observação de execução (route_stops.execution_note) — separada da
  // observação original do pedido (stop.notes, só leitura) e da observação
  // de ocorrência (painel "Problema na entrega" abaixo).
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState(stop.executionNote ?? '')

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

          {stop.executionNote && !noteOpen && (
            <p className="route-stop-execution-note">
              <strong>Observação da entrega:</strong> {stop.executionNote}
            </p>
          )}
        </div>
      </div>

      <div className="route-stop-actions-grid">
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
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => {
            setNoteDraft(stop.executionNote ?? '')
            setNoteOpen((v) => !v)
          }}
        >
          Observação
        </button>
        {!closed && (
          <button
            type="button"
            disabled={!running || busy}
            onClick={() => {
              if (window.confirm(`Confirmar entrega de ${stop.customerName}?`)) onDeliver()
            }}
          >
            Entregue
          </button>
        )}
      </div>

      {!closed && running && (
        <button
          type="button"
          className="secondary route-stop-problem-toggle"
          disabled={busy}
          onClick={() => setOccurrenceOpen((open) => !open)}
        >
          Problema na entrega
        </button>
      )}

      {noteOpen && (
        <div className="occurrence-panel">
          <label>
            Observação da entrega (opcional)
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value.slice(0, 500))}
              maxLength={500}
              rows={2}
              placeholder="Ex.: deixado com o porteiro"
            />
          </label>
          <div className="route-stop-actions">
            <button type="button" className="secondary" disabled={busy} onClick={() => setNoteOpen(false)}>
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                onSetNote(noteDraft)
                setNoteOpen(false)
              }}
            >
              Salvar
            </button>
          </div>
        </div>
      )}

      {occurrenceOpen && (
        <div className="occurrence-panel">
          <label>
            Motivo
            <select value={occurrenceType} onChange={(e) => setOccurrenceType(e.target.value)}>
              {OCCURRENCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Observação (opcional)
            <textarea
              value={occurrenceNote}
              onChange={(e) => setOccurrenceNote(e.target.value.slice(0, 500))}
              maxLength={500}
              rows={3}
              placeholder="Ex.: interfone não funcionou"
            />
          </label>
          <button
            type="button"
            className="button-warning"
            disabled={busy}
            onClick={() => {
              onReportOccurrence(occurrenceType, occurrenceNote)
              setOccurrenceOpen(false)
              setOccurrenceNote('')
            }}
          >
            {busy ? 'Registrando...' : 'Confirmar ocorrência'}
          </button>
        </div>
      )}
    </article>
  )
}
