/** Mantém só os dígitos, truncados a 11 — telefone celular BR (com DDD). */
export function onlyDigits(value: string) {
  return value.replace(/\D/g, '').slice(0, 11)
}

/** Formata um telefone BR conforme o usuário digita: fixo (10) ou celular (11). */
export function formatBrazilPhone(value: string) {
  const digits = onlyDigits(value)

  if (!digits) return ''

  if (digits.length <= 2) {
    return `(${digits}`
  }

  const ddd = digits.slice(0, 2)
  const number = digits.slice(2)

  if (digits.length <= 6) {
    return `(${ddd}) ${number}`
  }

  if (digits.length <= 10) {
    const first = number.slice(0, 4)
    const second = number.slice(4)

    return second ? `(${ddd}) ${first}-${second}` : `(${ddd}) ${first}`
  }

  const first = number.slice(0, 5)
  const second = number.slice(5)

  return second ? `(${ddd}) ${first}-${second}` : `(${ddd}) ${first}`
}

/** Formata segundos como "Xh Ymin" (ou só "X min" abaixo de 1h) — usado em
 * qualquer lugar que mostre duração de rota (histórico, resumo pós-rota). */
export function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '—'

  const roundedMinutes = Math.round(seconds / 60)

  if (roundedMinutes < 60) {
    return `${roundedMinutes} min`
  }

  const hours = Math.floor(roundedMinutes / 60)
  const minutes = roundedMinutes % 60

  if (minutes === 0) return `${hours}h`

  return `${hours}h ${minutes}min`
}

/** Todos os status reais de public.routes (ver CHECK constraint da tabela). */
export const ROUTE_STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  searching_driver: 'Buscando entregador',
  confirmed: 'Confirmada',
  in_progress: 'Em andamento',
  completed: 'Concluída',
  cancelled: 'Cancelada',
}

export function routeStatusLabel(status: string): string {
  return ROUTE_STATUS_LABEL[status] ?? status
}
