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

/** Só dígitos, sem truncar — base das máscaras de CPF/CNPJ. */
function digitsOf(value: string | null | undefined, max: number) {
  return (value ?? '').replace(/\D/g, '').slice(0, max)
}

/** 000.000.000-00 — aplicado durante a digitação e na exibição de valores
 * já armazenados (o banco guarda só dígitos). Incompleto formata até onde der. */
export function formatCpf(value: string | null | undefined): string {
  const d = digitsOf(value, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

/** 00.000.000/0000-00 */
export function formatCnpj(value: string | null | undefined): string {
  const d = digitsOf(value, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
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
