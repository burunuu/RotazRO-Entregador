import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchMyRestaurants, type MyRestaurantLink } from '../services/driver-identity'
import { captureError } from '../lib/observability/capture'

type MyRestaurantsScreenProps = {
  driverProfileId: string
}

export function MyRestaurantsScreen({ driverProfileId }: MyRestaurantsScreenProps) {
  const [restaurants, setRestaurants] = useState<MyRestaurantLink[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      setError(null)
      setRestaurants(await fetchMyRestaurants())
    } catch (err) {
      captureError(err, { event: 'driver.fetch_my_restaurants_failed' })
      setError(err instanceof Error ? err.message : 'Não foi possível carregar seus restaurantes.')
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Atualiza ao vivo quando um restaurante vincula/desvincula este
  // entregador (convite aceito, admin vinculando manualmente, etc.) — sem
  // exigir reabrir a tela. Mesmo padrão de "Realtime + refetch" já usado
  // em useAssignedRoute/useCurrentRoute.
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  })

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const channel = supabase
      .channel(`my-restaurants-${driverProfileId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'restaurant_driver_links',
          filter: `driver_profile_id=eq.${driverProfileId}`,
        },
        () => {
          if (debounceTimer) clearTimeout(debounceTimer)
          debounceTimer = setTimeout(() => void loadRef.current(), 300)
        },
      )
      .subscribe()

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      void supabase.removeChannel(channel)
    }
  }, [driverProfileId])

  const activeRestaurants = (restaurants ?? []).filter((r) => r.status === 'active')

  return (
    <div className="my-restaurants-screen">
      <section className="page-title">
        <p className="eyebrow">SEUS VÍNCULOS</p>
        <h1>Meus restaurantes</h1>
        <p>Restaurantes que já vincularam você como entregador.</p>
      </section>

      {error && <div className="error">{error}</div>}

      {restaurants === null && !error ? (
        <p className="description">Carregando...</p>
      ) : activeRestaurants.length === 0 ? (
        <section className="card">
          <p className="description">
            Você ainda não está vinculado a nenhum restaurante. Peça para o restaurante te
            adicionar pelo seu e-mail de cadastro — o vínculo aparece aqui automaticamente, sem
            precisar reabrir o aplicativo.
          </p>
        </section>
      ) : (
        <ul className="restaurant-list">
          {activeRestaurants.map((r) => (
            <li key={r.organization_id} className="card restaurant-list-item">
              <strong>{r.organization_name}</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
