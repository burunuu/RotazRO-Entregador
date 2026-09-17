import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import type { PushNotificationSchema, ActionPerformed, Token } from '@capacitor/push-notifications'
import { supabase } from '../lib/supabase'
import { captureError, captureMessage } from '../lib/observability/capture'
import { logger } from '../lib/observability/logger'

/**
 * Push notifications (FCM via @capacitor/push-notifications). Preparação
 * local apenas: registro de token, persistência em driver_devices,
 * listeners de deep-link. O ENVIO real de push (credencial de servidor
 * FCM) ainda depende de um projeto Firebase configurado manualmente — ver
 * README/relatório final. Nada aqui contém segredo algum: o token do
 * dispositivo não é secreto (é escopado por app+dispositivo, revogável, e
 * só serve para RECEBER, nunca para enviar).
 */

/**
 * Habilitado em 2026-09-20: `google-services.json` confirmado presente em
 * `android/app/`, JSON válido, `package_name` confere com
 * `com.rotazro.entregador` (validado por script, sem imprimir nenhum campo
 * sensível do arquivo). Backend remoto (migration + Edge Function +
 * secrets + settings do banco) configurado na mesma rodada — ver
 * docs/ROTazRO_PUSH_NOTIFICATIONS.md.
 *
 * Histórico da flag: chamar qualquer API nativa de push
 * (checkPermissions/requestPermissions/register) sem o FirebaseApp
 * inicializado (sem `google-services.json`) podia lançar uma
 * IllegalStateException dentro do SDK do Firebase numa thread nativa, fora
 * do alcance de qualquer try/catch em JavaScript — derrubando o app
 * inteiro. Essa condição não existe mais.
 */
const PUSH_NOTIFICATIONS_ENABLED = true

/** How long to wait for the native 'registration'/'registrationError' callback
 * before logging that it never came — some Android/Google Play Services
 * combinations (e.g. emulators without a genuine, signed-in Play Store) can
 * leave PushNotifications.register() hanging with neither event ever firing. */
const PUSH_REGISTRATION_TIMEOUT_S = 15

/**
 * TEMPORARY diagnostic instrumentation for the "driver_devices stays empty"
 * investigation — set VITE_PUSH_DIAGNOSTICS=1 to make the FCM registration
 * flow's critical states show up as Sentry Issues (not the separate Sentry
 * Logs product, which stays off — see capture.ts's captureMessage). Off by
 * default: adds zero events, zero overhead. Remove this flag and the diag()/
 * diagError() calls once registration is confirmed working end to end on a
 * real device.
 */
const PUSH_DIAGNOSTICS_ENABLED = import.meta.env.VITE_PUSH_DIAGNOSTICS === '1'

function diag(event: string, context: Parameters<typeof captureMessage>[1] = {}) {
  if (!PUSH_DIAGNOSTICS_ENABLED) return
  captureMessage(event, context)
}

function diagError(error: unknown, context: Parameters<typeof captureError>[1] = {}) {
  if (!PUSH_DIAGNOSTICS_ENABLED) return
  captureError(error, { ...context, force: true })
}

let listenersRegistered = false
let currentPushToken: string | null = null

/**
 * Persiste o token via RPC (register_my_driver_device — ver migration
 * 20260920030000), não por INSERT/UPSERT direto na tabela. A RPC deriva o
 * driver_profile_id do próprio auth.uid() internamente e ignora qualquer id
 * vindo do cliente — `driverProfileId` aqui serve só para marcar os eventos
 * de diagnóstico no Sentry, nunca é enviado ao banco. Isso elimina de raiz a
 * classe de bug em que este parâmetro acaba sendo drivers.id em vez de
 * driver_profiles.id (o que já aconteceu — ver commit que introduziu esta
 * RPC): mesmo que aconteça de novo, a RPC simplesmente ignora o valor.
 */
async function upsertDeviceToken(driverProfileId: string, token: string) {
  const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android'
  const { error } = await supabase.rpc('register_my_driver_device', {
    _push_token: token,
    _platform: platform,
  })
  if (error) {
    diagError(error, { event: 'push.device_save_error', driver_profile_id: driverProfileId, extra: { platform } })
    throw error
  }
  // Never logs the token itself — event + driver id is enough to confirm
  // "registration worked" without turning the log into a token dump.
  logger.info('push.token_registered', { platform })
  diag('push.device_save_success', { driver_profile_id: driverProfileId, extra: { platform } })
}

/** Único canal usado hoje — importância alta porque uma oferta expira em
 * poucos minutos, o entregador precisa perceber a notificação mesmo com o
 * app em segundo plano. Chamado uma vez por sessão de registro; criar um
 * canal já existente (mesmo id) é uma no-op no Android, não duplica nada. */
async function ensureNotificationChannel() {
  if (Capacitor.getPlatform() !== 'android') return
  try {
    await PushNotifications.createChannel({
      id: 'delivery_offers',
      name: 'Ofertas e rotas',
      description: 'Novas ofertas de entrega e rotas atribuídas',
      importance: 4,
      visibility: 1,
    })
  } catch (error) {
    captureError(error, { event: 'push.setup_failed', extra: { stage: 'create_channel' } })
  }
}

async function revokeDeviceToken(token: string) {
  // RPC (revoke_my_driver_device) rather than a direct UPDATE — same
  // rationale as register_my_driver_device: it only ever touches a device
  // row whose driver_profiles.user_id is the caller's own auth.uid().
  await supabase.rpc('revoke_my_driver_device', { _push_token: token })
}

/**
 * Solicita permissão, registra no FCM e persiste o token. Não lança:
 * indisponibilidade de push (sem google-services.json configurado, sem
 * permissão, plataforma web) é degradação graciosa — o app continua
 * funcionando com o fallback de polling.
 */
