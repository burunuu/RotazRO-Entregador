import { useAppTheme, type AppTheme } from '../lib/theme'

const OPTIONS: { value: AppTheme; label: string }[] = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' },
  { value: 'system', label: 'Sistema' },
]

/** Seção "Preferências" do perfil. Três opções — "Sistema" é o padrão
 * recomendado e acompanha o celular ao vivo (ver src/lib/theme.ts). A troca
 * é aplicada na hora (não depende do "Salvar alterações" do formulário). */
export function ThemeSelector() {
  const [theme, setTheme] = useAppTheme()

  return (
    <section className="profile-section">
      <h2 className="profile-section-title">Preferências</h2>

      <div className="profile-card">
        <div className="theme-selector-head">
          <strong id="theme-selector-label">Aparência</strong>
          <small className="field-help">
            "Sistema" acompanha o modo claro ou escuro do seu celular.
          </small>
        </div>

        <div
          className="theme-selector-options"
          role="radiogroup"
          aria-labelledby="theme-selector-label"
        >
          {OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={theme === option.value}
              className={`theme-selector-option${theme === option.value ? ' active' : ''}`}
              onClick={() => setTheme(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
