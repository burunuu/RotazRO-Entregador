import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchMyRestaurants, respondToDriverInvite, type MyRestaurantLink } from '../services/driver-identity'
import { captureError } from '../lib/observability/capture'

type MyRestaurantsScreenProps = {
  driverProfileId: string
}

export function MyRestaurantsScreen({ driverProfileId }: MyRestaurantsScreenProps) {
  const [restaurants, setRestaurants] = useState<MyRestaurantLink[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // organization_id em resposta no momento — trava os dois botões desse
  // card específico (não a tela inteira) contra duplo toque.
  const [respondingTo, setRespondingTo] = useState<string | null>(null)
  const [respondError, setRespondError] = useState<string | null>(null)

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

  async function respond(organizationId: string, accept: boolean) {
    if (respondingTo) return

    try {
      setRespondingTo(organizationId)
      setRespondError(null)
      await respondToDriverInvite(organizationId, accept)
      // O Realtime acima também refaz o load, mas refazer aqui evita a
      // pessoa ver o card de convite parado por até 300ms depois de tocar.
      await load()
    } catch (err) {
      captureError(err, { event: 'driver.respond_to_invite_failed' })
      setRespondError(
        err instanceof Error ? err.message : 'Não foi possível responder ao convite.',
      )
    } finally {
      setRespondingTo(null)
    }
  }

  const pendingInvites = (restaurants ?? []).filter((r) => r.status === 'pending')
  const activeRestaurants = (restaurants ?? []).filter((r) => r.status === 'active')
  const loaded = restaurants !== null
  const nothingAtAll = loaded && pendingInvites.length === 0 && activeRestaurants.length === 0

  return (
    <div className="my-restaurants-screen">
      <section className="page-title">
        <p className="eyebrow">SEUS VÍNCULOS</p>
        <h1>Meus restaurantes</h1>
        <p>Restaurantes vinculados a você e convites aguardando sua decisão.</p>
      </section>

      {error && <div className="error">{error}</div>}
      {respondError && <div className="error">{respondError}</div>}

      {!loaded && !error ? (
        <p className="description">Carregando...</p>
      ) : (
        <>
          {pendingInvites.length > 0 && (
            <section className="restaurant-section">
              <h2 className="restaurant-section-title">Convites pendentes</h2>
              <ul className="restaurant-list">
                {pendingInvites.map((r) => (
                  <li key={r.organization_id} className="card restaurant-invite-item">
                    <strong>{r.organization_name}</strong>
                    <p className="description">Quer vincular você como entregador.</p>
                    <div className="restaurant-invite-actions">
                      <button
                        type="button"
                        disabled={respondingTo === r.organization_id}
                        onClick={() => void respond(r.organization_id, true)}
                      >
                        {respondingTo === r.organization_id ? 'Aceitando...' : 'Aceitar'}
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={respondingTo === r.organization_id}
                        onClick={() => void respond(r.organization_id, false)}
                      >
                        Recusar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {activeRestaurants.length > 0 && (
            <section className="restaurant-section">
              <h2 className="restaurant-section-title">Meus restaurantes</h2>
              <ul className="restaurant-list">
                {activeRestaurants.map((r) => (
                  <li key={r.organization_id} className="card restaurant-list-item">
                    <strong>{r.organization_name}</strong>
                    <span className="restaurant-linked-tag">Vinculado</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {nothingAtAll && (
            <section className="card empty-state">
              <p className="empty-state-title">
                <strong>Nenhum restaurante vinculado ainda.</strong>
              </p>
              <p className="description">
                Você pode trabalhar como entregador independente enquanto isso — sua conta
                continua funcionando normalmente. Quando um restaurante te adicionar pelo seu
                e-mail de cadastro, o convite aparece aqui para você aceitar ou recusar.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  )
}
