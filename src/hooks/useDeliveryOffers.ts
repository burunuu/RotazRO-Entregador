import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { acceptOffer, declineOffer, fetchPendingOffer, type PendingOffer } from '../services/dispatch'
import { describeError } from '../services/error-helpers'
import { captureError } from '../lib/observability/capture'
import { logger } from '../lib/observability/logger'

/**
 * Realtime é o caminho principal pra notar uma oferta nova (a loja clica
 * "buscar entregador" -> dispatch_route_regional insere a offer -> o
 * evento chega em ~instantes, sem esperar nenhum poll). O polling de 5s
 * continua existindo como rede de segurança — mesma arquitetura
 * "Realtime + poll fallback" já usada em useCurrentRoute.ts pra execução
 * de rota — cobre o socket cair silenciosamente, e continua sendo também
 * o que fecha o loop quando o push (desligado nesta build) atrasaria.
 * RLS ("driver reads own offers") já restringe o que cada assinatura
 * recebe — sem filtro explícito de driver_profile_id porque o cliente não
 * conhece esse id localmente, e não precisa: Realtime aplica a mesma RLS
 * da leitura normal por assinante.
 */
const POLL_MS = 5000
const REALTIME_DEBOUNCE_MS = 250

export function useDeliveryOffers(enabled: boolean) {
  const [offer, setOffer] = useState<PendingOffer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  // Permite a um evento externo (push tocado/recebido) forçar uma busca
  // imediata em vez de esperar o próximo tick do polling de 5s.
  const pollNow = useRef<() => void>(() => {})
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    async function poll() {
      try {
        const next = await fetchPendingOffer()
        if (!cancelled) {
          setOffer(next)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          captureError(err, { event: 'dispatch.fetch_offer_failed' })
        }
      }
    }

    function scheduleImmediatePoll() {
      if (cancelled) return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        if (!cancelled) void poll()
      }, REALTIME_DEBOUNCE_MS)
    }

    pollNow.current = () => void poll()
    void poll()
    timer.current = setInterval(() => void poll(), POLL_MS)

    const channel = supabase
      .channel('delivery-offers-mine')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_offers' }, scheduleImmediatePoll)
      .subscribe((status) => {
        // CLOSED é esperado no cleanup normal — o poll de 5s já garante
        // convergência mesmo se o socket cair silenciosamente.
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          logger.warn('realtime.subscription_error', { channel: 'delivery-offers-mine', status })
        }
      })

    return () => {
      cancelled = true
      pollNow.current = () => {}
      if (timer.current) clearInterval(timer.current)
      timer.current = null
      if (debounceTimer) clearTimeout(debounceTimer)
      void supabase.removeChannel(channel)
    }
  }, [enabled])

  // Fecha o modal no instante exato em que a oferta expira, em vez de
  // esperar até 5s pelo próximo tick do polling — puramente uma melhoria de
  // UI local (o cliente nunca decide "expirado" por conta própria em
  // nenhuma chamada ao banco; accept()/decline() continuam validando tudo
  // server-side). Sem toast/aviso: o modal simplesmente some, como já
  // acontecia por polling, só que sem o atraso perceptível.
  useEffect(() => {
    if (expiryTimer.current) {
      clearTimeout(expiryTimer.current)
      expiryTimer.current = null
    }
    if (!offer) return
    const msRemaining = new Date(offer.expiresAt).getTime() - Date.now()
    if (msRemaining <= 0) {
      setOffer(null)
      return
    }
    expiryTimer.current = setTimeout(() => setOffer(null), msRemaining)
    return () => {
      if (expiryTimer.current) {
        clearTimeout(expiryTimer.current)
        expiryTimer.current = null
      }
    }
  }, [offer])

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
      logger.info('dispatch.offer_accepted', { offer_id: offer.id, route_id: routeId })
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
      logger.info('dispatch.offer_declined', { offer_id: offer.id })
      setOffer(null)
    } catch (err) {
      setError(describeError(err, 'RECUSAR_OFERTA', 'Não foi possível recusar a entrega.'))
    } finally {
      setBusy(false)
    }
  }

  return { offer, error, busy, accept, decline, refetch }
}
