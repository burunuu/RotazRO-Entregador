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

/**
 * Chamada uma única vez, logo após supabase.auth.signUp() (a sessão já
 * está ativa nesse ponto). Converge para o mesmo driver_profiles de
 * ensureDriverProfile() — grava nome/CPF/telefone e resolve qualquer
 * convite pendente (restaurant_driver_invites) para o e-mail da conta.
 */
export async function completeDriverSignup(
  fullName: string,
  cpf: string,
  phone: string,
): Promise<DriverProfile> {
  const { data, error } = await supabase.rpc('complete_driver_signup', {
    _full_name: fullName,
    _cpf: cpf,
    _phone: phone,
  })
  if (error) throw error
  if (!data) throw new Error('Falha ao concluir o cadastro.')
  return data as DriverProfile
}

export type MyRestaurantLink = {
  organization_id: string
  organization_name: string
  status: 'active' | 'inactive'
  linked_at: string
}

export async function fetchMyRestaurants(): Promise<MyRestaurantLink[]> {
  const { data, error } = await supabase.rpc('my_driver_restaurants')
  if (error) throw error
  return (data as MyRestaurantLink[] | null) ?? []
}
