import { describe, expect, it } from 'vitest'
import {
  createThemeController,
  THEME_STORAGE_KEY,
  type AppTheme,
  type MediaQueryListLike,
  type ResolvedTheme,
} from '../theme'

/** Ambiente simulado: "Android" claro/escuro, storage, DOM, resume e timers. */
function makeEnv(opts: { osDark?: boolean; stored?: AppTheme | null; legacyMedia?: boolean } = {}) {
  let osDark = opts.osDark ?? false
  const store = new Map<string, string>()
  if (opts.stored) store.set(THEME_STORAGE_KEY, opts.stored)

  const changeListeners = new Set<() => void>()
  const resumeCallbacks = new Set<() => void>()
  const timers: Array<{ fn: () => void; ms: number; cancelled: boolean }> = []
  const applied: ResolvedTheme[] = []
  let dom: ResolvedTheme = 'light'
  let listenersAdded = 0

  const modern: MediaQueryListLike = {
    get matches() {
      return osDark
    },
    addEventListener: (_t, l) => {
      listenersAdded++
      changeListeners.add(l)
    },
    removeEventListener: (_t, l) => {
      changeListeners.delete(l)
    },
  }
  const legacy: MediaQueryListLike = {
    get matches() {
      return osDark
    },
    addListener: (l) => {
      listenersAdded++
      changeListeners.add(l)
    },
    removeListener: (l) => {
      changeListeners.delete(l)
    },
  }

  const controller = createThemeController({
    storage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => {
        store.set(k, v)
      },
    },
    matchMedia: () => (opts.legacyMedia ? legacy : modern),
    applyResolved: (t) => {
      dom = t
      applied.push(t)
    },
    onAppActive: (cb) => {
      resumeCallbacks.add(cb)
      return () => {
        resumeCallbacks.delete(cb)
      }
    },
    schedule: (fn, ms) => {
      const t = { fn, ms, cancelled: false }
      timers.push(t)
      return () => {
        t.cancelled = true
      }
    },
  })

  return {
    controller,
    store,
    get dom() {
      return dom
    },
    get listenersAdded() {
      return listenersAdded
    },
    get changeListenerCount() {
      return changeListeners.size
    },
    get resumeCount() {
      return resumeCallbacks.size
    },
    /** O Android muda de tema COM entrega do evento `change` ao WebView. */
    setOsDark(next: boolean) {
      osDark = next
      changeListeners.forEach((l) => l())
    },
    /** O Android muda de tema mas o WebView pausado NÃO recebe o evento. */
    setOsDarkSilently(next: boolean) {
      osDark = next
    },
    resume() {
      resumeCallbacks.forEach((cb) => cb())
    },
    runTimers() {
      timers.filter((t) => !t.cancelled).forEach((t) => t.fn())
    },
    pendingTimers: () => timers.filter((t) => !t.cancelled).length,
  }
}

describe('preferência × sistema', () => {
  it('A) preferência light + Android escuro → app claro', () => {
    const env = makeEnv({ osDark: true, stored: 'light' })
    env.controller.init()
    expect(env.dom).toBe('light')
    expect(env.controller.getResolved()).toBe('light')
  })

  it('B) preferência dark + Android claro → app escuro', () => {
    const env = makeEnv({ osDark: false, stored: 'dark' })
    env.controller.init()
    expect(env.dom).toBe('dark')
  })

  it('C) preferência system + Android claro → app claro', () => {
    const env = makeEnv({ osDark: false, stored: 'system' })
    env.controller.init()
    expect(env.dom).toBe('light')
  })

  it('sem preferência salva o padrão é "system"', () => {
    const env = makeEnv({ osDark: true })
    env.controller.init()
    expect(env.controller.getPreference()).toBe('system')
    expect(env.dom).toBe('dark')
  })
})

