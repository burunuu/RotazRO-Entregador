import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Geolocation } from '@capacitor/geolocation'
import { supabase } from './lib/supabase'
import './App.css'

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

function App() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [authenticated, setAuthenticated] = useState(false)
  const [loadingSession, setLoadingSession] = useState(true)
  const [loginLoading, setLoginLoading] = useState(false)

  const [driver, setDriver] = useState<Driver | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)

  const [location, setLocation] = useState<LocationData | null>(null)
  const [tracking, setTracking] = useState(false)
  const [gpsStatus, setGpsStatus] = useState('GPS parado')
  const [gpsError, setGpsError] = useState<string | null>(null)

  const watchId = useRef<string | null>(null)

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
          setAuthenticated(true)
          await loadDriver()
        }
      } catch (error) {
        if (!mounted) return

        const message =
          error instanceof Error
            ? error.message
            : 'Não foi possível restaurar a sessão.'

        setAuthError(message)
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
    : String(error)

console.error('ERRO_LOGIN:', error)

      setAuthError(message)
      setAuthenticated(false)
      setDriver(null)
    } finally {
      setLoginLoading(false)
    }
  }

  function savePosition(position: {
    coords: {
      latitude: number
      longitude: number
      accuracy: number
      speed: number | null
      heading: number | null
    }
    timestamp: number
  }) {
    setLocation({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      speed: position.coords.speed,
      heading: position.coords.heading,
      timestamp: position.timestamp,
    })
  }

  async function startGps() {
    try {
      setGpsError(null)
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
        error instanceof Error
          ? error.message
          : 'Não foi possível iniciar o GPS.'

      setGpsError(message)
      setGpsStatus('Erro no GPS')
      setTracking(false)
    }
  }

  async function stopGps() {
    if (watchId.current) {
      await Geolocation.clearWatch({
        id: watchId.current,
      })

      watchId.current = null
    }

    setTracking(false)
    setGpsStatus('GPS parado')
  }

  async function handleLogout() {
    await stopGps()
    await supabase.auth.signOut()

    setAuthenticated(false)
    setDriver(null)
    setLocation(null)
    setEmail('')
    setPassword('')
    setAuthError(null)
  }

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

  if (!authenticated || !driver) {
    return (
      <main className="app">
        <section className="card login-card">
          <p className="eyebrow">ROTAZRO ENTREGADOR</p>

          <h1>Entrar</h1>

          <p className="description">
            Acesse sua conta de entregador.
          </p>

          {authError && <div className="error">{authError}</div>}

          <form onSubmit={handleLogin}>
            <label>
              E-mail

              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
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

            <button type="submit" disabled={loginLoading}>
              {loginLoading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="app">
      <section className="card">
        <div className="driver-header">
          <div>
            <p className="eyebrow">ROTAZRO ENTREGADOR</p>

            <h1>{driver.name}</h1>

            <p className="description">Entregador conectado</p>
          </div>

          <button className="logout" onClick={handleLogout}>
            Sair
          </button>
        </div>

        <div className={`status ${tracking ? 'active' : ''}`}>
          <span />
          {gpsStatus}
        </div>

        {gpsError && <div className="error">{gpsError}</div>}

        <div className="location-grid">
          <div>
            <small>Latitude</small>
            <strong>{location?.latitude.toFixed(6) ?? '—'}</strong>
          </div>

          <div>
            <small>Longitude</small>
            <strong>{location?.longitude.toFixed(6) ?? '—'}</strong>
          </div>

          <div>
            <small>Precisão</small>
            <strong>
              {location ? `${location.accuracy.toFixed(1)} m` : '—'}
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
          Última atualização:{' '}
          {location
            ? new Date(location.timestamp).toLocaleTimeString('pt-BR')
            : '—'}
        </div>

        {!tracking ? (
          <button onClick={startGps}>Iniciar GPS</button>
        ) : (
          <button className="secondary" onClick={stopGps}>
            Parar GPS
          </button>
        )}
      </section>
    </main>
  )
}

export default App