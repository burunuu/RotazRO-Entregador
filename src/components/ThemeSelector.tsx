import { useAppTheme, type AppTheme } from '../lib/theme'

const OPTIONS: { value: AppTheme; label: string }[] = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' },
  { value: 'system', label: 'Sistema' },
]

/** Três opções — "Sistema" é o padrão recomendado e acompanha o celular
 * ao vivo (ver src/lib/theme.ts). Usado na tela de perfil. */
export function ThemeSelector() {
  const [theme, setTheme] = useAppTheme()

  return (
    <section className="theme-selector">
      <p className="eyebrow">APARÊNCIA</p>
      <div className="theme-selector-options">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`theme-selector-option${theme === option.value ? ' active' : ''}`}
            onClick={() => setTheme(option.value)}
            aria-pressed={theme === option.value}
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  )
}
