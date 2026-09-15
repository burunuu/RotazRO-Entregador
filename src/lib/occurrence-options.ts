export const OCCURRENCE_OPTIONS: { value: string; label: string }[] = [
  { value: 'customer_absent', label: 'Cliente ausente' },
  { value: 'no_answer', label: 'Não atendeu' },
  { value: 'wrong_address', label: 'Endereço incorreto' },
  { value: 'refused', label: 'Cliente recusou' },
  { value: 'reschedule', label: 'Reagendar' },
  { value: 'other', label: 'Outro' },
]

export const OCCURRENCE_LABELS: Record<string, string> = Object.fromEntries(
  OCCURRENCE_OPTIONS.map((o) => [o.value, o.label]),
)
