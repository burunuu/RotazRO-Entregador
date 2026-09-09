import { useEffect, useRef, useState } from 'react'
import { Geolocation } from '@capacitor/geolocation'
import './App.css'

type LocationData = {
  latitude: number
  longitude: number
  accuracy: number
  speed: number | null
  heading: number | null
  timestamp: number
}

function App() {
  const [location, setLocation] = useState<LocationData | null>(null)
  const [tracking, setTracking] = useState(false)
  const [status, setStatus] = useState('GPS parado')
  const [error, setError] = useState<string | null>(null)

  const watchId = useRef<string | null>(null)

  const savePosition = (position: {
    coords: {
      latitude: number
      longitude: number
      accuracy: number
      speed: number | null
      heading: number | null
    }
    timestamp: number
  }) => {
    setLocation({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      speed: position.coords.speed,
      heading: position.coords.heading,
      timestamp: position.timestamp,
    })
  }

  const startGps = async () => {
    try {
      setError(null)
      setStatus('Solicitando permissão...')

      const permissions = await Geolocation.checkPermissions()

      if (permissions.location !== 'granted') {
        const requested = await Geolocation.requestPermissions({
          permissions: ['location'],
        })

        if (requested.location !== 'granted') {
          throw new Error('Permissão de localização não concedida.')
        }
      }

      setStatus('Obtendo localização...')

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
        (position, watchError) => {
          if (watchError) {
            setError(watchError.message)
            return
          }

          if (position) {
            savePosition(position)
            setStatus('GPS ativo')
          }
        },
      )

      setTracking(true)
      setStatus('GPS ativo')
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Não foi possível iniciar o GPS.'

      setError(message)
      setStatus('Erro no GPS')
      setTracking(false)
    }
  }

  const stopGps = async () => {
    if (watchId.current) {
      await Geolocation.clearWatch({
        id: watchId.current,
      })

      watchId.current = null
    }

    setTracking(false)
    setStatus('GPS parado')
  }

  useEffect(() => {
    return () => {
      if (watchId.current) {
        void Geolocation.clearWatch({
          id: watchId.current,
        })
      }
    }
  }, [])

  return (
    <main className="app">
      <section className="card">
        <p className="eyebrow">ROTAZRO ENTREGADOR</p>

        <h1>Teste de localização</h1>

        <div className={`status ${tracking ? 'active' : ''}`}>
          <span />
          {status}
        </div>

        {error && <div className="error">{error}</div>}

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