/**
 * Erros do supabase-js (PostgrestError, AuthError, FunctionsError) NÃO são
 * instâncias de `Error` — são objetos simples com {message, details, hint,
 * code}. Usar `err instanceof Error` neles sempre cai no fallback genérico,
 * escondendo a causa real (ex.: RPC inexistente, RLS negando, constraint
 * violada). Este helper sempre loga o erro completo (nunca segredos —
 * supabase-js nunca inclui chaves/tokens no corpo do erro), captura no
 * Sentry se configurado, e devolve a melhor mensagem disponível pra UI.
 *
 * Nota de precisão (documentada em docs/ROTazRO_OBSERVABILITY.md): este
 * helper é usado tanto para falhas genuinamente inesperadas quanto para
 * resultados de negócio já esperados (ex.: "esta oferta já foi aceita" —
 * uma corrida normal, não um bug). Diferente do repo Web (que distingue
 * P0001 de erro inesperado explicitamente), aqui todo erro passa por
 * captureError — aceito como imprecisão conhecida por agora, não uma
 * falha de projeto.
 */
import { captureError } from '../lib/observability/capture'

interface PostgrestLikeError {
  message?: string
  details?: string | null
  hint?: string | null
  code?: string | null
}

function isPostgrestLike(value: unknown): value is PostgrestLikeError {
  return typeof value === 'object' && value !== null && 'message' in value
}

/** Loga {rpc, code, message, details, hint} e devolve uma mensagem de UI. */
export function describeError(err: unknown, context: string, fallback: string): string {
  if (err instanceof Error) {
    captureError(err, { event: `app.${context.toLowerCase()}` })
    return err.message || fallback
  }

  if (isPostgrestLike(err)) {
    captureError(new Error(err.message ?? 'unknown_postgrest_error'), {
      event: `app.${context.toLowerCase()}`,
      extra: { code: err.code ?? null, details: err.details ?? null, hint: err.hint ?? null },
    })
    // PGRST202/PGRST116 e "does not exist" indicam RPC/tabela ausente no
    // ambiente atual (ex.: backend remoto sem a migration aplicada) — vale
    // uma mensagem mais específica que ajuda a diferenciar de um erro comum.
    const msg = err.message ?? ''
    if (err.code === 'PGRST202' || /schema cache|does not exist|not found/i.test(msg)) {
      return `Recurso indisponível neste servidor (${context}). Fale com o suporte.`
    }
    return msg || fallback
  }

  captureError(err, { event: `app.${context.toLowerCase()}` })
  return fallback
}
