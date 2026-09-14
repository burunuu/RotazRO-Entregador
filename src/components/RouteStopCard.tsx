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

function formatCents(cents: number | null): string | null {
  if (cents == null) return null
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

type RouteStopCardProps = {
  stop: MyRouteStop
  busy: boolean
  onDeliver: () => void
  onReportOccurrence: (occurrenceType: string, note: string) => void
}

export function RouteStopCard({ stop, busy, onDeliver, onReportOccurrence }: RouteStopCardProps) {
  const [occurrenceOpen, setOccurrenceOpen] = useState(false)
  const [occurrenceType, setOccurrenceType] = useState(OCCURRENCE_OPTIONS[0].value)
  const [occurrenceNote, setOccurrenceNote] = useState('')

  const amount = formatCents(stop.amountDueCents)
  const change = formatCents(stop.changeForCents)
  const hasCoords = stop.latitude != null && stop.longitude != null

  return (
    <article className="card route-stop-card">
      <p className="eyebrow">PRÓXIMA ENTREGA</p>

      <h2>{stop.customerName}</h2>

      <p className="route-stop-address">
        {stop.address}
        {stop.complement ? `, ${stop.complement}` : ''}
      </p>
      {stop.neighborhood && <p className="route-stop-neighborhood">{stop.neighborhood}</p>}

      {stop.orderDescription && (
        <p>
          <strong>Pedido:</strong> {stop.orderDescription}
        </p>
      )}
      {stop.paymentMethod && (
        <p>
          <strong>Pagamento:</strong> {stop.paymentMethod}
          {amount ? ` — ${amount}` : ''}
        </p>
      )}
      {change && (
        <p>
          <strong>Troco para:</strong> {change}
        </p>
      )}
      {stop.notes && (
        <p>
          <strong>Observação:</strong> {stop.notes}
        </p>
      )}
      {stop.executionNote && (
        <p>
          <strong>Observação da execução:</strong> {stop.executionNote}
        </p>
      )}

      <div className="route-stop-actions">
        {stop.phone && (
          <a className="button-like secondary" href={`tel:${stop.phone}`}>
            Ligar
          </a>
        )}
        {hasCoords && (
          <a
            className="button-like secondary"
            href={singleStopMapsUrl(stop.latitude as number, stop.longitude as number)}
            target="_blank"
            rel="noreferrer"
          >
            Abrir no Google Maps
          </a>
        )}
      </div>

      <div className="route-stop-actions">
        <button type="button" onClick={onDeliver} disabled={busy}>
          Entregue
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => setOccurrenceOpen((open) => !open)}
          disabled={busy}
        >
          Problema na entrega
        </button>
      </div>

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
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              onReportOccurrence(occurrenceType, occurrenceNote)
              setOccurrenceOpen(false)
              setOccurrenceNote('')
            }}
          >
            Confirmar ocorrência
          </button>
        </div>
      )}
    </article>
  )
}
