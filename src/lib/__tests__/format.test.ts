import { describe, expect, it } from 'vitest'
import { formatBrazilPhone, formatCnpj, formatCpf } from '../format'

describe('formatCpf', () => {
  it('formata somente dígitos', () => expect(formatCpf('11144477735')).toBe('111.444.777-35'))
  it('aceita entrada já mascarada', () => expect(formatCpf('111.444.777-35')).toBe('111.444.777-35'))
  it('formata progressivamente valor incompleto', () => {
    expect(formatCpf('111')).toBe('111')
    expect(formatCpf('1114')).toBe('111.4')
    expect(formatCpf('1114447')).toBe('111.444.7')
    expect(formatCpf('111444777')).toBe('111.444.777')
    expect(formatCpf('1114447773')).toBe('111.444.777-3')
  })
  it('vazio/nulo vira string vazia e excesso é truncado', () => {
    expect(formatCpf('')).toBe('')
    expect(formatCpf(null)).toBe('')
    expect(formatCpf('111444777359999')).toBe('111.444.777-35')
  })
})

describe('formatBrazilPhone', () => {
  it('celular (11 dígitos) e fixo (10 dígitos)', () => {
    expect(formatBrazilPhone('69993870886')).toBe('(69) 99387-0886')
    expect(formatBrazilPhone('6939871234')).toBe('(69) 3987-1234')
  })
  it('entrada parcialmente mascarada e incompleta', () => {
    expect(formatBrazilPhone('(69) 99387-0886')).toBe('(69) 99387-0886')
    expect(formatBrazilPhone('699')).toBe('(69) 9')
    expect(formatBrazilPhone('6')).toBe('(6')
  })
  it('vazio', () => expect(formatBrazilPhone('')).toBe(''))
})

describe('formatCnpj', () => {
  it('formata somente dígitos', () => expect(formatCnpj('11222333000181')).toBe('11.222.333/0001-81'))
  it('aceita mascarado e incompleto', () => {
    expect(formatCnpj('11.222.333/0001-81')).toBe('11.222.333/0001-81')
    expect(formatCnpj('112223')).toBe('11.222.3')
    expect(formatCnpj('11222333000')).toBe('11.222.333/000')
  })
  it('vazio', () => expect(formatCnpj('')).toBe(''))
})
