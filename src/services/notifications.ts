import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import type { PushNotificationSchema, ActionPerformed, Token } from '@capacitor/push-notifications'
import { supabase } from '../lib/supabase'

/**
 * Push notifications (FCM via @capacitor/push-notifications). Preparação
 * local apenas: registro de token, persistência em driver_devices,
 * listeners de deep-link. O ENVIO real de push (credencial de servidor
 * FCM) ainda depende de um projeto Firebase configurado manualmente — ver
 * README/relatório final. Nada aqui contém segredo algum: o token do
 * dispositivo não é secreto (é escopado por app+dispositivo, revogável, e
 * só serve para RECEBER, nunca para enviar).
 */

let listenersRegistered = false
let currentPushToken: string | null = null

async function upsertDeviceToken(driverProfileId: string, token: string) {
  const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android'
  const { error } = await supabase.from('driver_devices').upsert(
    {
      driver_profile_id: driverProfileId,
      platform,
      push_token: token,
      last_seen_at: new Date().toISOString(),
      revoked_at: null,
    },
    { onConflict: 'push_token' },
  )
  if (error) throw error
}

async function revokeDeviceToken(token: string) {
  await supabase
    .from('driver_devices')
    .update({ revoked_at: new Date().toISOString() })
    .eq('push_token', token)
}

/**
 * Solicita permissão, registra no FCM e persiste o token. Não lança:
 * indisponibilidade de push (sem google-services.json configurado, sem
 * permissão, plataforma web) é degradação graciosa — o app continua
 * funcionando com o fallback de polling.
 */
export async function registerForPush(driverProfileId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  try {
    const permission = await PushNotifications.checkPermissions()
    let status = permission.receive
    if (status === 'prompt') {
      const requested = await PushNotifications.requestPermissions()
      status = requested.receive
    }
    if (status !== 'granted') return

    if (!listenersRegistered) {
      listenersRegistered = true

      PushNotifications.addListener('registration', (token: Token) => {
        currentPushToken = token.value
        void upsertDeviceToken(driverProfileId, token.value).catch((err) =>
          console.error('ERRO_REGISTRAR_PUSH_TOKEN:', err),
        )
      })

      PushNotifications.addListener('registrationError', (err) => {
        console.error('ERRO_REGISTRO_PUSH:', err)
      })
    }

    await PushNotifications.register()
  } catch (error) {
    console.error('ERRO_PUSH_SETUP:', error)
  }
}

/**
 * Assina o evento de toque na notificação. offerId nunca é confiado
 * diretamente para exibir dados — apenas usado para buscar o estado real
 * (fetchPendingOffer) e navegar até lá; uma oferta já expirada/aceita
 * aparece corretamente porque o estado é sempre refeito do banco.
 */
export function onNotificationOpened(handler: (offerId: string | null) => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {}

  const localHandler = (notification: PushNotificationSchema) => {
    const offerId = (notification.data as Record<string, unknown> | undefined)?.['offer_id']
    handler(typeof offerId === 'string' ? offerId : null)
  }
  const actionHandler = (action: ActionPerformed) => localHandler(action.notification)

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
  if (!Capacitor.isNativePlatform()) return
  try {
    await revokeCurrentDeviceToken(currentPushToken)
    currentPushToken = null
    const delivered = await PushNotifications.getDeliveredNotifications()
    await PushNotifications.removeAllDeliveredNotifications()
    void delivered
  } catch (error) {
    console.error('ERRO_UNREGISTER_PUSH:', error)
  }
}

export async function revokeCurrentDeviceToken(token: string | null): Promise<void> {
  if (!token) return
  await revokeDeviceToken(token).catch((err) => console.error('ERRO_REVOGAR_TOKEN:', err))
}
