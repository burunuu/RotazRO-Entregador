import { supabase } from '../lib/supabase'

export type MyRouteStop = {
  id: string
  position: number | null
  status: 'pending' | 'arrived' | 'delivered' | 'failed' | 'skipped'
  deliveredAt: string | null
  executionNote: string | null
  occurrenceType: string | null
  occurrenceAt: string | null
  customerName: string
  phone: string | null
  address: string
  complement: string | null
  neighborhood: string | null
  orderDescription: string | null
  notes: string | null
  latitude: number | null
  longitude: number | null
  amountDueCents: number | null
  paymentMethod: string | null
  changeForCents: number | null
}

export type MyRoute = {
  id: string
  status: 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | string
  organizationName: string
  baseName: string | null
  baseAddress: string | null
  totalDistanceM: number | null
  estimatedDurationS: number | null
  startedAt: string | null
  completedAt: string | null
  stops: MyRouteStop[]
}

const FINAL_STOP_STATUSES = new Set(['delivered', 'failed', 'skipped'])

/**
 * Rota atual do entregador autenticado (confirmed ou in_progress). RLS
 * (driver_owns_route, ver migration 20260914010000) garante que só a rota
 * atribuída a este entregador é visível — nunca a de outro entregador.
 */
export async function fetchMyActiveRoute(): Promise<MyRoute | null> {
  const { data: route, error } = await supabase
    .from('routes')
    .select(
      'id, status, total_distance_m, estimated_duration_s, started_at, completed_at, organizations:organization_id (name), bases:base_id (name, address)',
    )
    .in('status', ['confirmed', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!route) return null

  const { data: stops, error: stopsError } = await supabase
    .from('route_stops')
    .select(
      'id, position, status, delivered_at, execution_note, occurrence_type, occurrence_at, orders:order_id (customer_name, phone, address, complement, neighborhood, order_description, notes, latitude, longitude, amount_due_cents, payment_method, change_for_cents)',
    )
    .eq('route_id', route.id)
    .order('position', { ascending: true })

  if (stopsError) throw stopsError

  const routeRow = route as unknown as {
    id: string
    status: string
    total_distance_m: number | null
    estimated_duration_s: number | null
    started_at: string | null
    completed_at: string | null
    organizations: { name: string } | null
    bases: { name: string; address: string } | null
  }

  return {
    id: routeRow.id,
    status: routeRow.status,
    organizationName: routeRow.organizations?.name ?? 'Restaurante',
    baseName: routeRow.bases?.name ?? null,
    baseAddress: routeRow.bases?.address ?? null,
    totalDistanceM: routeRow.total_distance_m,
    estimatedDurationS: routeRow.estimated_duration_s,
    startedAt: routeRow.started_at,
    completedAt: routeRow.completed_at,
    stops: (stops ?? []).map((stop) => {
      const s = stop as unknown as {
        id: string
        position: number | null
        status: MyRouteStop['status']
        delivered_at: string | null
        execution_note: string | null
        occurrence_type: string | null
        occurrence_at: string | null
        orders: {
          customer_name: string
          phone: string | null
          address: string
          complement: string | null
          neighborhood: string | null
          order_description: string | null
          notes: string | null
          latitude: number | null
          longitude: number | null
          amount_due_cents: number | null
          payment_method: string | null
          change_for_cents: number | null
        } | null
      }
      return {
        id: s.id,
        position: s.position,
        status: s.status,
        deliveredAt: s.delivered_at,
        executionNote: s.execution_note,
        occurrenceType: s.occurrence_type,
        occurrenceAt: s.occurrence_at,
        customerName: s.orders?.customer_name ?? 'Entrega',
        phone: s.orders?.phone ?? null,
        address: s.orders?.address ?? '',
        complement: s.orders?.complement ?? null,
        neighborhood: s.orders?.neighborhood ?? null,
        orderDescription: s.orders?.order_description ?? null,
        notes: s.orders?.notes ?? null,
        latitude: s.orders?.latitude ?? null,
        longitude: s.orders?.longitude ?? null,
        amountDueCents: s.orders?.amount_due_cents ?? null,
        paymentMethod: s.orders?.payment_method ?? null,
        changeForCents: s.orders?.change_for_cents ?? null,
      }
    }),
  }
}

export function nextPendingStop(route: MyRoute): MyRouteStop | null {
  return route.stops.find((s) => s.status === 'pending') ?? null
}

export function deliveredCount(route: MyRoute): number {
  return route.stops.filter((s) => FINAL_STOP_STATUSES.has(s.status)).length
}

export async function startMyRoute(routeId: string): Promise<void> {
  const { error } = await supabase.rpc('start_route_tx_as_driver', { _route_id: routeId })
  if (error) throw error
}

export async function deliverMyStop(stopId: string): Promise<void> {
  const { error } = await supabase.rpc('deliver_my_stop', { _stop_id: stopId })
  if (error) throw error
}

export async function reportMyStopOccurrence(
  stopId: string,
  occurrenceType: string,
  note: string,
): Promise<void> {
  const { error } = await supabase.rpc('report_my_stop_occurrence', {
    _stop_id: stopId,
    _occurrence_type: occurrenceType,
    _note: note || null,
  })
  if (error) throw error
}

export async function setMyStopNote(stopId: string, note: string): Promise<void> {
  const { error } = await supabase.rpc('set_my_stop_note', { _stop_id: stopId, _note: note })
  if (error) throw error
}

export async function completeMyRoute(routeId: string): Promise<void> {
  const { error } = await supabase.rpc('complete_my_route', { _route_id: routeId })
  if (error) throw error
}
