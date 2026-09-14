import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'
import { BackgroundGeolocation } from '@capgo/background-geolocation'
import { supabase } from './lib/supabase'
import { ensureDriverProfile } from './services/driver-identity'
import { updateMyPresence } from './services/presence'
import { registerForPush, onNotificationOpened } from './services/notifications'
import { useDeliveryOffers } from './hooks/useDeliveryOffers'
import { DeliveryOfferModal } from './components/DeliveryOfferModal'
import { MyRouteScreen } from './screens/MyRouteScreen'
import './App.css'

const LOCATION_SYNC_INTERVAL_MS = 8000
const WEATHER_REFRESH_INTERVAL_MS = 15 * 60 * 1000

/*
 * Mantemos temporariamente as mesmas opções existentes
 * no painel web.
 *
 * Futuramente a lista deverá vir de uma fonte única no banco,
 * para web e APK consumirem exatamente a mesma configuração.
 */
const VEHICLE_TYPES = [
  { value: 'moto', label: 'Moto' },
  { value: 'carro', label: 'Carro' },
  { value: 'van', label: 'Van' },
]

type AppView = 'home' | 'profile' | 'history' | 'route'

type Driver = {
  id: string
  name: string
  phone: string | null
  vehicle_type: string | null
  vehicle_plate: string | null
  is_active: boolean
  /**
   * `null` para um entregador puramente regional (só possui driver_profiles,
   * sem vínculo em driver_accounts/drivers de nenhum restaurante ainda) —
   * ver o fallback em loadDriver().
   */
  organization_id: string | null
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

type BackgroundPosition = {
  latitude: number
  longitude: number
  accuracy: number
  speed: number | null
  bearing: number | null
  time: number | null
}

type RouteRow = {
  id: string
  organization_id: string
  status: string
  total_distance_m: number | null
  actual_distance_m: number | null
  estimated_duration_s: number | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

type RouteHistoryItem = RouteRow & {
  organization_name: string
  deliveries: number
  amount_cents: number | null
}

type HistoryMetrics = {
  routes: number
  deliveries: number
  distanceMeters: number
  durationSeconds: number
  amountCents: number
  restaurants: number
}

const EMPTY_METRICS: HistoryMetrics = {
  routes: 0,
  deliveries: 0,
  distanceMeters: 0,
  durationSeconds: 0,
  amountCents: 0,
  restaurants: 0,
}

// =========================================================
// TELEFONE
// =========================================================

function onlyDigits(value: string) {
  return value.replace(/\D/g, '').slice(0, 11)
}

function formatBrazilPhone(value: string) {
  const digits = onlyDigits(value)

  if (!digits) return ''

  if (digits.length <= 2) {
    return `(${digits}`
  }

  const ddd = digits.slice(0, 2)
  const number = digits.slice(2)

  if (digits.length <= 6) {
    return `(${ddd}) ${number}`
  }

  /*
   * Telefone fixo / formato de 10 dígitos:
   * (69) 3870-8886
   */
  if (digits.length <= 10) {
    const first = number.slice(0, 4)
    const second = number.slice(4)

    return second
      ? `(${ddd}) ${first}-${second}`
      : `(${ddd}) ${first}`
  }

  /*
   * Celular / formato de 11 dígitos:
   * (69) 93870-8886
   */
  const first = number.slice(0, 5)
  const second = number.slice(5)

  return second
    ? `(${ddd}) ${first}-${second}`
    : `(${ddd}) ${first}`
}

// =========================================================
// FORMATADORES
// =========================================================

function formatTime(timestamp: number | null) {
  if (!timestamp) return '—'

  return new Date(timestamp).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatClock(date: Date) {
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatLongDate(date: Date) {
  const formatted = date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  })

  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

function formatDate(value: string | null) {
  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleDateString('pt-BR')
}

function formatDateTime(value: string | null) {
  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDistance(meters: number) {
  if (!Number.isFinite(meters) || meters <= 0) return '0 km'

  return `${(meters / 1000).toFixed(1)} km`
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—'

  const roundedMinutes = Math.round(seconds / 60)

  if (roundedMinutes < 60) {
    return `${roundedMinutes} min`
  }

  const hours = Math.floor(roundedMinutes / 60)
  const minutes = roundedMinutes % 60

  if (minutes === 0) return `${hours}h`

  return `${hours}h ${minutes}min`
}

function formatMoney(cents: number | null) {
  if (cents == null) return '—'

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100)
}

function getRouteDate(route: RouteHistoryItem) {
  return new Date(
    route.completed_at ??
      route.started_at ??
      route.created_at,
  )
}

function getRouteDuration(route: RouteHistoryItem) {
  if (route.started_at && route.completed_at) {
    const start = new Date(route.started_at).getTime()
    const end = new Date(route.completed_at).getTime()

    if (
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      end > start
    ) {
      return Math.round((end - start) / 1000)
    }
  }

  return route.estimated_duration_s ?? 0
}

function getRouteDistance(route: RouteHistoryItem) {
  return route.actual_distance_m ?? route.total_distance_m ?? 0
}

function calculateMetrics(
  routes: RouteHistoryItem[],
): HistoryMetrics {
  if (routes.length === 0) {
    return EMPTY_METRICS
  }

  const restaurants = new Set<string>()

  let deliveries = 0
  let distanceMeters = 0
  let durationSeconds = 0
  let amountCents = 0

  for (const route of routes) {
    deliveries += route.deliveries
    distanceMeters += getRouteDistance(route)
    durationSeconds += getRouteDuration(route)
    amountCents += route.amount_cents ?? 0

    if (route.organization_id) {
      restaurants.add(route.organization_id)
    }
  }

  return {
    routes: routes.length,
    deliveries,
    distanceMeters,
    durationSeconds,
    amountCents,
    restaurants: restaurants.size,
  }
}

function App() {
  // =========================================================
  // AUTH
  // =========================================================

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authEmail, setAuthEmail] = useState('')

  const [authenticated, setAuthenticated] = useState(false)
  const [loadingSession, setLoadingSession] = useState(true)
  const [loginLoading, setLoginLoading] = useState(false)

  const [driver, setDriver] = useState<Driver | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)

  // =========================================================
  // NAVEGAÇÃO
  // =========================================================

  const [view, setView] = useState<AppView>('home')
  const [menuOpen, setMenuOpen] = useState(false)

  // =========================================================
  // DATA / HORA / CLIMA
  // =========================================================

  const [currentDateTime, setCurrentDateTime] = useState(
    new Date(),
  )

  const [temperature, setTemperature] = useState<
    number | null
  >(null)

  const [weatherLoading, setWeatherLoading] =
    useState(false)

  const lastWeatherFetchAt = useRef(0)

  const lastWeatherLocation = useRef<{
    latitude: number
    longitude: number
  } | null>(null)

  // =========================================================
  // PERFIL
  // =========================================================

  const [profileName, setProfileName] = useState('')
  const [profilePhone, setProfilePhone] = useState('')

  const [profileVehicleType, setProfileVehicleType] =
    useState('')

  const [profileVehiclePlate, setProfileVehiclePlate] =
    useState('')

  const [profileSaving, setProfileSaving] = useState(false)

  const [profileMessage, setProfileMessage] =
    useState<string | null>(null)

  const [profileError, setProfileError] =
    useState<string | null>(null)

  // =========================================================
  // HISTÓRICO
  // =========================================================

  const [history, setHistory] = useState<RouteHistoryItem[]>(
    [],
  )

  const [historyLoading, setHistoryLoading] = useState(false)

  const [historyError, setHistoryError] =
    useState<string | null>(null)

  const [expandedRouteId, setExpandedRouteId] =
    useState<string | null>(null)

  // =========================================================
  // GPS
  // =========================================================

  const [location, setLocation] =
    useState<LocationData | null>(null)

  const [tracking, setTracking] = useState(false)
  const [gpsBusy, setGpsBusy] = useState(false)

  const [gpsStatus, setGpsStatus] =
    useState('Fora de expediente')

  const [gpsError, setGpsError] = useState<string | null>(
    null,
  )

  const backgroundTrackingStarted = useRef(false)

  // =========================================================
  // DESPACHO REGIONAL
  // =========================================================
  // Chamado incondicionalmente (regra dos hooks) mesmo antes do login —
  // fica inerte (enabled=false) enquanto não há sessão/tracking.
  const deliveryOffers = useDeliveryOffers(authenticated && tracking)

  useEffect(() => {
    if (!authenticated || !driver) return
    void registerForPush(driver.id)
    return onNotificationOpened(() => {
      // O payload do push só serve de gatilho — o estado real (se a
      // oferta ainda está pendente) é sempre buscado de novo pelo
      // polling do useDeliveryOffers assim que o app volta ao primeiro
      // plano, nunca confiado diretamente.
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, driver?.id])

  // =========================================================
  // SINCRONIZAÇÃO
  // =========================================================

  const [syncStatus, setSyncStatus] =
    useState('Aguardando início do trabalho')

  const [lastSyncedAt, setLastSyncedAt] =
    useState<number | null>(null)

  const [syncError, setSyncError] =
    useState<string | null>(null)

  const lastLocationAttemptAt = useRef(0)
  const locationSyncInFlight = useRef(false)

  // =========================================================
  // RELÓGIO
  // =========================================================

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentDateTime(new Date())
    }, 30000)

    return () => {
      window.clearInterval(timer)
    }
  }, [])

  // =========================================================
  // MÉTRICAS
  // =========================================================

  const metrics = useMemo(() => {
    const now = new Date()

    const startToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    )

    const day = now.getDay()
    const mondayOffset = day === 0 ? -6 : 1 - day

    const startWeek = new Date(startToday)
    startWeek.setDate(startToday.getDate() + mondayOffset)

    const startMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
    )

    const completedRoutes = history.filter(
      (route) =>
        route.completed_at != null ||
        route.status === 'completed',
    )

    return {
      today: calculateMetrics(
        completedRoutes.filter(
          (route) => getRouteDate(route) >= startToday,
        ),
      ),

      week: calculateMetrics(
        completedRoutes.filter(
          (route) => getRouteDate(route) >= startWeek,
        ),
      ),

      month: calculateMetrics(
        completedRoutes.filter(
          (route) => getRouteDate(route) >= startMonth,
        ),
      ),
    }
  }, [history])

  // =========================================================
  // CLIMA
  // =========================================================

  async function fetchTemperature(
    latitude: number,
    longitude: number,
  ) {
    const now = Date.now()

    const previous = lastWeatherLocation.current

    const closeToPrevious =
      previous &&
      Math.abs(previous.latitude - latitude) < 0.01 &&
      Math.abs(previous.longitude - longitude) < 0.01

    if (
      closeToPrevious &&
      now - lastWeatherFetchAt.current <
        WEATHER_REFRESH_INTERVAL_MS
    ) {
      return
    }

    try {
      setWeatherLoading(true)

      const url =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${encodeURIComponent(latitude)}` +
        `&longitude=${encodeURIComponent(longitude)}` +
        `&current=temperature_2m` +
        `&timezone=auto`

      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(
          'Falha ao consultar temperatura.',
        )
      }

      const data = (await response.json()) as {
        current?: {
          temperature_2m?: number
        }
      }

      if (
        typeof data.current?.temperature_2m === 'number' &&
        Number.isFinite(data.current.temperature_2m)
      ) {
        setTemperature(data.current.temperature_2m)

        lastWeatherFetchAt.current = now

        lastWeatherLocation.current = {
          latitude,
          longitude,
        }
      }
    } catch (error) {
      console.warn('ERRO_TEMPERATURA:', error)
    } finally {
      setWeatherLoading(false)
    }
  }

  /*
   * Busca somente uma posição inicial para o clima.
   *
   * IMPORTANTE:
   * - não inicia background GPS;
   * - não muda o status para "Em trabalho";
   * - não envia localização para o Supabase;
   * - serve apenas para descobrir a temperatura local.
   */
  async function loadWeatherOnOpen() {
    if (!Capacitor.isNativePlatform()) {
      return
    }

    try {
      setWeatherLoading(true)

      let permissions =
        await Geolocation.checkPermissions()

      if (permissions.location !== 'granted') {
        permissions =
          await Geolocation.requestPermissions({
            permissions: ['location'],
          })
      }

      if (permissions.location !== 'granted') {
        return
      }

      const position =
        await Geolocation.getCurrentPosition({
          enableHighAccuracy: false,

          /*
           * Para clima não precisamos de precisão máxima.
           *
           * Também permitimos posição recente para aparecer
           * rapidamente assim que abrir o aplicativo.
           */
          timeout: 10000,
          maximumAge: 5 * 60 * 1000,
        })

      await fetchTemperature(
        position.coords.latitude,
        position.coords.longitude,
      )
    } catch (error) {
      console.warn(
        'ERRO_CLIMA_INICIAL:',
        error,
      )
    } finally {
      setWeatherLoading(false)
    }
  }

  /*
   * Assim que a conta autenticada estiver carregada,
   * já buscamos o clima.
   */
  useEffect(() => {
    if (!authenticated) {
      return
    }

    void loadWeatherOnOpen()
  }, [authenticated])

  // =========================================================
  // PERFIL
  // =========================================================

  function populateProfile(driverData: Driver) {
    setProfileName(driverData.name ?? '')

    setProfilePhone(
      formatBrazilPhone(driverData.phone ?? ''),
    )

    setProfileVehicleType(
      driverData.vehicle_type ?? '',
    )

    setProfileVehiclePlate(
      driverData.vehicle_plate ?? '',
    )
  }

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

    setAuthEmail(user.email ?? '')

    const { data: account, error: accountError } =
      await supabase
        .from('driver_accounts')
        .select('driver_id')
        .eq('user_id', user.id)
        .maybeSingle()

    if (accountError) {
      throw accountError
    }

    // Sem vínculo em driver_accounts (nenhum restaurante o cadastrou como
    // "entregador da loja" ainda): trata como entregador puramente
    // regional, cuja identidade vem de driver_profiles em vez de drivers.
    // O fluxo legado abaixo (driver_accounts -> drivers) continua 100%
    // inalterado para quem já tem vínculo.
    if (!account) {
      const profile = await ensureDriverProfile()

      if (!profile.is_active) {
        throw new Error('Este entregador está inativo.')
      }

      const regionalDriver: Driver = {
        id: profile.id,
        name: profile.full_name || 'Entregador',
        phone: profile.phone,
        vehicle_type: profile.vehicle_type,
        vehicle_plate: profile.vehicle_plate,
        is_active: profile.is_active,
        organization_id: null,
      }

      setDriver(regionalDriver)
      populateProfile(regionalDriver)

      return regionalDriver
    }

    const { data: driverData, error: driverError } =
      await supabase
        .from('drivers')
        .select(
          'id, name, phone, vehicle_type, vehicle_plate, is_active, organization_id',
        )
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

    const typedDriver = driverData as Driver

    setDriver(typedDriver)
    populateProfile(typedDriver)

    // Também garante um driver_profiles para entregadores "da loja" —
    // habilita-os a participar do despacho regional futuramente, sem exigir
    // nenhuma ação extra deles agora. Nunca bloqueia o login se falhar.
    ensureDriverProfile().catch((error) =>
      console.error('ERRO_ENSURE_DRIVER_PROFILE:', error),
    )

    return typedDriver
  }

  // =========================================================
  // HISTÓRICO
  // =========================================================

  async function loadHistory(driverId: string) {
    try {
      setHistoryLoading(true)
      setHistoryError(null)

      const { data: routeRows, error: routesError } =
        await supabase
          .from('routes')
          .select(
            'id, organization_id, status, total_distance_m, actual_distance_m, estimated_duration_s, started_at, completed_at, created_at',
          )
          .eq('driver_id', driverId)
          .order('created_at', { ascending: false })
          .limit(100)

      if (routesError) {
        throw routesError
      }

      const routes = (routeRows ?? []) as RouteRow[]

      if (routes.length === 0) {
        setHistory([])
        return
      }

      const routeIds = routes.map(
        (route) => route.id,
      )

      const organizationIds = Array.from(
        new Set(
          routes
            .map((route) => route.organization_id)
            .filter(Boolean),
        ),
      )

      const organizationNames =
        new Map<string, string>()

      if (organizationIds.length > 0) {
        const {
          data: organizations,
          error,
        } = await supabase
          .from('organizations')
          .select('id, name')
          .in('id', organizationIds)

        if (!error && organizations) {
          for (const organization of organizations) {
            organizationNames.set(
              organization.id,
              organization.name,
            )
          }
        }
      }

      const deliveriesByRoute =
        new Map<string, number>()

      const orderIdsByRoute =
        new Map<string, string[]>()

      const {
        data: stops,
        error: stopsError,
      } = await supabase
        .from('route_stops')
        .select('route_id, order_id')
        .in('route_id', routeIds)

      if (!stopsError && stops) {
        for (const stop of stops) {
          deliveriesByRoute.set(
            stop.route_id,
            (deliveriesByRoute.get(stop.route_id) ?? 0) + 1,
          )

          if (stop.order_id) {
            const current =
              orderIdsByRoute.get(stop.route_id) ?? []

            current.push(stop.order_id)

            orderIdsByRoute.set(
              stop.route_id,
              current,
            )
          }
        }
      }

      const allOrderIds = Array.from(
        new Set(
          Array.from(
            orderIdsByRoute.values(),
          ).flat(),
        ),
      )

      const amountByOrder =
        new Map<string, number>()

      if (allOrderIds.length > 0) {
        const {
          data: orders,
          error: ordersError,
        } = await supabase
          .from('orders')
          .select('id, amount_due_cents')
          .in('id', allOrderIds)

        if (!ordersError && orders) {
          for (const order of orders) {
            if (
              typeof order.amount_due_cents ===
                'number' &&
              Number.isFinite(
                order.amount_due_cents,
              )
            ) {
              amountByOrder.set(
                order.id,
                order.amount_due_cents,
              )
            }
          }
        }
      }

      const normalized: RouteHistoryItem[] =
        routes.map((route) => {
          const orderIds =
            orderIdsByRoute.get(route.id) ?? []

          let amountCents = 0
          let hasFinancialData = false

          for (const orderId of orderIds) {
            const amount =
              amountByOrder.get(orderId)

            if (amount != null) {
              amountCents += amount
              hasFinancialData = true
            }
          }

          return {
            ...route,

            organization_name:
              organizationNames.get(
                route.organization_id,
              ) ?? 'Restaurante',

            deliveries:
              deliveriesByRoute.get(
                route.id,
              ) ?? 0,

            amount_cents: hasFinancialData
              ? amountCents
              : null,
          }
        })

      setHistory(normalized)
    } catch (error) {
      console.error(
        'ERRO_HISTORICO:',
        error,
      )

      const message =
        error &&
        typeof error === 'object' &&
        'message' in error
          ? String(error.message)
          : 'Não foi possível carregar o histórico.'

      setHistoryError(message)
    } finally {
      setHistoryLoading(false)
    }
  }

  // =========================================================
  // SESSÃO
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
          const loadedDriver =
            await loadDriver()

          if (mounted) {
            setAuthenticated(true)

            void loadHistory(
              loadedDriver.id,
            )
          }
        }
      } catch (error) {
        if (!mounted) return

        const message =
          error &&
          typeof error === 'object' &&
          'message' in error
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
    }
  }, [])

  // =========================================================
  // LOGIN
  // =========================================================

  async function handleLogin(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    try {
      setLoginLoading(true)
      setAuthError(null)

      const { error } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })

      if (error) {
        throw error
      }

      const loadedDriver =
        await loadDriver()

      setAuthenticated(true)
      setPassword('')

      void loadHistory(
        loadedDriver.id,
      )
    } catch (error) {
      await supabase.auth.signOut()

      const message =
        error &&
        typeof error === 'object' &&
        'message' in error
          ? String(error.message)
          : 'Não foi possível entrar.'

      console.error(
        'ERRO_LOGIN:',
        error,
      )

      setAuthError(message)
      setAuthenticated(false)
      setDriver(null)
    } finally {
      setLoginLoading(false)
    }
  }

  // =========================================================
  // SALVAR PERFIL
  // =========================================================

  async function saveProfile(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (!driver) return

    const normalizedName =
      profileName.trim()

    if (!normalizedName) {
      setProfileError(
        'Informe seu nome completo.',
      )

      return
    }

    try {
      setProfileSaving(true)
      setProfileError(null)
      setProfileMessage(null)

      const payload = {
        name: normalizedName,

        /*
         * Salvamos já formatado para a web
         * receber o mesmo formato.
         */
        phone: profilePhone
          ? formatBrazilPhone(
              profilePhone,
            )
          : null,

        vehicle_type:
          profileVehicleType || null,

        vehicle_plate:
          profileVehiclePlate
            .trim()
            .toUpperCase() || null,
      }

      const { data, error } =
        await supabase
          .from('drivers')
          .update(payload)
          .eq('id', driver.id)
          .select(
            'id, name, phone, vehicle_type, vehicle_plate, is_active, organization_id',
          )
          .maybeSingle()

      if (error) {
        throw error
      }

      if (!data) {
        throw new Error(
          'Seu perfil não pôde ser atualizado. A permissão de edição ainda não está disponível para esta conta.',
        )
      }

      const updatedDriver =
        data as Driver

      setDriver(updatedDriver)

      populateProfile(
        updatedDriver,
      )

      setProfileMessage(
        'Perfil atualizado. As alterações também ficam disponíveis para o restaurante.',
      )
    } catch (error) {
      console.error(
        'ERRO_SALVAR_PERFIL:',
        error,
      )

      const message =
        error &&
        typeof error === 'object' &&
        'message' in error
          ? String(error.message)
          : 'Não foi possível atualizar seu perfil.'

      setProfileError(message)
    } finally {
      setProfileSaving(false)
    }
  }

  // =========================================================
  // GPS → SUPABASE
  // =========================================================

  async function sendLocationToSupabase(
    position: NativePosition,
  ) {
    const now = Date.now()

    if (
      now - lastLocationAttemptAt.current <
        LOCATION_SYNC_INTERVAL_MS ||
      locationSyncInFlight.current
    ) {
      return
    }

    lastLocationAttemptAt.current = now
    locationSyncInFlight.current = true

    try {
      setSyncError(null)

      setSyncStatus(
        'Enviando localização...',
      )

      const latitude =
        position.coords.latitude

      const longitude =
        position.coords.longitude

      if (
        !Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90
      ) {
        throw new Error(
          'Latitude inválida recebida pelo GPS.',
        )
      }

      if (
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180
      ) {
        throw new Error(
          'Longitude inválida recebida pelo GPS.',
        )
      }

      const accuracy =
        Number.isFinite(
          position.coords.accuracy,
        ) &&
        position.coords.accuracy >= 0
          ? position.coords.accuracy
          : null

      const speed =
        position.coords.speed != null &&
        Number.isFinite(
          position.coords.speed,
        ) &&
        position.coords.speed >= 0
          ? position.coords.speed
          : null

      const heading =
        position.coords.heading != null &&
        Number.isFinite(
          position.coords.heading,
        ) &&
        position.coords.heading >= 0 &&
        position.coords.heading < 360
          ? position.coords.heading
          : null

      const { data, error } =
        await supabase.rpc(
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

      // Sinal de disponibilidade para o despacho regional — nunca pode
      // interromper o GPS legado acima, por isso não é aguardado nem
      // lança: updateMyPresence já engole os próprios erros.
      void updateMyPresence('online', {
        latitude,
        longitude,
        accuracy,
        speed,
        heading,
      })

      const syncedTimestamp = data
        ? new Date(data).getTime()
        : Date.now()

      setLastSyncedAt(
        Number.isFinite(
          syncedTimestamp,
        )
          ? syncedTimestamp
          : Date.now(),
      )

      setSyncStatus(
        'Localização sincronizada',
      )
    } catch (error) {
      const message =
        error &&
        typeof error === 'object' &&
        'message' in error
          ? String(error.message)
          : 'Falha ao enviar localização.'

      console.error(
        'ERRO_SYNC_GPS:',
        error,
      )

      setSyncError(message)

      setSyncStatus(
        'Falha na sincronização',
      )
    } finally {
      locationSyncInFlight.current = false
    }
  }

  function savePosition(
    position: NativePosition,
  ) {
    setLocation({
      latitude:
        position.coords.latitude,

      longitude:
        position.coords.longitude,

      accuracy:
        position.coords.accuracy,

      speed:
        position.coords.speed,

      heading:
        position.coords.heading,

      timestamp:
        position.timestamp,
    })

    void fetchTemperature(
      position.coords.latitude,
      position.coords.longitude,
    )

    void sendLocationToSupabase(
      position,
    )
  }

  function saveBackgroundPosition(
    position: BackgroundPosition,
  ) {
    savePosition({
      coords: {
        latitude:
          position.latitude,

        longitude:
          position.longitude,

        accuracy:
          position.accuracy,

        speed:
          position.speed,

        heading:
          position.bearing,
      },

      timestamp:
        position.time ??
        Date.now(),
    })
  }

  // =========================================================
  // INICIAR TRABALHO
  // =========================================================

  async function startGps() {
    if (
      gpsBusy ||
      tracking ||
      backgroundTrackingStarted.current
    ) {
      return
    }

    try {
      setGpsBusy(true)
      setGpsError(null)
      setSyncError(null)

      if (!Capacitor.isNativePlatform()) {
        throw new Error(
          'O teste de localização deve ser feito no app Android.',
        )
      }

      lastLocationAttemptAt.current = 0

      setGpsStatus(
        'Solicitando permissão...',
      )

      const permissions =
        await Geolocation.checkPermissions()

      if (
        permissions.location !==
        'granted'
      ) {
        const requested =
          await Geolocation.requestPermissions({
            permissions: ['location'],
          })

        if (
          requested.location !==
          'granted'
        ) {
          throw new Error(
            'Permissão de localização não concedida.',
          )
        }
      }

      setGpsStatus(
        'Obtendo localização...',
      )

      const currentPosition =
        await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        })

      savePosition(
        currentPosition,
      )

      try {
        await BackgroundGeolocation.stop()
      } catch (error) {
        console.warn(
          'BACKGROUND_GPS_STOP_PREVIOUS:',
          error,
        )
      }

      setGpsStatus(
        'Iniciando trabalho...',
      )

      await BackgroundGeolocation.start(
        {
          backgroundTitle:
            'RotazRO Entregador',

          backgroundMessage:
            'Sua localização está ativa enquanto você realiza entregas.',

          requestPermissions: true,
          stale: false,
          distanceFilter: 0,

          minIntervalMs:
            LOCATION_SYNC_INTERVAL_MS,
        },

        (position, error) => {
          if (error) {
            console.error(
              'ERRO_BACKGROUND_GPS:',
              error,
            )

            setGpsError(
              error.message ||
                'Erro no rastreamento em segundo plano.',
            )

            if (
              error.code ===
              'NOT_AUTHORIZED'
            ) {
              setGpsStatus(
                'Permissão de localização necessária',
              )
            }

            return
          }

          if (!position) return

          saveBackgroundPosition(
            position,
          )

          setGpsStatus(
            'Em trabalho',
          )
        },
      )

      backgroundTrackingStarted.current =
        true

      setTracking(true)

      setGpsStatus(
        'Em trabalho',
      )

      setSyncStatus(
        'Localização ativa',
      )
    } catch (error) {
      const message =
        error &&
        typeof error === 'object' &&
        'message' in error
          ? String(error.message)
          : 'Não foi possível iniciar o trabalho.'

      console.error(
        'ERRO_GPS:',
        error,
      )

      try {
        await BackgroundGeolocation.stop()
      } catch (stopError) {
        console.warn(
          'ERRO_LIMPEZA_BACKGROUND_GPS:',
          stopError,
        )
      }

      backgroundTrackingStarted.current =
        false

      setGpsError(message)

      setGpsStatus(
        'Erro na localização',
      )

      setTracking(false)
    } finally {
      setGpsBusy(false)
    }
  }

  // =========================================================
  // ENCERRAR TRABALHO
  // =========================================================

  async function stopGps(): Promise<boolean> {
    if (gpsBusy) {
      return false
    }

    try {
      setGpsBusy(true)
      setGpsError(null)

      if (
        Capacitor.isNativePlatform()
      ) {
        await BackgroundGeolocation.stop()
      }

      backgroundTrackingStarted.current =
        false

      setTracking(false)

      setGpsStatus(
        'Fora de expediente',
      )

      setSyncStatus(
        'Localização pausada',
      )

      // Sai do pool de matching regional. Não bloqueia o encerramento do
      // trabalho se falhar (já registra o próprio erro).
      void updateMyPresence('offline', {
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
      })

      return true
    } catch (error) {
      console.error(
        'ERRO_PARAR_GPS:',
        error,
      )

      const message =
        error &&
        typeof error === 'object' &&
        'message' in error
          ? String(error.message)
          : 'Não foi possível encerrar o trabalho.'

      setGpsError(message)

      setGpsStatus(
        'Falha ao encerrar trabalho',
      )

      return false
    } finally {
      setGpsBusy(false)
    }
  }

  // =========================================================
  // LOGOUT
  // =========================================================

  async function handleLogout() {
    const gpsStopped =
      await stopGps()

    if (!gpsStopped) {
      setGpsError(
        'Não foi possível encerrar a localização. Tente novamente antes de sair.',
      )

      return
    }

    await supabase.auth.signOut()

    setAuthenticated(false)
    setDriver(null)
    setLocation(null)

    setEmail('')
    setPassword('')
    setAuthEmail('')

    setView('home')
    setMenuOpen(false)

    setHistory([])
    setHistoryError(null)

    setAuthError(null)
    setGpsError(null)
    setSyncError(null)

    setGpsStatus(
      'Fora de expediente',
    )

    setSyncStatus(
      'Aguardando início do trabalho',
    )

    setLastSyncedAt(null)
    setTemperature(null)

    lastLocationAttemptAt.current = 0

    locationSyncInFlight.current =
      false

    backgroundTrackingStarted.current =
      false
  }

  function navigate(
    nextView: AppView,
  ) {
    setView(nextView)
    setMenuOpen(false)

    if (
      nextView === 'history' &&
      driver
    ) {
      void loadHistory(
        driver.id,
      )
    }
  }

  // =========================================================
  // LOADING / LOGIN
  // =========================================================

  if (loadingSession) {
    return (
      <main className="app">
        <section className="card">
          <p className="eyebrow">
            ROTAZRO ENTREGADOR
          </p>

          <h1>Carregando...</h1>
        </section>
      </main>
    )
  }

  if (!authenticated || !driver) {
    return (
      <main className="app">
        <section className="card login-card">
          <p className="eyebrow">
            ROTAZRO ENTREGADOR
          </p>

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
                onChange={(event) =>
                  setEmail(
                    event.target.value,
                  )
                }
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
                onChange={(event) =>
                  setPassword(
                    event.target.value,
                  )
                }
                autoComplete="current-password"
                required
              />
            </label>

            <button
              type="submit"
              disabled={loginLoading}
            >
              {loginLoading
                ? 'Entrando...'
                : 'Entrar'}
            </button>
          </form>
        </section>
      </main>
    )
  }

  // =========================================================
  // MENU
  // =========================================================

  const drawer = (
    <>
      {menuOpen && (
        <button
          type="button"
          className="drawer-backdrop"
          aria-label="Fechar menu"
          onClick={() =>
            setMenuOpen(false)
          }
        />
      )}

      <aside
        className={`drawer ${
          menuOpen ? 'open' : ''
        }`}
      >
        <div className="drawer-profile">
          <div className="drawer-avatar">
            {driver.name
              .trim()
              .charAt(0)
              .toUpperCase()}
          </div>

          <div>
            <strong>
              {driver.name}
            </strong>

            <span>
              {driver.vehicle_type ||
                'Entregador'}

              {driver.vehicle_plate
                ? ` • ${driver.vehicle_plate}`
                : ''}
            </span>
          </div>
        </div>

        <nav className="drawer-nav">
          <button
            type="button"
            className={
              view === 'home'
                ? 'active'
                : ''
            }
            onClick={() =>
              navigate('home')
            }
          >
            <span>⌂</span>
            Início
          </button>

          <button
            type="button"
            className={
              view === 'profile'
                ? 'active'
                : ''
            }
            onClick={() =>
              navigate('profile')
            }
          >
            <span>◯</span>
            Meu perfil
          </button>

          <button
            type="button"
            className={
              view === 'history'
                ? 'active'
                : ''
            }
            onClick={() =>
              navigate('history')
            }
          >
            <span>◷</span>
            Histórico
          </button>

          <button
            type="button"
            className={
              view === 'route'
                ? 'active'
                : ''
            }
            onClick={() =>
              navigate('route')
            }
          >
            <span>▤</span>
            Minha rota
          </button>
        </nav>

        <div className="drawer-work-status">
          <span
            className={`drawer-status-dot ${
              tracking
                ? 'online'
                : ''
            }`}
          />

          <div>
            <strong>
              {tracking
                ? 'Em trabalho'
                : 'Fora de expediente'}
            </strong>

            <small>
              {tracking
                ? 'Localização ativa'
                : 'Localização pausada'}
            </small>
          </div>
        </div>

        <button
          type="button"
          className="drawer-logout"
          onClick={() => {
            void handleLogout()
          }}
          disabled={gpsBusy}
        >
          Sair da conta
        </button>
      </aside>
    </>
  )

  const header = (
    <header className="app-header">
      <button
        type="button"
        className="menu-button"
        aria-label="Abrir menu"
        onClick={() =>
          setMenuOpen(true)
        }
      >
        <span />
        <span />
        <span />
      </button>

      <div className="header-brand">
        <small>ROTAZRO</small>
        <strong>
          Entregador
        </strong>
      </div>

      <span
        className={`header-status ${
          tracking
            ? 'online'
            : ''
        }`}
      />
    </header>
  )

  // =========================================================
  // INÍCIO
  // =========================================================

  const homeView = (
    <>
      <section className="home-hero">
        <div>
          <p className="eyebrow">
            OLÁ, ENTREGADOR
          </p>

          <h1>{driver.name}</h1>

          <p className="description home-description">
            {tracking
              ? 'Você está em trabalho e sua localização está sendo compartilhada.'
              : 'Inicie seu trabalho quando estiver pronto para realizar entregas.'}
          </p>
        </div>

        <div
          className={`work-badge ${
            tracking
              ? 'online'
              : ''
          }`}
        >
          <span />

          {tracking
            ? 'Em trabalho'
            : 'Fora de expediente'}
        </div>
      </section>

      <section className="day-info-card">
        <div className="day-info-main">
          <small>AGORA</small>

          <strong>
            {formatLongDate(
              currentDateTime,
            )}
          </strong>

          <span>
            {formatClock(
              currentDateTime,
            )}
          </span>
        </div>

        <div className="weather-display">
          <span className="weather-icon">
            ☀
          </span>

          <div>
            <strong>
              {temperature != null
                ? `${Math.round(
                    temperature,
                  )}°C`
                : weatherLoading
                  ? '...'
                  : '—'}
            </strong>

            <small>
              Temperatura local
            </small>
          </div>
        </div>
      </section>

      {gpsError && (
        <div className="error">
          {gpsError}
        </div>
      )}

      <section className="section-block">
        <div className="section-heading">
          <div>
            <small>
              LOCALIZAÇÃO
            </small>

            <h2>
              Status do trabalho
            </h2>
          </div>
        </div>

        <div
          className={`status ${
            tracking
              ? 'active'
              : ''
          }`}
        >
          <span />

          {gpsStatus}
        </div>

        <div className="location-grid">
          <div>
            <small>Latitude</small>

            <strong>
              {location?.latitude.toFixed(
                6,
              ) ?? '—'}
            </strong>
          </div>

          <div>
            <small>Longitude</small>

            <strong>
              {location?.longitude.toFixed(
                6,
              ) ?? '—'}
            </strong>
          </div>

          <div>
            <small>Precisão</small>

            <strong>
              {location
                ? `${location.accuracy.toFixed(
                    1,
                  )} m`
                : '—'}
            </strong>
          </div>

          <div>
            <small>
              Velocidade
            </small>

            <strong>
              {location?.speed != null
                ? `${(
                    location.speed * 3.6
                  ).toFixed(
                    1,
                  )} km/h`
                : '—'}
            </strong>
          </div>
        </div>

        <div className="updated">
          Última leitura:{' '}
          {formatTime(
            location?.timestamp ??
              null,
          )}
        </div>

        <div className="sync-info">
          <strong>
            {syncStatus}
          </strong>

          <span>
            Último envio ao RotazRO:{' '}
            {formatTime(
              lastSyncedAt,
            )}
          </span>

          {syncError && (
            <span className="sync-error">
              {syncError}
            </span>
          )}
        </div>

        {!tracking ? (
          <button
            className="work-button"
            onClick={() => {
              void startGps()
            }}
            disabled={gpsBusy}
          >
            {gpsBusy
              ? 'Iniciando...'
              : 'Iniciar trabalho'}
          </button>
        ) : (
          <button
            className="secondary"
            onClick={() => {
              void stopGps()
            }}
            disabled={gpsBusy}
          >
            {gpsBusy
              ? 'Encerrando...'
              : 'Encerrar trabalho'}
          </button>
        )}
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <small>HOJE</small>

            <h2>
              Seu desempenho
            </h2>
          </div>

          <span className="section-date">
            {currentDateTime.toLocaleDateString(
              'pt-BR',
              {
                day: '2-digit',
                month: 'short',
              },
            )}
          </span>
        </div>

        <div className="metric-grid">
          <div className="metric-card">
            <small>
              Entregas
            </small>

            <strong>
              {metrics.today.deliveries}
            </strong>

            <span>
              {metrics.today.routes}{' '}
              rota
              {metrics.today.routes ===
              1
                ? ''
                : 's'}
            </span>
          </div>

          <div className="metric-card">
            <small>
              Distância
            </small>

            <strong>
              {formatDistance(
                metrics.today
                  .distanceMeters,
              )}
            </strong>

            <span>
              percorridos
            </span>
          </div>

          <div className="metric-card">
            <small>Tempo</small>

            <strong>
              {formatDuration(
                metrics.today
                  .durationSeconds,
              )}
            </strong>

            <span>
              em rotas
            </span>
          </div>

          <div className="metric-card">
            <small>Valor</small>

            <strong>
              {formatMoney(
                metrics.today
                  .amountCents || null,
              )}
            </strong>

            <span>
              das entregas
            </span>
          </div>
        </div>
      </section>
    </>
  )

  // =========================================================
  // PERFIL
  // =========================================================

  const currentVehicleIsUnknown =
    Boolean(profileVehicleType) &&
    !VEHICLE_TYPES.some(
      (option) =>
        option.value ===
        profileVehicleType,
    )

  const profileView = (
    <>
      <section className="page-title">
        <p className="eyebrow">
          MINHA CONTA
        </p>

        <h1>
          Meu perfil
        </h1>

        <p>
          Seus dados são compartilhados
          com os restaurantes vinculados
          à sua conta.
        </p>
      </section>

      {profileMessage && (
        <div className="success-message">
          {profileMessage}
        </div>
      )}

      {profileError && (
        <div className="error">
          {profileError}
        </div>
      )}

      <form
        className="profile-form"
        onSubmit={saveProfile}
      >
        <label>
          Nome completo

          <input
            type="text"
            value={profileName}
            onChange={(event) =>
              setProfileName(
                event.target.value,
              )
            }
            placeholder="Seu nome completo"
            required
          />
        </label>

        <label>
          E-mail

          <input
            type="email"
            value={authEmail}
            readOnly
            disabled
          />

          <small className="field-help">
            O e-mail é vinculado à
            sua conta de acesso.
          </small>
        </label>

        <label>
          Número de celular

          <input
            type="tel"
            value={profilePhone}
            onChange={(event) =>
              setProfilePhone(
                formatBrazilPhone(
                  event.target.value,
                ),
              )
            }
            placeholder="(69) 99999-9999"

            /*
             * Faz o Android abrir teclado
             * numérico em vez do teclado
             * alfanumérico.
             */
            inputMode="numeric"

            autoComplete="tel"

            /*
             * (69) 99999-9999 = 15 caracteres.
             */
            maxLength={15}
          />
        </label>

        <label>
          Tipo de veículo

          <select
            value={
              profileVehicleType
            }
            onChange={(event) =>
              setProfileVehicleType(
                event.target.value,
              )
            }
          >
            <option value="">
              Selecione...
            </option>

            {currentVehicleIsUnknown && (
              <option
                value={
                  profileVehicleType
                }
              >
                {profileVehicleType}
              </option>
            )}

            {VEHICLE_TYPES.map(
              (option) => (
                <option
                  key={
                    option.value
                  }
                  value={
                    option.value
                  }
                >
                  {option.label}
                </option>
              ),
            )}
          </select>
        </label>

        <label>
          Placa do veículo

          <input
            type="text"
            value={
              profileVehiclePlate
            }
            onChange={(event) =>
              setProfileVehiclePlate(
                event.target.value.toUpperCase(),
              )
            }
            placeholder="ABC1D23"
            autoCapitalize="characters"
          />
        </label>

        <button
          type="submit"
          disabled={profileSaving}
        >
          {profileSaving
            ? 'Salvando...'
            : 'Salvar alterações'}
        </button>
      </form>

      <section className="profile-status-card">
        <span
          className={`profile-status-icon ${
            tracking
              ? 'online'
              : ''
          }`}
        />

        <div>
          <strong>
            {tracking
              ? 'Você está em trabalho'
              : 'Você está fora de expediente'}
          </strong>

          <p>
            {tracking
              ? 'O RotazRO está recebendo sua localização.'
              : 'Sua localização não está sendo compartilhada.'}
          </p>
        </div>
      </section>
    </>
  )

  // =========================================================
  // HISTÓRICO
  // =========================================================

  const historyView = (
    <>
      <section className="page-title">
        <p className="eyebrow">
          ATIVIDADE
        </p>

        <h1>
          Histórico
        </h1>

        <p>
          Consulte seu desempenho mensal e
          todas as rotas realizadas.
        </p>
      </section>

      <section className="monthly-summary">
        <div className="section-heading">
          <div>
            <small>RESUMO</small>

            <h2>Seu mês</h2>
          </div>

          <span className="section-date">
            {currentDateTime.toLocaleDateString(
              'pt-BR',
              {
                month: 'long',
                year: 'numeric',
              },
            )}
          </span>
        </div>

        <div className="summary-list">
          <div>
            <span>
              Entregas
            </span>

            <strong>
              {metrics.month.deliveries}
            </strong>
          </div>

          <div>
            <span>
              Rotas realizadas
            </span>

            <strong>
              {metrics.month.routes}
            </strong>
          </div>

          <div>
            <span>
              Distância
            </span>

            <strong>
              {formatDistance(
                metrics.month
                  .distanceMeters,
              )}
            </strong>
          </div>

          <div>
            <span>
              Tempo em rotas
            </span>

            <strong>
              {formatDuration(
                metrics.month
                  .durationSeconds,
              )}
            </strong>
          </div>

          <div>
            <span>
              Restaurantes atendidos
            </span>

            <strong>
              {metrics.month.restaurants}
            </strong>
          </div>

          <div>
            <span>
              Valor das entregas
            </span>

            <strong>
              {formatMoney(
                metrics.month
                  .amountCents || null,
              )}
            </strong>
          </div>
        </div>
      </section>

      <div className="history-summary">
        <div>
          <small>
            Esta semana
          </small>

          <strong>
            {metrics.week.deliveries}
          </strong>

          <span>
            entregas
          </span>
        </div>

        <div>
          <small>
            Este mês
          </small>

          <strong>
            {formatDistance(
              metrics.month
                .distanceMeters,
            )}
          </strong>

          <span>
            percorridos
          </span>
        </div>

        <div>
          <small>
            Restaurantes
          </small>

          <strong>
            {metrics.month.restaurants}
          </strong>

          <span>
            este mês
          </span>
        </div>
      </div>

      <div className="history-toolbar">
        <h2>
          Rotas realizadas
        </h2>

        <button
          type="button"
          className="refresh-button"
          onClick={() => {
            if (driver) {
              void loadHistory(
                driver.id,
              )
            }
          }}
          disabled={historyLoading}
        >
          {historyLoading
            ? 'Atualizando...'
            : 'Atualizar'}
        </button>
      </div>

      {historyError && (
        <div className="error">
          {historyError}
        </div>
      )}

      {historyLoading &&
      history.length === 0 ? (
        <div className="empty-state">
          <strong>
            Carregando histórico...
          </strong>
        </div>
      ) : history.length === 0 ? (
        <div className="empty-state">
          <strong>
            Nenhuma rota registrada ainda
          </strong>

          <p>
            Quando você concluir suas primeiras
            entregas, elas aparecerão aqui.
          </p>
        </div>
      ) : (
        <div className="history-list">
          {history.map(
            (route) => {
              const expanded =
                expandedRouteId ===
                route.id

              const duration =
                getRouteDuration(
                  route,
                )

              const distance =
                getRouteDistance(
                  route,
                )

              return (
                <article
                  className="history-card"
                  key={route.id}
                >
                  <button
                    type="button"
                    className="history-card-main"
                    onClick={() =>
                      setExpandedRouteId(
                        expanded
                          ? null
                          : route.id,
                      )
                    }
                  >
                    <div className="history-card-top">
                      <div>
                        <small>
                          {formatDate(
                            route.completed_at ??
                              route.started_at ??
                              route.created_at,
                          )}
                        </small>

                        <strong>
                          {
                            route.organization_name
                          }
                        </strong>
                      </div>

                      <span
                        className={`route-status ${
                          route.completed_at
                            ? 'completed'
                            : ''
                        }`}
                      >
                        {route.completed_at
                          ? 'Concluída'
                          : route.status}
                      </span>
                    </div>

                    <div className="history-card-stats">
                      <div>
                        <strong>
                          {
                            route.deliveries
                          }
                        </strong>

                        <span>
                          entregas
                        </span>
                      </div>

                      <div>
                        <strong>
                          {formatDistance(
                            distance,
                          )}
                        </strong>

                        <span>
                          distância
                        </span>
                      </div>

                      <div>
                        <strong>
                          {formatDuration(
                            duration,
                          )}
                        </strong>

                        <span>
                          tempo
                        </span>
                      </div>
                    </div>

                    <div className="history-card-footer">
                      <span>
                        {route.amount_cents !=
                        null
                          ? formatMoney(
                              route.amount_cents,
                            )
                          : 'Valor não informado'}
                      </span>

                      <span>
                        {expanded
                          ? 'Ocultar detalhes ↑'
                          : 'Ver detalhes ↓'}
                      </span>
                    </div>
                  </button>

                  {expanded && (
                    <div className="history-details">
                      <div>
                        <span>
                          Início
                        </span>

                        <strong>
                          {formatDateTime(
                            route.started_at,
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Finalização
                        </span>

                        <strong>
                          {formatDateTime(
                            route.completed_at,
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Entregas
                        </span>

                        <strong>
                          {
                            route.deliveries
                          }
                        </strong>
                      </div>

                      <div>
                        <span>
                          Distância
                        </span>

                        <strong>
                          {formatDistance(
                            distance,
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Tempo total
                        </span>

                        <strong>
                          {formatDuration(
                            duration,
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Tempo médio /
                          entrega
                        </span>

                        <strong>
                          {route.deliveries >
                          0
                            ? formatDuration(
                                duration /
                                  route.deliveries,
                              )
                            : '—'}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Valor das entregas
                        </span>

                        <strong>
                          {formatMoney(
                            route.amount_cents,
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Status
                        </span>

                        <strong>
                          {route.status}
                        </strong>
                      </div>
                    </div>
                  )}
                </article>
              )
            },
          )}
        </div>
      )}
    </>
  )

  return (
    <main className="app app-shell">
      {drawer}

      <section className="app-container">
        {header}

        <div className="app-content">
          {view === 'home' &&
            homeView}

          {view === 'profile' &&
            profileView}

          {view === 'history' &&
            historyView}

          {view === 'route' && <MyRouteScreen />}
        </div>
      </section>

      {deliveryOffers.offer && (
        <DeliveryOfferModal
          offer={deliveryOffers.offer}
          busy={deliveryOffers.busy}
          error={deliveryOffers.error}
          onAccept={() => {
            void deliveryOffers.accept().then((routeId) => {
              if (routeId) navigate('route')
            })
          }}
          onDecline={() => void deliveryOffers.decline()}
        />
      )}
    </main>
  )
}

export default App