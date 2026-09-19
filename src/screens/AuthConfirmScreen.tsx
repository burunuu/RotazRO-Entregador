import { useEffect, useState } from 'react'
import { confirmFromLink, type ConfirmState } from '../services/auth-confirm'
import { logger } from '../lib/observability/logger'

type AuthConfirmScreenProps = {
  search: string
  hash: string
  onDone: () => void
}

export function AuthConfirmScreen({ search, hash, onDone }: AuthConfirmScreenProps) {
  const [state, setState] = useState<ConfirmState>('confirming')

  useEffect(() => {
    void confirmFromLink(search, hash)
      .then(setState)
      .catch((error) => {
        logger.warn('auth.confirm_failed', {
          message: error instanceof Error ? error.message : String(error),
        })
        setState('error')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <main className="app">
      <section className="card login-card">
        <p className="eyebrow">ROTAZRO ENTREGADOR</p>

        {state === 'confirming' && (
          <>
            <h1>Confirmando...</h1>
            <p className="description">Só um instante.</p>
          </>
        )}

        {(state === 'confirmed' || state === 'already_active') && (
          <>
            <h1>
              {state === 'confirmed' ? 'Conta ativada com sucesso.' : 'Esta conta já foi ativada.'}
            </h1>
            <button type="button" onClick={onDone}>
              Continuar
            </button>
          </>
        )}

        {state === 'error' && (
          <>
            <h1>Este link expirou ou não é mais válido.</h1>
            <p className="description">
              Entre com seu e-mail e senha — se a conta ainda não estiver confirmada, você poderá
              reenviar o e-mail de ativação por lá.
            </p>
            <button type="button" onClick={onDone}>
              Voltar para o login
            </button>
          </>
        )}
      </section>
    </main>
  )
}
