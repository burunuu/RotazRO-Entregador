import { onlyDigits } from './format'

/** Normaliza um e-mail para comparação (o backend usa a mesma regra —
 * lower(trim(email)) — ao resolver convites de restaurante_driver_invites). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Validação de CPF por dígitos verificadores (não consulta a Receita —
 * apenas garante que o número tem o formato/checksum correto). */
export function isValidCpf(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 11) return false
  // Sequências com todos os dígitos iguais passam no checksum mas nunca são CPFs reais.
  if (/^(\d)\1{10}$/.test(digits)) return false

  function checkDigit(base: string): number {
    let sum = 0
    for (let i = 0; i < base.length; i++) {
      sum += Number(base[i]) * (base.length + 1 - i)
    }
    const remainder = (sum * 10) % 11
    return remainder === 10 ? 0 : remainder
  }

  const firstCheck = checkDigit(digits.slice(0, 9))
  if (firstCheck !== Number(digits[9])) return false

  const secondCheck = checkDigit(digits.slice(0, 10))
  if (secondCheck !== Number(digits[10])) return false

  return true
}

/** Telefone BR: 10 dígitos (fixo, DDD + 8) ou 11 (celular, DDD + 9), DDD entre 11 e 99. */
export function isValidBrazilianPhone(value: string): boolean {
  const digits = onlyDigits(value)
  if (digits.length !== 10 && digits.length !== 11) return false
  const ddd = Number(digits.slice(0, 2))
  return ddd >= 11 && ddd <= 99
}
