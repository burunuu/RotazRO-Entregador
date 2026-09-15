import { useEffect, useRef, useState } from 'react'
import { acceptOffer, declineOffer, fetchPendingOffer, type PendingOffer } from '../services/dispatch'
import { describeError } from '../services/error-helpers'

/**
 * Fallback de polling (5s) para a oferta pendente do entregador, usado
 * enquanto o app está em primeiro plano e o entregador está online — o
 * push é o caminho principal, isto é redundância para quando o app já
 * está aberto ou o push atrasa. Para de fazer polling assim que `enabled`
 * vira falso (offline, logout, ou já em rota).
 */
const POLL_MS = 5000

export function useDeliveryOffers(enabled: boolean) {
  const [offer, setOffer] = useState<PendingOffer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  // Permite a um evento externo (push tocado/recebido) forçar uma busca
  // imediata em vez de esperar o próximo tick do polling de 5s.
  const pollNow = useRef<() => void>(() => {})

  useEffect(() => {
    if (!enabled) {
      if (timer.current) {
        clearInterval(timer.current)
        timer.current = null
      }
      setOffer(null)
      pollNow.current = () => {}
      return
    }

    let cancelled = false

    async function poll() {
      try {
        const next = await fetchPendingOffer()
        if (!cancelled) {
          setOffer(next)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('ERRO_FETCH_OFFER:', err)
        }
      }
    }

    pollNow.current = () => void poll()
    void poll()
    timer.current = setInterval(() => void poll(), POLL_MS)

    return () => {
      cancelled = true
      pollNow.current = () => {}
      if (timer.current) clearInterval(timer.current)
      timer.current = null
    }
  }, [enabled])

  /** Busca o estado real agora — nunca confia no payload do push, sempre refaz do banco. */
  function refetch() {
    pollNow.current()
  }

  async function accept(): Promise<string | null> {
    if (!offer || busy) return null
    setBusy(true)
    setError(null)
    try {
      const { routeId } = await acceptOffer(offer.id)
      setOffer(null)
      return routeId
    } catch (err) {
      setError(describeError(err, 'ACEITAR_OFERTA', 'Não foi possível aceitar a entrega.'))
      // Sempre refaz o fetch em vez de confiar no estado local: a oferta
      // pode já ter sido aceita por outro entregador ou expirado.
      setOffer(await fetchPendingOffer().catch(() => null))
      return null
    } finally {
      setBusy(false)
    }
  }

  async function decline(): Promise<void> {
    if (!offer || busy) return
    setBusy(true)
    setError(null)
    try {
      await declineOffer(offer.id)
      setOffer(null)
    } catch (err) {
      setError(describeError(err, 'RECUSAR_OFERTA', 'Não foi possível recusar a entrega.'))
    } finally {
      setBusy(false)
    }
  }

  return { offer, error, busy, accept, decline, refetch }
}
