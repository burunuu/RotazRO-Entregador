import { useSyncExternalStore } from 'react'
import { App } from '@capacitor/app'
import {
  createThemeController,
  type AppTheme,
  type ThemeController,
  type ThemeDeps,
} from './theme'

/** Ligação real do controlador de tema: localStorage, matchMedia, DOM e o
 * ciclo de vida do Capacitor. Sem nada específico de fabricante Android. */
function realDeps(): ThemeDeps {
  let storage: ThemeDeps['storage'] = null
  try {
    storage = window.localStorage
  } catch {
    storage = null
  }

  return {
    storage,
    matchMedia: typeof window.matchMedia === 'function' ? (q) => window.matchMedia(q) : null,
    applyResolved: (theme) => {
      document.documentElement.classList.toggle('dark', theme === 'dark')
    },
    onAppActive: (cb) => {
      let removed = false
      let handle: { remove: () => Promise<void> } | null = null

      // Capacitor: o WebView pausado não recebe o `change` do matchMedia;
      // ao voltar para o primeiro plano o tema é reavaliado.
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) cb()
      })
        .then((h) => {
          if (removed) void h.remove()
          else handle = h
        })
        .catch(() => {
          // Plugin indisponível (ex.: navegador de desenvolvimento): os
          // eventos de janela abaixo continuam cobrindo o resume.
        })

      const onVisible = () => {
        if (document.visibilityState === 'visible') cb()
      }
      document.addEventListener('visibilitychange', onVisible)
      window.addEventListener('focus', cb)

      return () => {
        removed = true
        if (handle) void handle.remove()
        document.removeEventListener('visibilitychange', onVisible)
        window.removeEventListener('focus', cb)
      }
    },
    schedule: (fn, ms) => {
      const id = window.setTimeout(fn, ms)
      return () => window.clearTimeout(id)
    },
  }
}

let controller: ThemeController | null = null

export function getThemeController(): ThemeController {
  if (!controller) controller = createThemeController(realDeps())
  return controller
}

/** Aplica a preferência salva e liga o acompanhamento do sistema. Chamar UMA
 * vez, no boot (main.tsx), antes de renderizar — não depende de nenhuma tela. */
export function initTheme(): void {
  getThemeController().init()
}

/** Preferência atual (light/dark/system) + setter, para o seletor de aparência. */
export function useAppTheme(): [AppTheme, (theme: AppTheme) => void] {
  const c = getThemeController()
  const preference = useSyncExternalStore(c.subscribe, c.getPreference, () => 'system' as AppTheme)
  return [preference, c.setPreference]
}
