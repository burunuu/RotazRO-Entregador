type ActiveRouteBlockedModalProps = {
  onGoToRoute: () => void
  onClose: () => void
}

/**
 * Substitui o banner discreto de "rota ativa" que existia antes: um popup
 * bem visível, com uma única ação clara (ir para a rota em aberto) — o
 * entregador não deveria conseguir ignorar isso e continuar clicando em
 * "Encerrar trabalho" sem perceber. A checagem que decide SE isso abre é
 * feita a cada clique, sempre contra o estado real do banco (nunca contra
 * o cache do polling de 7s de useAssignedRoute) — ver App.tsx, handler do
 * botão "Encerrar trabalho".
 */
export function ActiveRouteBlockedModal({ onGoToRoute, onClose }: ActiveRouteBlockedModalProps) {
  return (
    <div className="offer-modal-backdrop" role="presentation">
      <section className="offer-modal card" role="dialog" aria-modal="true" aria-label="Rota ativa">
        <p className="eyebrow">ROTA ATIVA</p>
        <h2>Você possui uma rota ativa.</h2>
        <p className="description">Finalize a rota antes de encerrar o trabalho.</p>

        <div className="offer-modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Fechar
          </button>
          <button type="button" onClick={onGoToRoute}>
            Ir para rota em aberto
          </button>
        </div>
      </section>
    </div>
  )
}
