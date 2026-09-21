import { useCallback, useEffect, useState } from 'react'

export type AppTheme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'rotazro-theme'

function readStoredTheme(): AppTheme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
  } catch {
    return 'system'
  }
}

function prefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
}

function applyResolvedTheme(theme: AppTheme) {
  const isDark = theme === 'dark' || (theme === 'system' && prefersDark())
  document.documentElement.classList.toggle('dark', isDark)
}

/** "Sistema" é o padrão recomendado — acompanha prefers-color-scheme e
 * continua acompanhando trocas ao vivo (celular muda de claro pra escuro
 * com o app aberto) enquanto o modo escolhido continuar sendo "system".
 * Preferência salva é só light/dark/system — não é dado sensível. */
export function useAppTheme(): [AppTheme, (theme: AppTheme) => void] {
  const [theme, setThemeState] = useState<AppTheme>(() =>
    typeof document === 'undefined' ? 'system' : readStoredTheme(),
  )

  useEffect(() => {
    const stored = readStoredTheme()
    setThemeState(stored)
    applyResolvedTheme(stored)
  }, [])

  useEffect(() => {
    if (theme !== 'system' || typeof matchMedia !== 'function') return
    const media = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyResolvedTheme('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [theme])

  const setTheme = useCallback((next: AppTheme) => {
    setThemeState(next)
    applyResolvedTheme(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Preferência de tema não é essencial — se o storage estiver
      // bloqueado, só não persiste entre sessões.
    }
  }, [])

  return [theme, setTheme]
}
