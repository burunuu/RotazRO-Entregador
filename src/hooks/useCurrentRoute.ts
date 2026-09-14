import { useCallback, useState } from 'react'
import {
  completeMyRoute,
  deliverMyStop,
  fetchMyActiveRoute,
  reportMyStopOccurrence,
  setMyStopNote,
  startMyRoute,
  type MyRoute,
} from '../services/routes'

export function useCurrentRoute() {
  const [route, setRoute] = useState<MyRoute | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await fetchMyActiveRoute()
      setRoute(next)
      return next
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar a rota.')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  async function runAction<T>(action: () => Promise<T>): Promise<T | null> {
    setActionBusy(true)
    setError(null)
    try {
      const result = await action()
      await refresh()
      return result
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir a ação.')
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
    start: (routeId: string) => runAction(() => startMyRoute(routeId)),
    deliver: (stopId: string) => runAction(() => deliverMyStop(stopId)),
    reportOccurrence: (stopId: string, occurrenceType: string, note: string) =>
      runAction(() => reportMyStopOccurrence(stopId, occurrenceType, note)),
    setNote: (stopId: string, note: string) => runAction(() => setMyStopNote(stopId, note)),
    complete: (routeId: string) => runAction(() => completeMyRoute(routeId)),
  }
}
