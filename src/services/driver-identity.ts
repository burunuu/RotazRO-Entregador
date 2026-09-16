import { supabase } from '../lib/supabase'

/**
 * Identidade global do entregador (driver_profiles), independente de
 * organização — usada pelo despacho regional. Complementa, sem substituir,
 * o vínculo legado `driver_accounts -> drivers` (entregador de loja).
 */
export type DriverProfile = {
  id: string
  user_id: string
  full_name: string | null
  phone: string | null
  vehicle_type: string | null
  vehicle_plate: string | null
  is_active: boolean
}

/**
 * Garante que o usuário autenticado tenha um driver_profiles (cria se
 * ainda não existir). Chamar sempre no login/restauração de sessão —
 * idempotente, seguro para chamar repetidamente.
 */
export async function ensureDriverProfile(): Promise<DriverProfile> {
  const { data, error } = await supabase.rpc('ensure_driver_profile')
  if (error) throw error
  if (!data) throw new Error('Falha ao preparar o perfil de entregador.')
  return data as DriverProfile
}
