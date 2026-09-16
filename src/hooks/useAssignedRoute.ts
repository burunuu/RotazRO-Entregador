import { useEffect, useRef, useState } from 'react'
import { fetchMyActiveRoute, nextPendingStop, type MyRoute } from '../services/routes'

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

  useEffect(() => {
    if (!enabled) {
      if (timer.current) {
        clearInterval(timer.current)
        timer.current = null
      }
      setRoute(null)
      return
    }

    let cancelled = false

    async function poll() {
      try {
        const next = await fetchMyActiveRoute()
        if (cancelled) return
        setRoute(next)

        const active = next && (next.status === 'confirmed' || next.status === 'in_progress')
        if (active && !seenRouteIds.current.has(next.id)) {
          seenRouteIds.current.add(next.id)
          setJustAssignedRouteId(next.id)
        }
      } catch (err) {
        if (!cancelled) console.error('ERRO_POLL_ROTA_ATRIBUIDA:', err)
      }
    }

    void poll()
    timer.current = setInterval(() => void poll(), POLL_MS)

    return () => {
      cancelled = true
      if (timer.current) clearInterval(timer.current)
      timer.current = null
    }
  }, [enabled])

  function dismissPopup() {
    setJustAssignedRouteId(null)
  }

  const showPopup = justAssignedRouteId !== null && route?.id === justAssignedRouteId

  return {
    route,
    showPopup,
    dismissPopup,
    nextStop: route ? nextPendingStop(route) : null,
  }
}
