/**
 * Erros do supabase-js (PostgrestError, AuthError, FunctionsError) NÃO são
 * instâncias de `Error` — são objetos simples com {message, details, hint,
 * code}. Usar `err instanceof Error` neles sempre cai no fallback genérico,
 * escondendo a causa real (ex.: RPC inexistente, RLS negando, constraint
 * violada). Este helper sempre loga o erro completo no console (nunca
 * segredos — supabase-js nunca inclui chaves/tokens no corpo do erro) e
 * devolve a melhor mensagem disponível para mostrar na UI.
 */

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
    console.error(`ERRO_${context}:`, err.message, err)
    return err.message || fallback
  }

  if (isPostgrestLike(err)) {
    console.error(`ERRO_${context}:`, {
      code: err.code ?? null,
      message: err.message ?? null,
      details: err.details ?? null,
      hint: err.hint ?? null,
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

  console.error(`ERRO_${context}:`, err)
  return fallback
}
