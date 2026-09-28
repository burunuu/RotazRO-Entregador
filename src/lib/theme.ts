/**
 * Tema do app — preferência do usuário × tema resolvido.
 *
 *   preference  light | dark | system   (o que o usuário escolheu; é o que se salva)
 *   resolved    light | dark            (o que é aplicado ao DOM)
 *
 * "system" NUNCA é gravado como "dark"/"light": a preferência continua
 * "system" e só o tema resolvido acompanha o Android.
 *
 * Este módulo é puro (sem Capacitor, sem window): todas as dependências do
 * ambiente entram por `ThemeDeps`, o que permite testar o comportamento sem
 * WebView. A ligação real (localStorage, matchMedia, Capacitor App) está em
 * ./theme-runtime.ts.
 */

export type AppTheme = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'rotazro-theme'
export const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)'

/** Reavaliações extras depois de voltar ao primeiro plano: alguns WebViews
 * só refletem a mudança do sistema alguns instantes após o resume. */
const RESUME_RECHECK_DELAYS_MS = [300, 1200]

export type MediaQueryListLike = {
  matches: boolean
  addEventListener?: (type: 'change', listener: () => void) => void
  removeEventListener?: (type: 'change', listener: () => void) => void
  /** WebViews Android antigos só têm a API legada. */
  addListener?: (listener: () => void) => void
  removeListener?: (listener: () => void) => void
}

export type ThemeDeps = {
  storage: Pick<Storage, 'getItem' | 'setItem'> | null
  matchMedia: ((query: string) => MediaQueryListLike) | null
  /** Aplica o tema JÁ RESOLVIDO ao DOM (idempotente). */
  applyResolved: (theme: ResolvedTheme) => void
  /** Chama `cb` sempre que o app volta ao primeiro plano; devolve o cancelamento. */
  onAppActive: (cb: () => void) => () => void
  /** Agenda `fn`; devolve o cancelamento. */
  schedule: (fn: () => void, ms: number) => () => void
}

export type ThemeController = {
  init: () => void
  getPreference: () => AppTheme
  getResolved: () => ResolvedTheme
  setPreference: (next: AppTheme) => void
  /** Reavalia o sistema agora (usado no resume e nos testes). */
  resync: () => void
  subscribe: (listener: () => void) => () => void
  /** Quantos observadores do sistema estão ativos (0 ou 1) — diagnóstico/testes. */
  activeWatchers: () => number
}

export function isAppTheme(value: unknown): value is AppTheme {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function createThemeController(deps: ThemeDeps): ThemeController {
  const subscribers = new Set<() => void>()
  let preference: AppTheme = readPreference()
  let resolved: ResolvedTheme = resolve()
  let stopWatching: (() => void) | null = null

  function readPreference(): AppTheme {
    try {
      const stored = deps.storage?.getItem(THEME_STORAGE_KEY)
      return isAppTheme(stored) ? stored : 'system'
    } catch {
      return 'system'
    }
  }

  function osPrefersDark(): boolean {
    try {
      return Boolean(deps.matchMedia?.(DARK_MEDIA_QUERY).matches)
    } catch {
      return false
    }
  }

  function resolve(): ResolvedTheme {
    if (preference === 'dark') return 'dark'
    if (preference === 'light') return 'light'
    return osPrefersDark() ? 'dark' : 'light'
  }

  function notify() {
    subscribers.forEach((listener) => listener())
  }

  /** Recalcula e aplica. Sempre reaplica ao DOM (idempotente) e só avisa a UI
   * quando algo realmente mudou. */
  function sync(forceNotify = false) {
    const next = resolve()
    const changed = next !== resolved
    resolved = next
    deps.applyResolved(resolved)
    if (changed || forceNotify) notify()
  }

  function startWatching() {
    if (stopWatching) return // nunca dois observadores

    const cleanups: Array<() => void> = []

    let mql: MediaQueryListLike | null = null
    try {
      mql = deps.matchMedia ? deps.matchMedia(DARK_MEDIA_QUERY) : null
    } catch {
      mql = null
    }
    if (mql) {
      const onChange = () => sync()
      const list = mql
      if (typeof list.addEventListener === 'function' && typeof list.removeEventListener === 'function') {
        list.addEventListener('change', onChange)
        cleanups.push(() => list.removeEventListener!('change', onChange))
      } else if (typeof list.addListener === 'function' && typeof list.removeListener === 'function') {
        list.addListener(onChange)
        cleanups.push(() => list.removeListener!(onChange))
      }
    }

    const pendingRechecks = new Set<() => void>()
    const offApp = deps.onAppActive(() => {
      sync()
      for (const delay of RESUME_RECHECK_DELAYS_MS) {
        const cancel = deps.schedule(() => {
          pendingRechecks.delete(cancel)
          sync()
        }, delay)
        pendingRechecks.add(cancel)
      }
    })
    cleanups.push(offApp)
    cleanups.push(() => {
      pendingRechecks.forEach((cancel) => cancel())
      pendingRechecks.clear()
    })

    stopWatching = () => {
      cleanups.forEach((fn) => fn())
      stopWatching = null
    }
  }

  return {
    init() {
      preference = readPreference()
      sync()
      if (preference === 'system') startWatching()
      else stopWatching?.()
    },
    getPreference: () => preference,
    getResolved: () => resolved,
    setPreference(next) {
      preference = next
      try {
        deps.storage?.setItem(THEME_STORAGE_KEY, next)
      } catch {
        // Preferência de tema não é essencial — se o storage estiver
        // bloqueado, só não persiste entre sessões.
      }
      if (next === 'system') startWatching()
      else stopWatching?.()
      sync(true) // a preferência mudou mesmo que o tema resolvido não tenha mudado
    },
    resync: () => sync(),
    subscribe(listener) {
      subscribers.add(listener)
      return () => {
        subscribers.delete(listener)
      }
    },
    activeWatchers: () => (stopWatching ? 1 : 0),
  }
}
