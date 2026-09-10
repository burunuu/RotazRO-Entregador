import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'
import { supabase } from './lib/supabase'
import './App.css'

const LOCATION_SYNC_INTERVAL_MS = 8000

type Driver = {
  id: string
  name: string
  is_active: boolean
  organization_id: string
}

type LocationData = {
  latitude: number
  longitude: number
  accuracy: number
  speed: number | null
  heading: number | null
  timestamp: number
}

type NativePosition = {
  coords: {
    latitude: number
    longitude: number
    accuracy: number
    speed: number | null
    heading: number | null
  }
  timestamp: number
}

function formatTime(timestamp: number | null) {
  if (!timestamp) return '—'

  return new Date(timestamp).toLocaleTimeString('pt-BR')
}

function App() {
  // =========================================================
  // AUTH
  // =========================================================

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [authenticated, setAuthenticated] = useState(false)
  const [loadingSession, setLoadingSession] = useState(true)
  const [loginLoading, setLoginLoading] = useState(false)

  const [driver, setDriver] = useState<Driver | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)

  // =========================================================
  // GPS
  // =========================================================

  const [location, setLocation] = useState<LocationData | null>(null)

  const [tracking, setTracking] = useState(false)
  const [gpsBusy, setGpsBusy] = useState(false)

  const [gpsStatus, setGpsStatus] = useState('GPS parado')
  const [gpsError, setGpsError] = useState<string | null>(null)

  const watchId = useRef<string | null>(null)

  // =========================================================
  // SINCRONIZAÇÃO COM SUPABASE
  // =========================================================

  const [syncStatus, setSyncStatus] = useState('Aguardando GPS')
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  const lastLocationAttemptAt = useRef(0)
  const locationSyncInFlight = useRef(false)

  // =========================================================
  // CARREGAR ENTREGADOR
  // =========================================================

  async function loadDriver() {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError) {
      throw userError
    }

    if (!user) {
      throw new Error('Usuário não autenticado.')
    }

    const { data: account, error: accountError } = await supabase
      .from('driver_accounts')
      .select('driver_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (accountError) {
      throw accountError
    }

    if (!account) {
      throw new Error('Esta conta não está vinculada a um entregador.')
    }

    const { data: driverData, error: driverError } = await supabase
      .from('drivers')
      .select('id, name, is_active, organization_id')
      .eq('id', account.driver_id)
      .maybeSingle()

    if (driverError) {
      throw driverError
    }

    if (!driverData) {
      throw new Error('Entregador não encontrado.')
    }

    if (!driverData.is_active) {
      throw new Error('Este entregador está inativo.')
    }

    setDriver(driverData)
  }

  // =========================================================
  // RESTAURAR SESSÃO
  // =========================================================

  useEffect(() => {
    let mounted = true

    async function restoreSession() {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession()

        if (!mounted) return

        if (error) {
          throw error
        }

        if (session) {
          await loadDriver()

          if (mounted) {
            setAuthenticated(true)
          }
        }
      } catch (error) {
        if (!mounted) return

        const message =
          error && typeof error === 'object' && 'message' in error
            ? String(error.message)
            : 'Não foi possível restaurar a sessão.'

        setAuthError(message)
        setAuthenticated(false)
        setDriver(null)
      } finally {
        if (mounted) {
          setLoadingSession(false)
        }
      }
    }

    void restoreSession()

    return () => {
      mounted = false

      if (watchId.current) {
        void Geolocation.clearWatch({
          id: watchId.current,
        })
      }
    }
  }, [])

  // =========================================================
  // LOGIN
  // =========================================================

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      setLoginLoading(true)
      setAuthError(null)

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) {
        throw error
      }

      await loadDriver()

      setAuthenticated(true)
      setPassword('')
    } catch (error) {
      await supabase.auth.signOut()

      const message =
        error && typeof error === 'object' && 'message' in error
          ? String(error.message)
          : 'Não foi possível entrar.'

      console.error('ERRO_LOGIN:', error)

      setAuthError(message)
      setAuthenticated(false)
      setDriver(null)
    } finally {
      setLoginLoading(false)
    }
  }

  // =========================================================
  // ENVIAR GPS PARA O SUPABASE
  // =========================================================

  async function sendLocationToSupabase(position: NativePosition) {
    const now = Date.now()

    // Impede excesso de escrita no Supabase.
    if (
      now - lastLocationAttemptAt.current < LOCATION_SYNC_INTERVAL_MS ||
      locationSyncInFlight.current
    ) {
      return
    }

    // Marcamos a tentativa antes da chamada.
    // Assim um erro de rede também não gera dezenas de tentativas por segundo.
    lastLocationAttemptAt.current = now
    locationSyncInFlight.current = true

    try {
      setSyncError(null)
      setSyncStatus('Enviando localização...')

      const latitude = position.coords.latitude
      const longitude = position.coords.longitude

      if (
        !Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90
      ) {
        throw new Error('Latitude inválida recebida pelo GPS.')
      }

      if (
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180
      ) {
        throw new Error('Longitude inválida recebida pelo GPS.')
      }

      const accuracy =
        Number.isFinite(position.coords.accuracy) &&
        position.coords.accuracy >= 0
          ? position.coords.accuracy
          : null

      const speed =
        position.coords.speed != null &&
        Number.isFinite(position.coords.speed) &&
        position.coords.speed >= 0
          ? position.coords.speed
          : null

      const heading =
        position.coords.heading != null &&
        Number.isFinite(position.coords.heading) &&
        position.coords.heading >= 0 &&
        position.coords.heading < 360
          ? position.coords.heading
          : null

      const { data, error } = await supabase.rpc(
        'update_my_driver_location',
        {
          _latitude: latitude,
          _longitude: longitude,
          _accuracy_m: accuracy,
          _speed_mps: speed,
          _heading_deg: heading,
        },
      )

      if (error) {
        throw error
      }

      const syncedTimestamp = data
        ? new Date(data).getTime()
        : Date.now()

      setLastSyncedAt(
        Number.isFinite(syncedTimestamp)
          ? syncedTimestamp
          : Date.now(),
      )

      setSyncStatus('Localização sincronizada')
    } catch (error) {
      const message =
        error && typeof error === 'object' && 'message' in error
          ? String(error.message)
          : 'Falha ao enviar localização.'

      console.error('ERRO_SYNC_GPS:', error)

      setSyncError(message)
      setSyncStatus('Falha na sincronização')
    } finally {
      locationSyncInFlight.current = false
    }
  }

  // =========================================================
  // RECEBER NOVA POSIÇÃO
  // =========================================================

  function savePosition(position: NativePosition) {
    setLocation({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      speed: position.coords.speed,
      heading: position.coords.heading,
      timestamp: position.timestamp,
    })

    void sendLocationToSupabase(position)
  }

  // =========================================================
  // INICIAR GPS
  // =========================================================

  async function startGps() {
    if (gpsBusy || tracking) return

    try {
      setGpsBusy(true)
      setGpsError(null)
      setSyncError(null)

      // No momento estamos usando o plugin nativo.
      // Evita aquela mensagem "Not implemented on web" no localhost.
      if (!Capacitor.isNativePlatform()) {
        throw new Error(
          'O teste de GPS deve ser feito no app Android/BlueStacks.',
        )
      }

      setGpsStatus('Solicitando permissão...')

      const permissions = await Geolocation.checkPermissions()

      if (permissions.location !== 'granted') {
        const requested = await Geolocation.requestPermissions({
          permissions: ['location'],
        })

        if (requested.location !== 'granted') {
          throw new Error('Permissão de localização não concedida.')
        }
      }

      setGpsStatus('Obtendo localização...')

      const currentPosition = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      })

      savePosition(currentPosition)

      // Proteção caso exista um watch antigo por algum motivo.
      if (watchId.current) {
        await Geolocation.clearWatch({
          id: watchId.current,
        })

        watchId.current = null
      }

      watchId.current = await Geolocation.watchPosition(
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        },
        (position, error) => {
          if (error) {
            setGpsError(error.message)
            return
          }

          if (position) {
            savePosition(position)
            setGpsStatus('GPS ativo')
          }
        },
      )

      setTracking(true)
      setGpsStatus('GPS ativo')
    } catch (error) {
      const message =
        error && typeof error === 'object' && 'message' in error
          ? String(error.message)
          : 'Não foi possível iniciar o GPS.'

      console.error('ERRO_GPS:', error)

      setGpsError(message)
      setGpsStatus('Erro no GPS')
      setTracking(false)
    } finally {
      setGpsBusy(false)
    }
  }

  // =========================================================
  // PARAR GPS
  // =========================================================

  async function stopGps() {
    if (gpsBusy) return

    try {
      setGpsBusy(true)

      if (watchId.current) {
        await Geolocation.clearWatch({
          id: watchId.current,
        })

        watchId.current = null
      }

      setTracking(false)
      setGpsStatus('GPS parado')
      setSyncStatus('Sincronização pausada')
    } catch (error) {
      console.error('ERRO_PARAR_GPS:', error)

      setGpsError('Não foi possível parar o GPS corretamente.')
    } finally {
      setGpsBusy(false)
    }
  }

  // =========================================================
  // LOGOUT
  // =========================================================

  async function handleLogout() {
    await stopGps()
    await supabase.auth.signOut()

    setAuthenticated(false)
    setDriver(null)
    setLocation(null)

    setEmail('')
    setPassword('')

    setAuthError(null)
    setGpsError(null)
    setSyncError(null)

    setGpsStatus('GPS parado')
    setSyncStatus('Aguardando GPS')

    setLastSyncedAt(null)

    lastLocationAttemptAt.current = 0
  }

  // =========================================================
  // LOADING
  // =========================================================

  if (loadingSession) {
    return (
      <main className="app">
        <section className="card">
          <p className="eyebrow">ROTAZRO ENTREGADOR</p>
          <h1>Carregando...</h1>
        </section>
      </main>
    )
  }

  // =========================================================
  // LOGIN
  // =========================================================

  if (!authenticated || !driver) {
    return (
      <main className="app">
        <section className="card login-card">
          <p className="eyebrow">ROTAZRO ENTREGADOR</p>

          <h1>Entrar</h1>

          <p className="description">
            Acesse sua conta de entregador.
          </p>

          {authError && (
            <div className="error">
              {authError}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <label>
              E-mail

              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                inputMode="email"
                required
              />
            </label>

            <label>
              Senha

              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>

            <button
              type="submit"
              disabled={loginLoading}
            >
              {loginLoading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </section>
      </main>
    )
  }

  // =========================================================
  // APP DO ENTREGADOR
  // =========================================================

  return (
    <main className="app">
      <section className="card">
        <div className="driver-header">
          <div>
            <p className="eyebrow">
              ROTAZRO ENTREGADOR
            </p>

            <h1>{driver.name}</h1>

            <p className="description">
              Entregador conectado
            </p>
          </div>

          <button
            className="logout"
            onClick={handleLogout}
            disabled={gpsBusy}
          >
            Sair
          </button>
        </div>

        <div className={`status ${tracking ? 'active' : ''}`}>
          <span />
          {gpsStatus}
        </div>

        {gpsError && (
          <div className="error">
            {gpsError}
          </div>
        )}

        <div className="location-grid">
          <div>
            <small>Latitude</small>

            <strong>
              {location?.latitude.toFixed(6) ?? '—'}
            </strong>
          </div>

          <div>
            <small>Longitude</small>

            <strong>
              {location?.longitude.toFixed(6) ?? '—'}
            </strong>
          </div>

          <div>
            <small>Precisão</small>

            <strong>
              {location
                ? `${location.accuracy.toFixed(1)} m`
                : '—'}
            </strong>
          </div>

          <div>
            <small>Velocidade</small>

            <strong>
              {location?.speed != null
                ? `${(location.speed * 3.6).toFixed(1)} km/h`
                : '—'}
            </strong>
          </div>
        </div>

        <div className="updated">
          Última leitura do GPS:{' '}
          {formatTime(location?.timestamp ?? null)}
        </div>

        <div className="sync-info">
          <strong>
            {syncStatus}
          </strong>

          <span>
            Último envio ao RotazRO:{' '}
            {formatTime(lastSyncedAt)}
          </span>

          {syncError && (
            <span className="sync-error">
              {syncError}
            </span>
          )}
        </div>

        {!tracking ? (
          <button
            onClick={startGps}
            disabled={gpsBusy}
          >
            {gpsBusy ? 'Iniciando...' : 'Iniciar GPS'}
          </button>
        ) : (
          <button
            className="secondary"
            onClick={stopGps}
            disabled={gpsBusy}
          >
            {gpsBusy ? 'Parando...' : 'Parar GPS'}
          </button>
        )}
      </section>
    </main>
  )
}

export default App