import { useEffect, useState } from 'react'
import type { MyRouteStop } from '../services/routes'
import { OCCURRENCE_OPTIONS } from '../lib/occurrence-options'

type OccurrenceSheetProps = {
  open: boolean
  /** Só paradas ainda pendentes podem ser escolhidas — as demais já estão resolvidas. */
  stops: MyRouteStop[]
  busy: boolean
  error: string | null
  onClose: () => void
  onConfirm: (stopId: string, occurrenceType: string, note: string) => void
}

/**
 * Ação única "Problema com alguma entrega?" no fim da lista — mesmo padrão
 * conceitual do bottom sheet do portal Web (src/components/routes/
 * OccurrenceSheet.tsx): primeiro escolhe a parada, depois o motivo e uma
 * observação opcional. Reaproveita report_my_stop_occurrence
 * (occurrence_type/occurrence_at/execution_note) — nenhuma lógica nova.
 */
export function OccurrenceSheet({ open, stops, busy, error, onClose, onConfirm }: OccurrenceSheetProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [occurrenceType, setOccurrenceType] = useState(OCCURRENCE_OPTIONS[0].value)
  const [note, setNote] = useState('')

  useEffect(() => {
    if (open) {
      setSelectedId(null)
      setOccurrenceType(OCCURRENCE_OPTIONS[0].value)
      setNote('')
    }
  }, [open])

  if (!open) return null

  const pendingStops = stops.filter((s) => s.status === 'pending')
  const picking = selectedId === null
  const selected = stops.find((s) => s.id === selectedId) ?? null

  return (
    <div className="offer-modal-backdrop" role="presentation">
      <section className="occurrence-sheet" role="dialog" aria-modal="true" aria-label="Registrar ocorrência">
        <div className="occurrence-sheet-header">
          <h2>{picking ? 'Qual entrega teve problema?' : 'Registrar ocorrência'}</h2>
          {!picking && selected && <p className="occurrence-sheet-subtitle">{selected.customerName}</p>}
          <button type="button" className="occurrence-sheet-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        {picking ? (
          <div className="occurrence-sheet-list">
            {pendingStops.length === 0 && <p className="description">Nenhuma parada pendente no momento.</p>}
            {pendingStops.map((stop) => (
              <button
                key={stop.id}
                type="button"
                className="occurrence-sheet-list-item"
                onClick={() => setSelectedId(stop.id)}
              >
                <span className="route-stop-badge">{stop.position}</span>
                <span className="occurrence-sheet-list-text">
                  <strong>{stop.customerName}</strong>
                  <small>{stop.address}</small>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <button type="button" className="occurrence-sheet-back" onClick={() => setSelectedId(null)}>
              ← Escolher outra entrega
            </button>

            <label className="occurrence-sheet-field">
              Motivo
              <select value={occurrenceType} onChange={(e) => setOccurrenceType(e.target.value)}>
                {OCCURRENCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="occurrence-sheet-field">
              Observação (opcional)
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 500))}
                maxLength={500}
                rows={3}
                placeholder="Ex.: interfone não funcionou"
              />
            </label>

            {error && <div className="error">{error}</div>}

            <button
              type="button"
              className="button-warning"
              disabled={busy}
              onClick={() => selectedId && onConfirm(selectedId, occurrenceType, note)}
            >
              {busy ? 'Registrando...' : 'Confirmar ocorrência'}
            </button>
          </>
        )}
      </section>
    </div>
  )
}
