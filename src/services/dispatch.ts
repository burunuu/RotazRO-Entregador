import { supabase } from '../lib/supabase'

export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled'

export type PendingOffer = {
  id: string
  routeId: string
  status: OfferStatus
  distanceToPickupM: number | null
  etaToPickupS: number | null
  expiresAt: string
  offeredAt: string
  /** Preenchidos por uma segunda consulta (rota + base) — ver fetchPendingOffer. */
  organizationName: string | null
  pickupAddress: string | null
  stopsCount: number | null
  routeDistanceM: number | null
  routeDurationS: number | null
}

/**
 * Busca a oferta pendente do entregador autenticado, já enriquecida com os
 * dados MÍNIMOS necessários para decidir (nunca dados de clientes — isso só
 * é liberado depois do aceite, via fetchMyActiveRoute). RLS garante que só a
 * oferta do próprio entregador é visível.
 */
export async function fetchPendingOffer(): Promise<PendingOffer | null> {
  const { data: offer, error } = await supabase
    .from('delivery_offers')
    .select('id, route_id, status, distance_to_pickup_m, eta_to_pickup_s, expires_at, offered_at')
    .eq('status', 'pending')
    .order('offered_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!offer) return null

  // Expirou localmente mas o banco ainda não marcou — trata como "sem oferta"
  // no cliente; o próximo dispatch do restaurante vai formalizar a expiração.
  if (new Date(offer.expires_at).getTime() <= Date.now()) return null

  const { data: route } = await supabase
    .from('routes')
    .select(
      'total_distance_m, estimated_duration_s, organizations:organization_id (name), bases:base_id (address), route_stops (id)',
    )
    .eq('id', offer.route_id)
    .maybeSingle()

  const routeData = route as unknown as {
    total_distance_m: number | null
    estimated_duration_s: number | null
    organizations: { name: string } | null
    bases: { address: string } | null
    route_stops: { id: string }[] | null
  } | null

  return {
    id: offer.id,
    routeId: offer.route_id,
    status: offer.status as OfferStatus,
    distanceToPickupM: offer.distance_to_pickup_m,
    etaToPickupS: offer.eta_to_pickup_s,
    expiresAt: offer.expires_at,
    offeredAt: offer.offered_at,
    organizationName: routeData?.organizations?.name ?? null,
    pickupAddress: routeData?.bases?.address ?? null,
    stopsCount: routeData?.route_stops?.length ?? null,
    routeDistanceM: routeData?.total_distance_m ?? null,
    routeDurationS: routeData?.estimated_duration_s ?? null,
  }
}

export async function acceptOffer(offerId: string): Promise<{ routeId: string }> {
  const { data, error } = await supabase.rpc('accept_delivery_offer', { _offer_id: offerId })
  if (error) throw error
  const row = (data as { accepted_route_id: string; accepted_drivers_id: string }[] | null)?.[0]
  if (!row) throw new Error('Falha ao aceitar a entrega.')
  return { routeId: row.accepted_route_id }
}

export async function declineOffer(offerId: string): Promise<void> {
  const { error } = await supabase.rpc('decline_delivery_offer', { _offer_id: offerId })
  if (error) throw error
}
