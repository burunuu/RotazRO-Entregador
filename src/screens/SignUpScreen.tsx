import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { normalizeEmail } from '../lib/validation'
import { logger } from '../lib/observability/logger'

type SignUpScreenProps = {
  /** Cadastro concluído com sessão ativa — a tela pai deve carregar o
   * entregador normalmente (nome/CPF/telefone são coletados depois, no
   * primeiro login, por CompleteProfileScreen — nunca aqui). */
  onSignedUp: () => void
  onCancel: () => void
}

/**
 * Coleta só e-mail e senha. Nome/CPF/telefone NUNCA passam por esta tela —
 * ver CompleteProfileScreen, que roda depois do primeiro login (com sessão
 * garantida) e grava tudo direto via complete_driver_signup(), sem
 * nenhuma etapa intermediária que precise reter esse dado localmente.
 */
export function SignUpScreen({ onSignedUp, onCancel }: SignUpScreenProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.')
      return
    }
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.')
      return
    }

    const normalizedEmail = normalizeEmail(email)

    try {
      setBusy(true)
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
      })
      if (signUpError) throw signUpError

      if (data.session) {
        onSignedUp()
        return
      }

      // Confirmação de e-mail ativada no projeto: sem sessão ainda — não
      // há nada de sensível a guardar nesse meio-tempo, só o convite para
      // voltar e entrar depois de confirmar.
      setAwaitingConfirmation(true)
    } catch (err) {
      logger.warn('auth.signup_failed', {
        message: err instanceof Error ? err.message : String(err),
      })
      setError(err instanceof Error ? err.message : 'Não foi possível criar a conta.')
    } finally {
      setBusy(false)
    }
  }

  if (awaitingConfirmation) {
    return (
      <main className="app">
        <section className="card login-card">
          <p className="eyebrow">ROTAZRO ENTREGADOR</p>
          <h1>Confirme seu e-mail</h1>
          <p className="description">
            Enviamos um link de confirmação para {email}. Depois de confirmar, volte aqui e entre
            normalmente.
          </p>
          <button type="button" onClick={onCancel}>
            Voltar para o login
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="app">
      <section className="card login-card">
        <p className="eyebrow">ROTAZRO ENTREGADOR</p>
        <h1>Criar conta</h1>
        <p className="description">
          Cadastre seu e-mail e senha. No primeiro login pedimos seu nome, CPF e celular.
        </p>

        {error && <div className="error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <label>
            E-mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>

          <label>
            Confirmar senha
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>

          <button type="submit" disabled={busy}>
            {busy ? 'Criando conta...' : 'Criar conta'}
          </button>
        </form>

        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
          Já tenho conta
        </button>
      </section>
    </main>
  )
}
