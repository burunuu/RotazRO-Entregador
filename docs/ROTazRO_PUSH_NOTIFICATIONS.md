# Push Notifications — RotazRO Entregador

> Auditoria de 2026-09-15. Status: **preparado, desligado**. Único arquivo: `src/services/notifications.ts`.

## Estado real

```ts
const PUSH_NOTIFICATIONS_ENABLED = false
```

Todo o código (registro de token FCM, listeners de notificação, deep link para oferta, revogação no logout) existe e está correto na leitura de código, mas **nunca executa** hoje porque:

1. A flag acima está `false`.
2. Mesmo se fosse `true`, **não existe `google-services.json` no projeto Android** (confirmado: `find android -iname "google-services.json"` não retorna nada).

## Por que a flag existe (histórico)

Numa sessão anterior, o app crashava nativamente logo após o login. Diagnóstico: chamar qualquer API nativa do `@capacitor/push-notifications` (`checkPermissions`/`requestPermissions`/`register`) sem o Firebase inicializado (sem `google-services.json`) pode lançar uma `IllegalStateException` dentro do SDK do Firebase, numa thread nativa — **fora do alcance de qualquer `try/catch` em JavaScript**. A flag central foi a correção: nenhuma chamada nativa de push acontece sem ela.

## O que já está implementado (não testado em produção)

- `registerForPush(driverProfileId)`: pede permissão, registra no FCM, persiste o token em `public.driver_devices` (upsert por `push_token`).
- `onNotificationOpened(handler)`: assina toque em notificação, extrai `offer_id` do payload — mas **nunca confia no payload para exibir dados**, só usa para buscar o estado real via `fetchPendingOffer()` (documentado explicitamente no código).
- `unregisterPush()`: chamada no logout, revoga o token atual (`driver_devices.revoked_at`) e limpa notificações entregues.

## Tabela `driver_devices`

RLS: `driver manages own devices` (`ALL`, via `driver_profiles.user_id = auth.uid()`) — um entregador só vê/mexe nos próprios dispositivos. `anon` sem nenhum acesso. Hoje com **0 linhas** em produção (confirmado via `list_tables`) — nunca foi escrito porque o registro nunca roda.

## O que falta para ativar de verdade

1. Criar um projeto Firebase (ou reaproveitar um existente da organização).
2. Gerar `google-services.json` para `com.rotazro.entregador` e colocar em `android/app/`.
3. Configurar as credenciais de servidor FCM (para o Web/backend conseguir **enviar** push — hoje não existe nenhum código de ENVIO em lugar nenhum dos dois repos; só o recebimento está preparado no APK).
4. Trocar `PUSH_NOTIFICATIONS_ENABLED` para `true`.
5. Testar em dispositivo real (não em emulador — push FCM real precisa de Google Play Services).

## O que NÃO existe hoje

- Nenhum código de envio de push (nem Edge Function, nem qualquer chamada à API do FCM/Firebase Admin) em nenhum dos dois repositórios.
- Nenhuma UI de preferências de notificação para o entregador.
- Nenhum teste automatizado deste fluxo (natural, já que está desligado).