export async function registerForPush(driverProfileId: string): Promise<void> {
  if (!Capacitor.isNativePlatform() || !PUSH_NOTIFICATIONS_ENABLED) return

  diag('push.registration_started', { driver_profile_id: driverProfileId })

  try {
    const permission = await PushNotifications.checkPermissions()
    let status = permission.receive
    if (status === 'prompt') {
      const requested = await PushNotifications.requestPermissions()
      status = requested.receive
    }
    diag('push.permission_result', { driver_profile_id: driverProfileId, extra: { status } })
    if (status !== 'granted') {
      // Usuário negou — escolha dele, não um bug do app (mesmo padrão já
      // usado para permissão de GPS em App.tsx).
      logger.warn('push.permission_denied', { status })
      return
    }

    await ensureNotificationChannel()

    if (!listenersRegistered) {
      listenersRegistered = true

      PushNotifications.addListener('registration', (token: Token) => {
        currentPushToken = token.value
        // Never the token itself — see upsertDeviceToken's own comment.
        diag('push.registration_success', { driver_profile_id: driverProfileId })
        void upsertDeviceToken(driverProfileId, token.value).catch((err) =>
          captureError(err, { event: 'push.register_token_failed' }),
        )
      })

      PushNotifications.addListener('registrationError', (err) => {
        captureError(err, { event: 'push.registration_failed' })
        diagError(err, { event: 'push.registration_error', driver_profile_id: driverProfileId })
      })
    }

    await PushNotifications.register()
    setTimeout(() => {
      if (!currentPushToken) {
        logger.warn('push.registration_timeout', { seconds: PUSH_REGISTRATION_TIMEOUT_S })
        diag('push.registration_timeout', {
          driver_profile_id: driverProfileId,
          extra: { seconds: PUSH_REGISTRATION_TIMEOUT_S },
          level: 'warning',
        })
      }
    }, PUSH_REGISTRATION_TIMEOUT_S * 1000)
  } catch (error) {
    captureError(error, { event: 'push.setup_failed' })
  }
}

/** Payload que o backend efetivamente envia (ver
 * supabase/functions/send-push-notification/index.ts do repo Web) — só
 * ids, nunca dado do cliente/pedido. `offerId`/`routeId` nunca são
 * confiados diretamente para exibir nada: servem só de gatilho para buscar
 * o estado real no backend (fetchPendingOffer/fetchMyActiveRoute) — uma
 * oferta/rota já expirada/aceita/cancelada aparece corretamente porque o
 * estado é sempre refeito do banco, nunca lido do payload da notificação. */
export type PushSource = 'received' | 'opened'

export type PushOpenedPayload =
  | { type: 'offer_created'; offerId: string | null; source: PushSource }
  | { type: 'route_assigned'; routeId: string | null; source: PushSource }
  | { type: 'unknown'; source: PushSource }

/** Exported for unit testing (see __tests__/notifications.test.ts) — pure
 * function, no Capacitor/native dependency, so it's the one part of this
 * module directly testable without a device/emulator. */
export function parseOpenedPayload(notification: PushNotificationSchema, source: PushSource): PushOpenedPayload {
  const data = notification.data as Record<string, unknown> | undefined
  const type = data?.['type']
  if (type === 'offer_created') {
    const offerId = data?.['offer_id']
    return { type, offerId: typeof offerId === 'string' ? offerId : null, source }
  }
  if (type === 'route_assigned') {
    const routeId = data?.['route_id']
    return { type, routeId: typeof routeId === 'string' ? routeId : null, source }
  }
  return { type: 'unknown', source }
}

/** Assina o evento de toque/recebimento de notificação — ver PushOpenedPayload.
 * `source: 'opened'` (usuário tocou a notificação, ActionPerformed) é
 * distinto de `'received'` (chegou com o app já em primeiro plano) — só o
 * primeiro caso justifica logar `push.offer_stale_on_open` se o refetch não
 * encontrar mais nada (ver App.tsx). */
export function onNotificationOpened(handler: (payload: PushOpenedPayload) => void): () => void {
  if (!Capacitor.isNativePlatform() || !PUSH_NOTIFICATIONS_ENABLED) return () => {}

  const makeHandler = (source: PushSource) => (notification: PushNotificationSchema) => {
    const payload = parseOpenedPayload(notification, source)
    logger.info('push.notification_opened', { type: payload.type, source })
    handler(payload)
  }
  const localHandler = makeHandler('received')
  const actionHandler = (action: ActionPerformed) => makeHandler('opened')(action.notification)

  const localSub = PushNotifications.addListener('pushNotificationReceived', localHandler)
  const actionSub = PushNotifications.addListener('pushNotificationActionPerformed', actionHandler)

  return () => {
    void localSub.then((h) => h.remove())
    void actionSub.then((h) => h.remove())
  }
}

/**
 * Chamar no logout: revoga o token atual em driver_devices (para que ofertas
 * parem de chegar a este dispositivo assim que o entregador sai da conta) e
 * limpa notificações já entregues. Não lança — logout não pode falhar por
 * causa de push.
 */
export async function unregisterPush(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !PUSH_NOTIFICATIONS_ENABLED) return
  try {
    await revokeCurrentDeviceToken(currentPushToken)
    currentPushToken = null
    const delivered = await PushNotifications.getDeliveredNotifications()
    await PushNotifications.removeAllDeliveredNotifications()
    void delivered
  } catch (error) {
    captureError(error, { event: 'push.unregister_failed' })
  }
}

export async function revokeCurrentDeviceToken(token: string | null): Promise<void> {
  if (!token) return
  await revokeDeviceToken(token).catch((err) => captureError(err, { event: 'push.revoke_token_failed' }))
}
