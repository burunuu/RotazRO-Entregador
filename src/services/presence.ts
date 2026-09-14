import { supabase } from '../lib/supabase'

export type PresenceStatus = 'online' | 'offline'

/**
 * Atualiza disponibilidade + localização do entregador (driver_presence),
 * usada pelo despacho regional. Nunca lança para o chamador em caso de
 * falha — é um sinal complementar ao GPS legado (update_my_driver_location)
 * e não pode, sob nenhuma circunstância, interromper o fluxo de GPS
 * existente. Erros são apenas logados.
 */
export async function updateMyPresence(
  status: PresenceStatus,
  coords: {
    latitude: number | null
    longitude: number | null
    accuracy?: number | null
    speed?: number | null
    heading?: number | null
  },
): Promise<void> {
  try {
    const { error } = await supabase.rpc('update_my_presence', {
      _status: status,
      _latitude: coords.latitude,
      _longitude: coords.longitude,
      _accuracy_m: coords.accuracy ?? null,
      _speed_mps: coords.speed ?? null,
      _heading_deg: coords.heading ?? null,
    })
    if (error) throw error
  } catch (error) {
    console.error('ERRO_UPDATE_PRESENCE:', error)
  }
}