describe('preferência system acompanha o Android', () => {
  it('D) Android claro → escuro (evento change) → app escuro', () => {
    const env = makeEnv({ osDark: false, stored: 'system' })
    env.controller.init()
    env.setOsDark(true)
    expect(env.dom).toBe('dark')
  })

  it('E) Android escuro → claro (evento change) → app claro', () => {
    const env = makeEnv({ osDark: true, stored: 'system' })
    env.controller.init()
    expect(env.dom).toBe('dark')
    env.setOsDark(false)
    expect(env.dom).toBe('light')
  })

  it('F) app em segundo plano: o Android muda SEM evento e o app volta → tema atualizado', () => {
    const env = makeEnv({ osDark: false, stored: 'system' })
    env.controller.init()
    env.setOsDarkSilently(true) // WebView pausado: nenhum `change`
    expect(env.dom).toBe('light')
    env.resume()
    expect(env.dom).toBe('dark')

    env.setOsDarkSilently(false)
    env.resume()
    expect(env.dom).toBe('light')
  })

  it('F2) o resume reavalia de novo depois de um instante (WebView que atualiza atrasado)', () => {
    const env = makeEnv({ osDark: false, stored: 'system' })
    env.controller.init()
    env.resume()
    env.setOsDarkSilently(true) // só passa a refletir depois do resume
    expect(env.dom).toBe('light')
    env.runTimers()
    expect(env.dom).toBe('dark')
  })

  it('I) reinício com preferência system → resolve pelo Android ATUAL e continua salvando "system"', () => {
    const first = makeEnv({ osDark: false, stored: 'system' })
    first.controller.init()
    expect(first.dom).toBe('light')

    // Novo processo: o Android agora está escuro e o storage foi mantido.
    const second = makeEnv({ osDark: true, stored: first.store.get(THEME_STORAGE_KEY) as AppTheme })
    second.controller.init()
    expect(second.dom).toBe('dark')
    expect(second.controller.getPreference()).toBe('system')
    expect(second.store.get(THEME_STORAGE_KEY)).toBe('system')
  })

  it('reinício com "dark" salvo aplica escuro no boot, sem depender de nenhuma tela', () => {
    const env = makeEnv({ osDark: false, stored: 'dark' })
    env.controller.init()
    expect(env.dom).toBe('dark')
  })
})

describe('escolha manual ignora o Android', () => {
  it('G) system → dark: mudanças posteriores do Android não alteram o app', () => {
    const env = makeEnv({ osDark: false, stored: 'system' })
    env.controller.init()
    env.controller.setPreference('dark')
    expect(env.dom).toBe('dark')
    expect(env.changeListenerCount).toBe(0)
    expect(env.resumeCount).toBe(0)

    env.setOsDark(false)
    env.setOsDark(true)
    env.setOsDark(false)
    env.resume()
    expect(env.dom).toBe('dark')
  })

  it('H) system → light: mudanças posteriores do Android não alteram o app', () => {
    const env = makeEnv({ osDark: true, stored: 'system' })
    env.controller.init()
    expect(env.dom).toBe('dark')
    env.controller.setPreference('light')
    expect(env.dom).toBe('light')
    expect(env.changeListenerCount).toBe(0)

    env.setOsDark(true)
    env.resume()
    env.runTimers()
    expect(env.dom).toBe('light')
  })

  it('dark → light e light → dark manuais respondem na hora, ignorando o Android', () => {
    const env = makeEnv({ osDark: true, stored: 'dark' })
    env.controller.init()
    env.controller.setPreference('light')
    expect(env.dom).toBe('light')
    env.controller.setPreference('dark')
    expect(env.dom).toBe('dark')
  })
})

