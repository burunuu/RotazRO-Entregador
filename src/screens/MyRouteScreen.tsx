import { useEffect, useMemo, useState } from 'react'
import { useCurrentRoute } from '../hooks/useCurrentRoute'
import { RouteProgress } from '../components/RouteProgress'
import { RouteStopCard } from '../components/RouteStopCard'
import { OccurrenceSheet } from '../components/OccurrenceSheet'
import { deliveredCount, nextPendingStop, routeRealDurationS } from '../services/routes'
import { fullRouteUrls, singleStopMapsUrl, MAX_STOPS_PER_LINK } from '../services/maps-links'
import { formatDuration } from '../lib/format'

function formatKm(meters: number | null): string {
  if (meters == null) return '—'
  return `${(meters / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`
}

const STATUS_LABEL: Record<string, string> = {
  confirmed: 'Aguardando início',
  in_progress: 'Em andamento',
  completed: 'Concluída',
  cancelled: 'Cancelada',
}

// Quanto tempo o resumo "rota concluída" fica na tela antes de voltar
// sozinho pro início — dá tempo de ler os números sem prender o
// entregador numa tela morta indefinidamente.
const AUTO_HOME_DELAY_MS = 2500

type FinishedRecap = {
  delivered: number
  distanceM: number | null
  durationS: number | null
  organizationName: string
}

type MyRouteScreenProps = {
  /** Chamado ao sair da tela de resumo pós-finalização (manual ou automático). */
  onFinished: () => void
}

/**
 * Reaproveita o mesmo modelo do portal do entregador (route_stops,
 * occurrence_type/occurrence_at, execution_note) — ver
 * src/lib/share/driver-portal.functions.ts no repo Web, que é a referência
 * visual/funcional desta tela. Autorização aqui é pela identidade do
 * entregador (RLS via driver_owns_route), não por token.
 */
export function MyRouteScreen({ onFinished }: MyRouteScreenProps) {
  const currentRoute = useCurrentRoute()
  const [occurrenceOpen, setOccurrenceOpen] = useState(false)
  const [finishedRecap, setFinishedRecap] = useState<FinishedRecap | null>(null)

  useEffect(() => {
    void currentRoute.refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const route = currentRoute.route

  // Volta sozinho pro início depois de mostrar o resumo — sem isso o
  // entregador ficava preso em "Nenhuma rota atribuída no momento." (a
  // rota some da consulta assim que o status vira completed).
  useEffect(() => {
    if (!finishedRecap) return
    const timer = setTimeout(() => onFinished(), AUTO_HOME_DELAY_MS)
    return () => clearTimeout(timer)
  }, [finishedRecap, onFinished])

  // Hooks sempre incondicionais (Rules of Hooks) — mesmo no estado
  // "finishedRecap", que não usa estes valores, mas precisa rodar os
  // mesmos hooks em toda renderização.
  const pendingStopsForMaps = useMemo(() => route?.stops.filter((s) => s.status === 'pending') ?? [], [route])

  const fullLinks = useMemo(() => {
    if (!route || route.baseLatitude == null || route.baseLongitude == null) return []
    return fullRouteUrls(
      { latitude: route.baseLatitude, longitude: route.baseLongitude },
      pendingStopsForMaps.map((s) => ({ latitude: s.latitude, longitude: s.longitude })),
    )
  }, [route, pendingStopsForMaps])

  if (finishedRecap) {
    return (
      <section className="card route-summary-card">
        <p className="eyebrow">ROTA CONCLUÍDA</p>
        <div className="route-summary-grid">
          <div>
            <span className="offer-modal-label">Entregas realizadas</span>
            <strong>{finishedRecap.delivered}</strong>
          </div>
          <div>
            <span className="offer-modal-label">Distância</span>
            <strong>{formatKm(finishedRecap.distanceM)}</strong>
          </div>
          <div>
            <span className="offer-modal-label">Tempo total</span>
            <strong>{formatDuration(finishedRecap.durationS)}</strong>
          </div>
          <div>
            <span className="offer-modal-label">Restaurante</span>
            <strong>{finishedRecap.organizationName}</strong>
          </div>
        </div>
        <p className="route-finished-message">Rota concluída. Bom trabalho!</p>
        <button type="button" className="button-accent" onClick={onFinished}>
          Voltar para o início
        </button>
      </section>
    )
  }

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
            {formatKm(route.totalDistanceM)} • {formatDuration(route.estimatedDurationS)}
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
            onClick={() => {
              // Snapshot antes de chamar complete(): assim que o status vira
              // completed, fetchMyActiveRoute() para de devolver esta rota
              // (só busca confirmed/in_progress) — sem isso não haveria como
              // mostrar o resumo depois.
              const startedAt = route.startedAt
              const snapshot: Omit<FinishedRecap, 'durationS'> = {
                delivered,
                distanceM: route.totalDistanceM,
                organizationName: route.organizationName,
              }
              const estimatedFallback = route.estimatedDurationS
              void currentRoute.complete(route.id).then((result) => {
                if (result === null) return
                // Duração real (completed_at - started_at): completed_at do
                // servidor ainda não foi buscado de volta (a rota já saiu do
                // filtro ativo), então usamos "agora" no cliente como proxy —
                // no máximo alguns segundos de diferença do timestamp real
                // gravado no banco. O histórico usa o valor real do banco.
                const durationS =
                  startedAt != null
                    ? Math.round((Date.now() - new Date(startedAt).getTime()) / 1000)
                    : estimatedFallback
                setFinishedRecap({ ...snapshot, durationS })
              })
            }}
          >
            {currentRoute.actionBusy ? 'Finalizando...' : 'Finalizar rota'}
          </button>
        )}

        {finished && (
          <section className="card route-summary-card">
            <p className="eyebrow">QUASE LÁ</p>
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
                <span className="offer-modal-label">Tempo total</span>
                <strong>{formatDuration(routeRealDurationS(route))}</strong>
              </div>
              <div>
                <span className="offer-modal-label">Restaurante</span>
                <strong>{route.organizationName}</strong>
              </div>
            </div>
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
