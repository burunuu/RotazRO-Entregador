import { useEffect, useMemo, useState } from 'react'
import { useCurrentRoute } from '../hooks/useCurrentRoute'
import { RouteProgress } from '../components/RouteProgress'
import { RouteStopCard } from '../components/RouteStopCard'
import { OccurrenceSheet } from '../components/OccurrenceSheet'
import { deliveredCount, nextPendingStop } from '../services/routes'
import { fullRouteUrls, singleStopMapsUrl, MAX_STOPS_PER_LINK } from '../services/maps-links'

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
 * src/lib/share/driver-portal.functions.ts no repo Web, que é a referência
 * visual/funcional desta tela. Autorização aqui é pela identidade do
 * entregador (RLS via driver_owns_route), não por token.
 */
export function MyRouteScreen() {
  const currentRoute = useCurrentRoute()
  const [occurrenceOpen, setOccurrenceOpen] = useState(false)

  useEffect(() => {
    void currentRoute.refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const route = currentRoute.route

  // route_stops.status é a fonte da verdade de pendência (delivered/failed/
  // skipped fecham a parada) — a rota completa no Maps nunca pode incluir
  // paradas já fechadas, senão reabre destinos já resolvidos. A ordem
  // (position) das restantes é preservada, sem reotimizar.
  const pendingStopsForMaps = useMemo(() => route?.stops.filter((s) => s.status === 'pending') ?? [], [route])

  const fullLinks = useMemo(() => {
    if (!route || route.baseLatitude == null || route.baseLongitude == null) return []
    return fullRouteUrls(
      { latitude: route.baseLatitude, longitude: route.baseLongitude },
      pendingStopsForMaps.map((s) => ({ latitude: s.latitude, longitude: s.longitude })),
    )
  }, [route, pendingStopsForMaps])

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

  // "concluded" agrega delivered+failed+skipped — usado só para a barra de
  // progresso e o recap final (uma parada com ocorrência também "andou" a
  // rota). Para o summary do topo, "entregues" precisa ser só delivered de
  // verdade, senão uma ocorrência é contada como entrega.
  const concluded = deliveredCount(route)
  const delivered = route.stops.filter((s) => s.status === 'delivered').length
  const failed = route.stops.filter((s) => s.status === 'failed').length
  const pending = route.stops.filter((s) => s.status === 'pending').length
  const total = route.stops.length
  const next = nextPendingStop(route)
  const running = route.status === 'in_progress'
  const finished = route.status !== 'completed' && route.status !== 'cancelled' && next === null

  return (
    <div className="my-route-screen">
      <div className="my-route-body">
        {/* Summary compacto: total/entregues/pendentes + km/tempo, tudo
            centralizado — substitui o header grande (EXECUÇÃO/Rota de
            hoje/nome do restaurante) e o card "Saída:" separado. */}
        <section className="card route-top-summary">
          {running && <span className="route-status-label">{STATUS_LABEL[route.status] ?? route.status}</span>}
          <div className="route-top-summary-stats">
            <div className="route-top-summary-stat">
              <strong>{total}</strong>
              <span>{total === 1 ? 'entrega' : 'entregas'}</span>
            </div>
            <div className="route-top-summary-stat">
              <strong>{delivered}</strong>
              <span>{delivered === 1 ? 'entregue' : 'entregues'}</span>
            </div>
            <div className="route-top-summary-stat">
              <strong>{pending}</strong>
              <span>pendentes</span>
            </div>
          </div>
          <p className="route-top-summary-meta">
            {formatKm(route.totalDistanceM)} • {formatMinutes(route.estimatedDurationS)}
            {failed > 0 ? ` • ${failed} ${failed === 1 ? 'ocorrência' : 'ocorrências'}` : ''}
          </p>
        </section>

        {running && <RouteProgress delivered={concluded} total={total} />}

        {currentRoute.error && <div className="error">{currentRoute.error}</div>}

        {route.status === 'confirmed' && (
          <button
            type="button"
            className="button-accent"
            disabled={currentRoute.actionBusy}
            onClick={() => void currentRoute.start(route.id)}
          >
            {currentRoute.actionBusy ? 'Iniciando...' : 'Iniciar rota'}
          </button>
        )}

        {fullLinks.length > 0 && (
          <div className="route-full-links">
            {fullLinks.map((url, index) => (
              <a key={url} href={url} target="_blank" rel="noreferrer" className="button-like button-outline">
                {fullLinks.length === 1
                  ? 'Abrir rota completa no Google Maps'
                  : `Rota completa — parte ${index + 1}`}
              </a>
            ))}
            {fullLinks.length > 1 && (
              <p className="route-full-links-warning">
                O Google Maps aceita no máximo {MAX_STOPS_PER_LINK} paradas por link. A rota foi dividida em{' '}
                {fullLinks.length} partes, mantendo exatamente a mesma ordem.
              </p>
            )}
          </div>
        )}

        {next && (
          <section className="card route-next-highlight">
            <p className="route-next-kicker">Próxima parada</p>
            <p className="route-next-name">
              {next.position}. {next.customerName}
            </p>
            <p className="route-next-address">{next.address}</p>
            {next.latitude != null && next.longitude != null && (
              <a
                className="button-like button-accent"
                href={singleStopMapsUrl(next.latitude, next.longitude)}
                target="_blank"
                rel="noreferrer"
              >
                Abrir próxima parada no Google Maps
              </a>
            )}
          </section>
        )}

        <ol className="route-stop-list">
          {route.stops.map((stop) => (
            <li key={stop.id}>
              <RouteStopCard
                stop={stop}
                isNext={next?.id === stop.id}
                running={running}
                busy={currentRoute.actionBusy}
                onDeliver={() => void currentRoute.deliver(stop.id)}
              />
            </li>
          ))}
        </ol>

        {running && next !== null && (
          <button type="button" className="secondary route-problem-button" onClick={() => setOccurrenceOpen(true)}>
            Problema com alguma entrega?
          </button>
        )}

        {running && total > 0 && next === null && (
          <button
            type="button"
            className="button-accent"
            disabled={currentRoute.actionBusy}
            onClick={() => void currentRoute.complete(route.id)}
          >
            {currentRoute.actionBusy ? 'Finalizando...' : 'Finalizar rota'}
          </button>
        )}

        {(finished || route.status === 'completed') && (
          <section className="card route-summary-card">
            <p className="eyebrow">ROTA CONCLUÍDA</p>
            <div className="route-summary-grid">
              <div>
                <span className="offer-modal-label">Entregas realizadas</span>
                <strong>{concluded}</strong>
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

            {route.status === 'completed' && (
              <p className="route-finished-message">Rota concluída. Bom trabalho!</p>
            )}
          </section>
        )}
      </div>

      <OccurrenceSheet
        open={occurrenceOpen}
        stops={route.stops}
        busy={currentRoute.actionBusy}
        error={currentRoute.error}
        onClose={() => setOccurrenceOpen(false)}
        onConfirm={(stopId, type, note) => {
          // runAction devolve null quando a ação falha — só fecha o sheet
          // em caso de sucesso, senão o erro (mostrado dentro do sheet)
          // desapareceria junto.
          void currentRoute.reportOccurrence(stopId, type, note).then((result) => {
            if (result !== null) setOccurrenceOpen(false)
          })
        }}
      />
    </div>
  )
}