describe('preferência salva', () => {
  it('salva a PREFERÊNCIA, nunca o tema resolvido', () => {
    const env = makeEnv({ osDark: true })
    env.controller.init()
    env.controller.setPreference('system')
    expect(env.store.get(THEME_STORAGE_KEY)).toBe('system')
    expect(env.dom).toBe('dark') // resolvido escuro, preferência continua "system"
    env.controller.setPreference('light')
    expect(env.store.get(THEME_STORAGE_KEY)).toBe('light')
    env.controller.setPreference('dark')
    expect(env.store.get(THEME_STORAGE_KEY)).toBe('dark')
  })

  it('valor inválido no storage cai em "system"', () => {
    const env = makeEnv({ osDark: false })
    env.store.set(THEME_STORAGE_KEY, 'roxo')
    env.controller.init()
    expect(env.controller.getPreference()).toBe('system')
  })

  it('storage bloqueado não quebra (só não persiste)', () => {
    const controller = createThemeController({
      storage: {
        getItem: () => {
          throw new Error('blocked')
        },
        setItem: () => {
          throw new Error('blocked')
        },
      },
      matchMedia: () => ({ matches: true }),
      applyResolved: () => {},
      onAppActive: () => () => {},
      schedule: () => () => {},
    })
    expect(() => controller.init()).not.toThrow()
    expect(() => controller.setPreference('dark')).not.toThrow()
    expect(controller.getResolved()).toBe('dark')
  })
})

describe('observadores do sistema', () => {
  it('nunca registra listeners duplicados (init + várias vezes "system")', () => {
    const env = makeEnv({ osDark: false, stored: 'system' })
    env.controller.init()
    env.controller.init()
    env.controller.setPreference('system')
    env.controller.setPreference('system')
    expect(env.listenersAdded).toBe(1)
    expect(env.changeListenerCount).toBe(1)
    expect(env.resumeCount).toBe(1)
    expect(env.controller.activeWatchers()).toBe(1)
  })

  it('trocar system → manual → system remove e recria exatamente um observador', () => {
    const env = makeEnv({ osDark: false, stored: 'system' })
    env.controller.init()
    env.controller.setPreference('dark')
    expect(env.controller.activeWatchers()).toBe(0)
    expect(env.changeListenerCount).toBe(0)
    env.controller.setPreference('system')
    expect(env.controller.activeWatchers()).toBe(1)
    expect(env.changeListenerCount).toBe(1)
    expect(env.resumeCount).toBe(1)
  })

  it('cancela as reavaliações agendadas ao sair de "system"', () => {
    const env = makeEnv({ osDark: false, stored: 'system' })
    env.controller.init()
    env.resume()
    expect(env.pendingTimers()).toBeGreaterThan(0)
    env.controller.setPreference('light')
    expect(env.pendingTimers()).toBe(0)
  })

  it('WebView antigo sem addEventListener usa addListener/removeListener', () => {
    const env = makeEnv({ osDark: false, stored: 'system', legacyMedia: true })
    env.controller.init()
    expect(env.changeListenerCount).toBe(1)
    env.setOsDark(true)
    expect(env.dom).toBe('dark')
    env.controller.setPreference('light')
    expect(env.changeListenerCount).toBe(0)
  })

  it('sem matchMedia, "system" cai em claro e o resume não quebra', () => {
    const controller = createThemeController({
      storage: { getItem: () => 'system', setItem: () => {} },
      matchMedia: null,
      applyResolved: () => {},
      onAppActive: () => () => {},
      schedule: () => () => {},
    })
    expect(() => controller.init()).not.toThrow()
    expect(controller.getResolved()).toBe('light')
  })
})

describe('assinantes da UI', () => {
  it('avisa quando a preferência muda e quando o tema resolvido muda pelo sistema', () => {
    const env = makeEnv({ osDark: false, stored: 'system' })
    env.controller.init()
    let calls = 0
    const off = env.controller.subscribe(() => calls++)
    env.setOsDark(true)
    expect(calls).toBe(1)
    env.controller.setPreference('light')
    expect(calls).toBe(2)
    off()
    env.controller.setPreference('dark')
    expect(calls).toBe(2)
  })
})
