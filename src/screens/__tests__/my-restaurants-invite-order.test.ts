import { describe, expect, it } from 'vitest'
import source from '../MyRestaurantsScreen.tsx?raw'

/**
 * Convite de vínculo: Recusar à esquerda, Aceitar à direita (a grade
 * `.restaurant-invite-actions` posiciona os filhos na ordem do DOM).
 * Só a ordem visual muda — handlers, textos e classes são os mesmos.
 */
describe('convites de vínculo: ordem dos botões', () => {
  const actions = source.slice(source.indexOf('restaurant-invite-actions'))
  const decline = actions.indexOf('respond(r.organization_id, false)')
  const accept = actions.indexOf('respond(r.organization_id, true)')

  it('F) Recusar vem antes (esquerda) e Aceitar depois (direita)', () => {
    expect(decline).toBeGreaterThan(-1)
    expect(accept).toBeGreaterThan(decline)
    expect(actions.indexOf("'Recusar'")).toBeLessThan(actions.indexOf("'Aceitar'"))
  })

  it('cada botão mantém o próprio handler e estilo (Recusar secundário, Aceitar primário)', () => {
    const declineButton = actions.slice(0, accept)
    const acceptButton = actions.slice(accept, actions.indexOf('</div>'))
    expect(declineButton).toContain('className="secondary"')
    expect(declineButton).toContain("'Recusando...'")
    expect(acceptButton).not.toContain('className="secondary"')
    expect(acceptButton).toContain("'Aceitando...'")
    expect(source.match(/respond\(r\.organization_id, (true|false)\)/g)).toHaveLength(2)
  })

  it('o grid de ações continua com duas colunas iguais', () => {
    expect(source).toContain('restaurant-invite-actions')
  })
})
