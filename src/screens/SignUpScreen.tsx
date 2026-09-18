import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { completeDriverSignup } from '../services/driver-identity'
import { savePendingSignup } from '../lib/pending-signup'
import { formatBrazilPhone } from '../lib/format'
import { isValidBrazilianPhone, isValidCpf, normalizeEmail } from '../lib/validation'
import { logger } from '../lib/observability/logger'

function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  const p1 = digits.slice(0, 3)
  const p2 = digits.slice(3, 6)
  const p3 = digits.slice(6, 9)
  const p4 = digits.slice(9, 11)
  let out = p1
  if (p2) out += `.${p2}`
  if (p3) out += `.${p3}`
  if (p4) out += `-${p4}`
  return out
}

type SignUpScreenProps = {
  /** Cadastro concluído com sessão ativa — a tela pai deve carregar o entregador normalmente. */
  onSignedUp: () => void
  onCancel: () => void
}

export function SignUpScreen({ onSignedUp, onCancel }: SignUpScreenProps) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [cpf, setCpf] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!fullName.trim()) {
      setError('Informe seu nome completo.')
      return
    }
    if (!isValidCpf(cpf)) {
      setError('CPF inválido.')
      return
    }
    if (!isValidBrazilianPhone(phone)) {
      setError('Telefone inválido. Use DDD + número.')
      return
    }
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
        await completeDriverSignup(fullName.trim(), cpf, phone)
        onSignedUp()
        return
      }

      // Confirmação de e-mail ativada no projeto: ainda não há sessão para
      // gravar nome/CPF/telefone agora — fica pendente até o primeiro
      // login, resolvido por resolvePendingSignup() (ver App.tsx).
      savePendingSignup({ email: normalizedEmail, fullName: fullName.trim(), cpf, phone })
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
        <p className="description">Cadastre-se para começar a receber entregas.</p>

        {error && <div className="error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <label>
            Nome completo
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
              required
            />
          </label>

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
            CPF
            <input
              type="text"
              value={formatCpf(cpf)}
              onChange={(e) => setCpf(e.target.value)}
              placeholder="000.000.000-00"
              inputMode="numeric"
              maxLength={14}
              required
            />
          </label>

          <label>
            Número de celular
            <input
              type="tel"
              value={formatBrazilPhone(phone)}
              onChange={(e) => setPhone(formatBrazilPhone(e.target.value))}
              placeholder="(69) 99999-9999"
              inputMode="numeric"
              autoComplete="tel"
              maxLength={15}
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
