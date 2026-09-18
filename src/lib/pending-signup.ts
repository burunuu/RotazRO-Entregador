import { completeDriverSignup } from '../services/driver-identity'
import { captureError } from './observability/capture'

const STORAGE_KEY = 'rotazro.pending_driver_signup'

type PendingSignup = { email: string; fullName: string; cpf: string; phone: string }

/**
 * Guarda nome/CPF/telefone quando o cadastro (SignUpScreen) termina sem
 * sessão ativa — projeto com confirmação de e-mail ligada. Resolvido por
 * resolvePendingSignup() no primeiro login seguinte.
 */
export function savePendingSignup(data: PendingSignup) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (error) {
    captureError(error, { event: 'auth.save_pending_signup_failed' })
  }
}

/**
 * Chamada depois de qualquer login bem-sucedido — barata e idempotente
 * quando não há nada pendente, e só age se o e-mail pendente bater com o
 * e-mail que acabou de entrar.
 * ponytail: localStorage é por aparelho — confirmar o e-mail e entrar de
 * outro aparelho deixa nome/CPF/telefone em branco (preenchíveis depois em
 * "Meu perfil"). Upgrade: mover isso para uma tabela no backend se isso se
 * mostrar comum na prática.
 */
export async function resolvePendingSignup(loggedInEmail: string): Promise<void> {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return
  }
  if (!raw) return

  try {
    const pending = JSON.parse(raw) as PendingSignup
    if (pending.email !== loggedInEmail.trim().toLowerCase()) return
    await completeDriverSignup(pending.fullName, pending.cpf, pending.phone)
    localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    captureError(error, { event: 'auth.resolve_pending_signup_failed' })
  }
}
