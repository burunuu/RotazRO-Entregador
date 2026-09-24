import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { formatBrazilPhone, formatCpf } from '../lib/format'
import { isValidBrazilianPhone, isValidCpf, normalizeEmail } from '../lib/validation'
import { logger } from '../lib/observability/logger'

/** https://rotazro.lovable.app/auth/confirm — hardcoded, not
 * window.location.origin: a Capacitor WebView's own origin isn't a real
 * https domain Android App Links can verify, so the confirmation e-mail
 * must always point at the Web app's domain (see docs/ROTAZRO_APP_LINKS.md
 * in the Web repo). Restaurant self-signup on the Web is unaffected — it
 * keeps using window.location.origin, unchanged. */
const AUTH_CONFIRM_REDIRECT_URL = 'https://rotazro.lovable.app/auth/confirm'

const RESEND_COOLDOWN_S = 45

type SignUpScreenProps = {
  /** Cadastro concluído com sessão ativa de imediato (confirmação de e-mail
   * desligada no projeto) — a tela pai deve carregar o entregador normalmente. */
  onSignedUp: () => void
  onCancel: () => void
}

/**
 * Coleta nome/e-mail/CPF/celular/senha de uma vez (seção 9 do pedido).
 * Nome/CPF/celular NUNCA tocam localStorage/sessionStorage: vão direto no
 * próprio signUp() como user_metadata (options.data) — o único canal que
 * aceita esse dado ANTES de existir qualquer sessão, já que a confirmação
 * de e-mail impede uma sessão imediata. GoTrue guarda isso preso à conta
 * (não a este dispositivo/processo), então funciona mesmo se a pessoa
 * confirmar depois, de outro aparelho. AuthConfirmScreen lê de volta esse
 * metadata assim que a sessão é estabelecida, chama complete_driver_signup()
 * e limpa os três campos — ver docs/ROTAZRO_APP_LINKS.md para a análise
 * completa de segurança dessa escolha.
 */
export function SignUpScreen({ onSignedUp, onCancel }: SignUpScreenProps) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [cpf, setCpf] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)
  const [resendBusy, setResendBusy] = useState(false)
  const [resendMessage, setResendMessage] = useState<string | null>(null)
  const [cooldownEndsAt, setCooldownEndsAt] = useState<number | null>(null)
  const [cooldownNowMs, setCooldownNowMs] = useState(() => Date.now())
  const [submittedEmail, setSubmittedEmail] = useState('')

  useEffect(() => {
    if (cooldownEndsAt === null) return
    const interval = window.setInterval(() => setCooldownNowMs(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [cooldownEndsAt])

  const cooldownSecondsLeft =
    cooldownEndsAt === null ? 0 : Math.max(0, Math.ceil((cooldownEndsAt - cooldownNowMs) / 1000))

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
    setSubmittedEmail(normalizedEmail)

    try {
      setBusy(true)
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: AUTH_CONFIRM_REDIRECT_URL,
          data: {
            full_name: fullName.trim(),
            cpf: cpf.replace(/\D/g, ''),
            phone: phone.replace(/\D/g, ''),
          },
        },
      })
      if (signUpError) throw signUpError

      if (data.session) {
        // Confirmação de e-mail desligada no projeto — sessão já ativa,
        // AppTsx trata o resto (detecta perfil incompleto e completa a
        // partir do mesmo user_metadata, igual ao caminho via link).
        onSignedUp()
        return
      }

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

  async function handleResend() {
    if (resendBusy || cooldownSecondsLeft > 0) return
    setResendBusy(true)
    setResendMessage(null)
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: submittedEmail,
        options: { emailRedirectTo: AUTH_CONFIRM_REDIRECT_URL },
      })
      if (resendError) throw resendError
      setResendMessage('E-mail reenviado.')
      setCooldownEndsAt(Date.now() + RESEND_COOLDOWN_S * 1000)
    } catch (err) {
      logger.warn('auth.resend_confirmation_failed', {
        message: err instanceof Error ? err.message : String(err),
      })
      setResendMessage('Não foi possível reenviar agora. Tente novamente em instantes.')
    } finally {
      setResendBusy(false)
    }
  }

  if (awaitingConfirmation) {
    return (
      <main className="app">
        <section className="card login-card">
          <p className="eyebrow">ROTAZRO ENTREGADOR</p>
          <h1>Confirme seu e-mail</h1>
          <p className="description">
            Enviamos um link de confirmação para {submittedEmail}.
            <br />
            Clique no link do e-mail para ativar sua conta.
          </p>

          {resendMessage && <div className="error">{resendMessage}</div>}

          <button type="button" onClick={() => void handleResend()} disabled={resendBusy || cooldownSecondsLeft > 0}>
            {resendBusy
              ? 'Reenviando...'
              : cooldownSecondsLeft > 0
                ? `Reenviar e-mail (${cooldownSecondsLeft}s)`
                : 'Reenviar e-mail'}
          </button>

          <button type="button" className="text-action" onClick={onCancel}>
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

        <button type="button" className="text-action" onClick={onCancel} disabled={busy}>
          Já tenho conta
        </button>
      </section>
    </main>
  )
}
