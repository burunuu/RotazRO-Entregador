import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  completeMyRoute,
  deliverMyStop,
  fetchMyActiveRoute,
  reportMyStopOccurrence,
  setMyStopNote,
  startMyRoute,
  type MyRoute,
} from '../services/routes'
import { describeError } from '../services/error-helpers'

// Enquanto a rota está confirmed/in_progress, mantemos assinatura Realtime
// (routes + route_stops dessa rota) como mecanismo principal de
// sincronização, com um poll de baixa frequência como rede de segurança
// (cobre desconexão do socket Realtime, sem depender de detectar esse
// estado com precisão) e reconciliação ao reganhar foco/conexão.
const ACTIVE_ROUTE_STATUSES = new Set(['confirmed', 'in_progress'])
const REALTIME_DEBOUNCE_MS = 300
const FALLBACK_POLL_MS = 10000

export function useCurrentRoute() {
  const [route, setRoute] = useState<MyRoute | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const fetchSeqRef = useRef(0)

  const refresh = useCallback(async () => {
    const seq = ++fetchSeqRef.current
    setLoading(true)
    setError(null)
    try {
      const next = await fetchMyActiveRoute()
      // Ignora respostas de um refresh mais antigo que já foi ultrapassado
      // por um mais novo (realtime + poll podem disparar quase juntos) —
      // sem isso, uma resposta lenta poderia sobrescrever um estado mais
      // recente com um mais velho.
      if (seq === fetchSeqRef.current) setRoute(next)
      return next
    } catch (err) {
      if (seq === fetchSeqRef.current) {
        setError(describeError(err, 'CARREGAR_ROTA', 'Não foi possível carregar a rota.'))
      }
      return null
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false)
    }
  }, [])

  const refreshRef = useRef(refresh)
  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  const routeId = route?.id ?? null
  const isActive = route != null && ACTIVE_ROUTE_STATUSES.has(route.status)

  useEffect(() => {
    if (!routeId || !isActive) return

    let cancelled = false
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    function scheduleRefetch() {
      if (cancelled) return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        if (!cancelled) void refreshRef.current()
      }, REALTIME_DEBOUNCE_MS)
    }

    const channel = supabase
      .channel(`route-execution-${routeId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'route_stops', filter: `route_id=eq.${routeId}` },
        scheduleRefetch,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'routes', filter: `id=eq.${routeId}` },
        scheduleRefetch,
      )
      .subscribe()

    // Watchdog: garante convergência mesmo se o socket Realtime cair
    // silenciosamente (sem depender de detectar esse estado corretamente).
    const pollTimer = setInterval(() => {
      void refreshRef.current()
    }, FALLBACK_POLL_MS)

    function reconcile() {
      if (document.visibilityState === 'visible') scheduleRefetch()
    }
    document.addEventListener('visibilitychange', reconcile)
    window.addEventListener('online', reconcile)

    return () => {
      cancelled = true
      if (debounceTimer) clearTimeout(debounceTimer)
      clearInterval(pollTimer)
      document.removeEventListener('visibilitychange', reconcile)
      window.removeEventListener('online', reconcile)
      void supabase.removeChannel(channel)
    }
  }, [routeId, isActive])

  async function runAction<T>(action: () => Promise<T>, context: string): Promise<T | null> {
    setActionBusy(true)
    setError(null)
    try {
      const result = await action()
      await refresh()
      return result
    } catch (err) {
      setError(describeError(err, context, 'Não foi possível concluir a ação.'))
      return null
    } finally {
      setActionBusy(false)
    }
  }

  return {
    route,
    loading,
    error,
    actionBusy,
    refresh,
    start: (routeId: string) => runAction(() => startMyRoute(routeId), 'INICIAR_ROTA'),
    deliver: (stopId: string) => runAction(() => deliverMyStop(stopId), 'MARCAR_ENTREGUE'),
    reportOccurrence: (stopId: string, occurrenceType: string, note: string) =>
      runAction(() => reportMyStopOccurrence(stopId, occurrenceType, note), 'REGISTRAR_OCORRENCIA'),
    setNote: (stopId: string, note: string) => runAction(() => setMyStopNote(stopId, note), 'SALVAR_OBSERVACAO'),
    complete: (routeId: string) => runAction(() => completeMyRoute(routeId), 'FINALIZAR_ROTA'),
  }
}
