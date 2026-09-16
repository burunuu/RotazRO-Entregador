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
