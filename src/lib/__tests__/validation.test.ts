import { describe, expect, it } from 'vitest'
import { isValidBrazilianPhone, isValidCpf, normalizeEmail } from '../validation'

describe('isValidCpf', () => {
  it('accepts a valid CPF, with or without formatting', () => {
    expect(isValidCpf('123.456.789-09')).toBe(true)
    expect(isValidCpf('12345678909')).toBe(true)
  })

  it('rejects a wrong check digit', () => {
    expect(isValidCpf('123.456.789-00')).toBe(false)
  })

  it('rejects an all-same-digit sequence', () => {
    expect(isValidCpf('111.111.111-11')).toBe(false)
    expect(isValidCpf('00000000000')).toBe(false)
  })

  it('rejects the wrong number of digits', () => {
    expect(isValidCpf('123.456.789')).toBe(false)
    expect(isValidCpf('')).toBe(false)
  })
})

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Entregador@Example.COM  ')).toBe('entregador@example.com')
  })
})

describe('isValidBrazilianPhone', () => {
  it('accepts a valid mobile (11 digits) and landline (10 digits)', () => {
    expect(isValidBrazilianPhone('(69) 99999-0000')).toBe(true)
    expect(isValidBrazilianPhone('(69) 3870-8886')).toBe(true)
  })

  it('rejects an invalid DDD or wrong length', () => {
    expect(isValidBrazilianPhone('(00) 99999-0000')).toBe(false)
    expect(isValidBrazilianPhone('99999-0000')).toBe(false)
  })
})
