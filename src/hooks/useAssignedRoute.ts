import { useEffect, useRef, useState } from 'react'
import { fetchMyActiveRoute, nextPendingStop, type MyRoute } from '../services/routes'
import { captureError } from '../lib/observability/capture'

/**
 * Polling moderado (7s) para detectar automaticamente uma rota
 * atribuída/em andamento — funciona tanto para o fluxo "entregador da
 * loja" (rota confirmada direto pelo restaurante, sem oferta) quanto para
 * o fluxo regional (depois do aceite). Não depende de push/Firebase: é a
 * mesma tabela `routes` já protegida por RLS (driver_owns_route), só
 * verificada periodicamente em vez de em tempo real.
 *
 * Por que polling e não Supabase Realtime: Realtime exigiria configurar
 * replication na tabela `routes` (superfície adicional a revisar do ponto
 * de vista de RLS — Realtime respeita RLS, mas é mais uma peça de infra
 * para validar), gerenciar ciclo de vida de subscription/reconexão em
 * background mobile, e não traria ganho real para um MVP de piloto — a
 * diferença entre "instantâneo" e "até 7s de atraso" não é perceptível
 * nesse fluxo. Polling é a opção simples e já comprovada neste código
 * (mesmo padrão de useDeliveryOffers).
 */
const POLL_MS = 7000

export function useAssignedRoute(enabled: boolean) {
  const [route, setRoute] = useState<MyRoute | null>(null)
  const [justAssignedRouteId, setJustAssignedRouteId] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const seenRouteIds = useRef<Set<string>>(new Set())
  // Permite a um evento externo (push de "rota atribuída" tocado/recebido)
  // forçar uma busca imediata em vez de esperar o próximo tick do polling
  // de 7s — mesmo padrão já usado em useDeliveryOffers.ts.
  const pollNow = useRef<() => Promise<boolean>>(() => Promise.resolve(false))

  useEffect(() => {
    if (!enabled) {
      if (timer.current) {
        clearInterval(timer.current)
        timer.current = null
      }
      setRoute(null)
      pollNow.current = () => Promise.resolve(false)
      return
    }

    let cancelled = false

    async function poll(): Promise<boolean> {
      try {
        const next = await fetchMyActiveRoute()
        if (cancelled) return false
        setRoute(next)

        const active = next && (next.status === 'confirmed' || next.status === 'in_progress')
        if (active && !seenRouteIds.current.has(next.id)) {
          seenRouteIds.current.add(next.id)
          setJustAssignedRouteId(next.id)
        }
        return active === true
      } catch (err) {
        if (!cancelled) captureError(err, { event: 'route.poll_assigned_route_failed' })
        return false
      }
    }

    pollNow.current = () => poll()
    void poll()
    timer.current = setInterval(() => void poll(), POLL_MS)

    return () => {
      cancelled = true
      pollNow.current = () => Promise.resolve(false)
      if (timer.current) clearInterval(timer.current)
      timer.current = null
    }
  }, [enabled])

  function dismissPopup() {
    setJustAssignedRouteId(null)
  }

  /** Busca o estado real agora — nunca confia no payload do push, sempre
   * refaz do banco. Resolve `true` se há rota confirmada/em andamento. */
  function refetch(): Promise<boolean> {
    return pollNow.current()
  }

  const showPopup = justAssignedRouteId !== null && route?.id === justAssignedRouteId

  return {
    route,
    showPopup,
    dismissPopup,
    refetch,
    nextStop: route ? nextPendingStop(route) : null,
  }
}
