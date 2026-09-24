import { useState } from 'react'
import type { FormEvent } from 'react'
import { completeDriverSignup } from '../services/driver-identity'
import { formatBrazilPhone } from '../lib/format'
import { isValidBrazilianPhone, isValidCpf } from '../lib/validation'
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

type CompleteProfileScreenProps = {
  onCompleted: () => void
  onLogout: () => void
}

/**
 * Roda depois do primeiro login de um entregador regional recém-cadastrado
 * (driver_profiles.full_name ainda vazio) — a sessão já está garantida
 * nesse ponto, então nome/CPF/telefone vão direto para
 * complete_driver_signup() sem nenhuma etapa intermediária que precise
 * reter esse dado localmente (nem em memória além do formulário em si).
 */
export function CompleteProfileScreen({ onCompleted, onLogout }: CompleteProfileScreenProps) {
  const [fullName, setFullName] = useState('')
  const [cpf, setCpf] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

    try {
      setBusy(true)
      await completeDriverSignup(fullName.trim(), cpf, phone)
      onCompleted()
    } catch (err) {
      // CPF nunca entra no log — só a mensagem de erro (que, para
      // duplicidade, já é genérica por design do backend).
      logger.warn('auth.complete_profile_failed', {
        message: err instanceof Error ? err.message : String(err),
      })
      setError(err instanceof Error ? err.message : 'Não foi possível concluir o cadastro.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="app">
      <section className="card login-card">
        <p className="eyebrow">ROTAZRO ENTREGADOR</p>
        <h1>Complete seu cadastro</h1>
        <p className="description">Falta pouco — precisamos de mais alguns dados.</p>

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

          <button type="submit" disabled={busy}>
            {busy ? 'Salvando...' : 'Concluir cadastro'}
          </button>
        </form>

        <button type="button" className="secondary" onClick={onLogout} disabled={busy}>
          Sair
        </button>
      </section>
    </main>
  )
}
