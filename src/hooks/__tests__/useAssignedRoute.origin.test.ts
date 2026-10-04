import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * "Nova rota atribuída" só deve aparecer para rota atribuída diretamente pelo
 * restaurante (entregador da loja). Quem aceitou uma oferta (regional/externo)
 * não recebe o aviso. A origem vem de delivery_offers.status='accepted', a
 * mesma tabela que accept_delivery_offer grava junto com a atribuição.
 */

const captureErrorMock = vi.fn()
vi.mock('../../lib/observability/capture', () => ({
  captureError: (...args: unknown[]) => captureErrorMock(...args),
  captureMessage: vi.fn(),
}))

// Query builder de verdade (thenable, como o do supabase-js): registra cada
// .eq() e resolve no await.
let offersResult: { data: { id: string }[] | null; error: unknown }
const calls: { table: string; select: string; eq: [string, unknown][]; limit?: number } = {
  table: '',
  select: '',
  eq: [],
}
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      calls.table = table
      calls.eq = []
      const builder = {
        select: (cols: string) => {
          calls.select = cols
          return builder
        },
        eq: (col: string, val: unknown) => {
          calls.eq.push([col, val])
          return builder
        },
        limit: (n: number) => {
          calls.limit = n
          return builder
        },
        then: (resolve: (v: typeof offersResult) => unknown) => resolve(offersResult),
      }
      return builder
    },
  },
}))

import { classifyNewActiveRoute } from '../useAssignedRoute'
import { wasRouteAcceptedViaOffer } from '../../services/dispatch'

beforeEach(() => {
  captureErrorMock.mockReset()
  offersResult = { data: [], error: null }
})

describe('wasRouteAcceptedViaOffer', () => {
  it('consulta só ofertas ACEITAS daquela rota', async () => {
    offersResult = { data: [{ id: 'offer-1' }], error: null }
    expect(await wasRouteAcceptedViaOffer('route-1')).toBe(true)
    expect(calls.table).toBe('delivery_offers')
    expect(calls.eq).toEqual([
      ['route_id', 'route-1'],
      ['status', 'accepted'],
    ])
  })

  it('sem oferta aceita → false (rota atribuída direto pelo restaurante)', async () => {
    expect(await wasRouteAcceptedViaOffer('route-1')).toBe(false)
  })

  it('erro de consulta é propagado (quem chama decide)', async () => {
    offersResult = { data: null, error: new Error('rls') }
    await expect(wasRouteAcceptedViaOffer('route-1')).rejects.toThrow('rls')
  })
})

describe('classifyNewActiveRoute', () => {
  it('A) entregador VINCULADO, rota atribuída direto (sem oferta aceita) → aviso aparece', async () => {
    const lookup = vi.fn().mockResolvedValue(false)
    expect(await classifyNewActiveRoute('route-1', lookup)).toBe('announce')
    expect(lookup).toHaveBeenCalledWith('route-1')
  })

  it('B) entregador EXTERNO que aceitou a oferta → aviso suprimido', async () => {
    expect(await classifyNewActiveRoute('route-1', vi.fn().mockResolvedValue(true))).toBe('silent')
  })

  it('usando a consulta real: oferta aceita → silent; sem oferta → announce', async () => {
    offersResult = { data: [{ id: 'o' }], error: null }
    expect(await classifyNewActiveRoute('route-1')).toBe('silent')
    offersResult = { data: [], error: null }
    expect(await classifyNewActiveRoute('route-1')).toBe('announce')
  })

  it('origem desconhecida (erro) → retry: nem avisa nem suprime, e o erro é registrado', async () => {
    const boom = new Error('network')
    const decision = await classifyNewActiveRoute('route-1', vi.fn().mockRejectedValue(boom))
    expect(decision).toBe('retry')
    expect(captureErrorMock).toHaveBeenCalledWith(boom, {
      event: 'route.assigned_route_origin_lookup_failed',
    })
  })

  it('C) a decisão é por rota e idempotente: a mesma rota nunca vira dois avisos', async () => {
    const lookup = vi.fn().mockResolvedValue(false)
    const seen = new Set<string>()
    const announced: string[] = []
    // mesma regra do poll(): só classifica rota ainda não vista
    for (let tick = 0; tick < 3; tick++) {
      if (!seen.has('route-1')) {
        const decision = await classifyNewActiveRoute('route-1', lookup)
        if (decision !== 'retry') {
          seen.add('route-1')
          if (decision === 'announce') announced.push('route-1')
        }
      }
    }
    expect(announced).toEqual(['route-1'])
    expect(lookup).toHaveBeenCalledTimes(1)
  })
})
