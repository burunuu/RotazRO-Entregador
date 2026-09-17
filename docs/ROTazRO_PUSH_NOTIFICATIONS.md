# Push Notifications — RotazRO Entregador

> Auditoria de 2026-09-15, arquitetura implementada em 2026-09-20, backend implantado e habilitado no mesmo dia (rodadas subsequentes). Status: **backend real no ar, `PUSH_NOTIFICATIONS_ENABLED = true`, faltando só o teste em device real**. Ver seção 4 para a correção de arquitetura do armazenamento do secret (GUC → Supabase Vault).

---

## 1. Estado real

```ts
// src/services/notifications.ts
const PUSH_NOTIFICATIONS_ENABLED = true
```

Todo o código do lado do APK (registro de token FCM, canal de notificação, listeners de deep-link, revogação no logout) existe, está habilitado, e o backend de envio real está implantado (seção 3):

1. `google-services.json` confirmado presente em `android/app/`, package `com.rotazro.entregador` validado.
2. Migration + Edge Function aplicadas/implantadas no projeto remoto (`haciigmaszlbevdzzmod`).
3. `FIREBASE_SERVICE_ACCOUNT_JSON`/`PUSH_NOTIFY_SECRET` configurados como secrets da Edge Function.
4. **Pendente**: inserir o mesmo `PUSH_NOTIFY_SECRET` no Supabase Vault (seção 4) — sem isso, o helper `notify_push_edge_function()` continua em no-op silencioso (nenhum push sai), exatamente como antes de qualquer configuração existir.

### Por que a flag existe (histórico)

Chamar qualquer API nativa do `@capacitor/push-notifications` sem o Firebase inicializado (sem `google-services.json`) pode lançar uma `IllegalStateException` dentro do SDK do Firebase, numa thread nativa — fora do alcance de qualquer `try/catch` em JavaScript, derrubando o app inteiro. A flag central é a proteção: nenhuma chamada nativa de push acontece sem ela. **Quando o arquivo existir, trocar para `true` — nenhuma outra mudança de código é necessária** (o plugin Gradle já está condicionalmente preparado, ver seção 2).

---

## 2. Android nativo — package e configuração

**Package confirmado**: `com.rotazro.entregador` (`android/app/build.gradle`, `applicationId`/`namespace`).

### Onde colocar o `google-services.json`

```
D:\RotazRO-Entregador\android\app\google-services.json
```

**Não crie este arquivo com conteúdo inventado.** Baixe o real do Firebase Console (Configurações do projeto → seus apps → app Android `com.rotazro.entregador` → "Baixar google-services.json") e salve exatamente nesse caminho.

### O que já estava pronto (confirmado por leitura, nada criado nesta rodada)

- **Plugin Gradle condicional** (`android/app/build.gradle`, já existia):
  ```groovy
  try {
    def servicesJSON = file('google-services.json')
    if (servicesJSON.text) {
      apply plugin: 'com.google.gms.google-services'
    }
  } catch(Exception e) {
    logger.info("google-services.json not found, google-services plugin not applied.")
  }
  ```
  O classpath (`classpath 'com.google.gms:google-services:4.4.4'`) já está no `android/build.gradle` de nível de projeto. **Build funciona igual com ou sem o arquivo** — confirmado (`assembleDebug` verde nesta rodada, sem o arquivo presente).

### O que foi adicionado nesta rodada (`AndroidManifest.xml`)

- `<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />` — obrigatória a partir do Android 13 (API 33) para o diálogo de permissão em runtime funcionar (`targetSdkVersion` deste projeto é 36). Sem isso, `PushNotifications.requestPermissions()` falharia silenciosamente em qualquer device Android 13+.
- `<meta-data android:name="com.google.firebase.messaging.default_notification_icon" ...>` apontando para o ícone do app já existente — usado pela mensageria nativa quando o app está em background (nesse caso a notificação é montada fora do código JS). Um ícone monocromático dedicado é a recomendação de design do Android, mas não bloqueia nada — o FCM já cai no ícone do app como fallback sem essa meta-data.

### Canal de notificação (novo nesta rodada)

`ensureNotificationChannel()` em `notifications.ts`, chamado uma vez após a permissão ser concedida — cria (ou reaproveita, é idempotente) o canal `delivery_offers` com importância alta (nível 4), necessário no Android 8+ para a notificação realmente alertar o entregador mesmo com o app em segundo plano.

### Nenhum SDK redundante

Só `@capacitor/push-notifications` (já instalado) + `com.google.gms:google-services` (Gradle, já presente). Nenhuma dependência nova adicionada no lado do cliente.

---

## 3. Arquitetura de envio (novo nesta rodada) — por que este desenho

**Pergunta a responder antes de implementar**: qual mecanismo server-side envia o push quando uma oferta/rota é criada, sem duplicar lógica e sem nunca colocar a credencial do Firebase no APK?

**Descoberta central da auditoria**: `delivery_offers` pode ser criada de **duas origens completamente diferentes**:
1. O Web app (`dispatch_route_regional`, chamado quando o restaurante clica "buscar entregador").
2. O **watchdog autônomo** (`recover_dispatch_state()`, rodando via `pg_cron` a cada minuto, **sem nenhuma requisição HTTP envolvida**) — é exatamente o mecanismo que recupera uma busca regional quando a aba do restaurante fechou.

Se o envio de push fosse acoplado só ao server function do Web (opção mais óbvia), **todo push da recuperação automática do watchdog seria perdido** — justamente o cenário em que o restaurante não está mais olhando e o push importaria mais.

**Decisão**: um **trigger no nível do banco** (`AFTER INSERT ON delivery_offers`) é o único ponto que vê as duas origens sem duplicar "lógica de enviar push" em dois lugares. Arquitetura completa:

```
delivery_offers INSERT (de qualquer origem)
        │
        ▼
trigger trg_delivery_offer_push()          ──► só dispara se status='pending'
        │
        ▼
notify_push_edge_function(payload)         ──► pg_net.http_post, fire-and-forget
        │                                       (nunca bloqueia/reverte a transação
        │                                        que criou a oferta — ver seção 7)
        ▼
Edge Function send-push-notification       ──► só aqui existe a credencial Firebase
        │
        ▼
driver_devices (SELECT via service_role)   ──► busca token(s) ativos do driver
        │
        ▼
Firebase Admin SDK → FCM HTTP v1 API       ──► envia a notificação de verdade
```

Mesmo padrão para rota atribuída direto pela loja (`routes` `AFTER INSERT OR UPDATE`, trigger `trg_route_assigned_push()`) — ver seção 5 para a complicação de identidade que essa segunda trigger precisa resolver.

### Por que não pg_net direto do Web/outra alternativa

- **Opção descartada — só o server function do Web chama a Edge Function diretamente**: mais simples de implementar, mas perde o caminho do watchdog (acima). Rejeitada.
- **Opção descartada — Database Webhooks do painel Supabase**: tecnicamente equivalente (compila para o mesmo `supabase_functions.http_request`/trigger por baixo), mas fica só na configuração do painel, não versionado em migration — preferi o trigger explícito em SQL para ficar revisável/testável como o resto do schema.
- **Escolhida — trigger + `pg_net`**: cobre as duas origens com uma lógica só, sem duplicar nada, testável localmente (seção 6).

---

## 4. Banco de dados — duas migrations, ambas aplicadas no projeto remoto

`D:\RotazRO\RotazRO\supabase\migrations\` (mora no repo Web, onde vive todo o schema compartilhado):

**`20260920000000_push_notifications.sql`** (aplicada):
1. **`GRANT SELECT, UPDATE ON driver_devices TO service_role`** — a Edge Function precisa ler tokens; `UPDATE` só para marcar `revoked_at` num token que o FCM reportou inválido. **Sem `INSERT`/`DELETE`** — criar/apagar um dispositivo continua sendo só do próprio driver, via a policy RLS já existente (`driver manages own devices`).
2. **`CREATE EXTENSION IF NOT EXISTS pg_net`** — extensão padrão do Supabase para chamadas HTTP assíncronas a partir de triggers/cron.
3. **`notify_push_edge_function(payload jsonb)`** — helper `SECURITY DEFINER` que chama `net.http_post`.
4. **`trg_delivery_offer_push()`** — dispara em toda oferta nova com `status='pending'`.
5. **`trg_route_assigned_push()`** — dispara quando uma rota é assinada diretamente (`status='confirmed'` + `driver_id` setado, sem que já exista um `delivery_offer` aceito pra essa rota — evita notificar duas vezes a mesma rota quando ela vem do fluxo regional).

**`20260920010000_push_notification_vault_config.sql`** (aplicada — corrige a estratégia de armazenamento do secret, ver seção abaixo). Só substitui o corpo de `notify_push_edge_function()` — as duas triggers, RLS, grants e `pg_net` da migration anterior continuam intocados.

### O problema de identidade que a trigger 5 precisa resolver

`confirm_route_tx` (fluxo "entregador da loja") atribui `routes.driver_id` referenciando `public.drivers` — uma identidade **diferente** de `driver_profiles`, que é o que `driver_devices` usa. A ponte entre as duas já existe: `restaurant_driver_links (driver_profile_id, drivers_id, status)`. A trigger faz esse join (`status = 'active'`) antes de notificar — sem ele, notificação nenhuma chegaria para um entregador de loja, mesmo com tudo mais configurado.

### Correção de arquitetura: GUC → Supabase Vault

A primeira versão de `notify_push_edge_function()` lia a URL/secret via `current_setting('app.settings.push_notify_url'/'push_notify_secret', true)`, configurável (na teoria) via `ALTER DATABASE postgres SET ...`. **Isso falhou no Supabase hospedado**: `ERROR: 42501: permission denied to set parameter "app.settings.push_notify_url"` — definir um parâmetro de nível de banco é uma operação de dono do banco/role que o Supabase hospedado não expõe à role `postgres` que as migrations/conexões deste projeto usam. Não foi contornado com superuser nem `ALTER ROLE`.

**Solução**: [Supabase Vault](https://supabase.com/docs/guides/database/vault) (`supabase_vault`, confirmado já habilitado neste projeto — schema `vault`, `vault.decrypted_secrets` com `SELECT` só para `postgres`/`service_role`, nenhum grant para `anon`/`authenticated`). `notify_push_edge_function()` agora lê `push_notify_secret` de `vault.decrypted_secrets` em vez de uma GUC. A URL **não é secreta** (mesmo project ref já visível em `supabase/config.toml` e em toda URL do painel) — mantida como literal versionado direto no corpo da função, em vez de uma segunda entrada no Vault (evita um segundo lookup sem ganho de segurança).

**O valor do secret nunca foi inserido por nenhuma migration** — isso teria que aparecer em texto no arquivo, indo pro Git. Em vez disso, o `INSERT` (via `select vault.create_secret(...)`) foi feito manualmente, uma única vez, direto no SQL Editor do Supabase.

---

## 5. Edge Function `send-push-notification` (implantada)

`D:\RotazRO\RotazRO\supabase\functions\send-push-notification\index.ts` — implantada com `supabase functions deploy send-push-notification --no-verify-jwt` (o `--no-verify-jwt` é necessário: o chamador é `pg_net` com um secret compartilhado próprio, não uma sessão de usuário do Supabase Auth — sem essa flag, o gateway da própria plataforma rejeitaria a chamada antes mesmo do código da função rodar).

- **Única credencial Firebase de todo o sistema**: lê `FIREBASE_SERVICE_ACCOUNT_JSON` (secret da Edge Function, nunca commitado, nunca vai para o APK).
- Verifica um `Authorization: Bearer <PUSH_NOTIFY_SECRET>` próprio (mesmo valor do secret no Vault) antes de fazer qualquer coisa — defesa extra além da verificação de JWT padrão do Supabase.
- Busca tokens ativos em `driver_devices` (client `service_role`, nunca o do chamador).
- Monta o conteúdo da notificação **inteiramente no servidor**, a partir só do `type` — nunca repassa nada do payload de entrada pro corpo da notificação (o payload da trigger já só tem ids, nunca dado de cliente).
- Usa `firebase-admin` (via `npm:` no Deno) para chamar a API HTTP v1 do FCM.
- Em erro de token inválido (`messaging/registration-token-not-registered`/`messaging/invalid-registration-token`): marca `revoked_at` — nunca deixa um token morto sendo tentado pra sempre.
- **Nunca loga o token completo** — só uma "fingerprint" (6 primeiros caracteres + tamanho). Mensagens de erro do Firebase são sanitizadas (`sanitizeErrorMessage()`, remove qualquer bloco PEM, trunca) antes de qualquer log.
- Testada ao vivo (sem token/device real): sem `Authorization` → 401; secret errado → 401; secret correto → autentica e chega até a query em `driver_devices` (confirmado nos logs reais da função, sem PII/token/secret neles).

---

## 6. Testado localmente (embedded-postgres)

**Migration original** (`...push_notifications.sql`) — 20 asserções contra um Postgres 18 real e isolado: grants exatos em `driver_devices`, condições das duas triggers, resolução da ponte de identidade via `restaurant_driver_links`, não-duplicação de push regional, rollback data-safe.

**Migration corretiva do Vault** (`...vault_config.sql`) — 11 asserções adicionais, usando um stub de `vault.decrypted_secrets` (mesma interface de leitura da extensão real — `name`/`decrypted_secret` — mas sem a criptografia via pgsodium, que é infraestrutura exclusiva da plataforma Supabase): no-op silencioso sem o secret no Vault, no-op também com secret vazio, chamada correta com URL/header/payload quando presente, grants de `EXECUTE` corretos (`anon`/`authenticated` sem acesso, `service_role` com acesso), rollback restaura a versão GUC anterior.

**Limitação conhecida (as duas rodadas)**: `pg_net` e `supabase_vault` — as extensões reais — **não estão disponíveis num Postgres vanilla local** (específicas da plataforma Supabase). A lógica de ambas foi validada contra stubs com a mesma interface de leitura/escrita; o comportamento real da infraestrutura (criptografia do Vault, entrega HTTP do pg_net) só é verificável depois de aplicado no projeto remoto — confirmado por leitura de metadata (`pg_extension`, grants, definição da função) após cada apply, não por execução local.

---

## 7. Push nunca é fonte da verdade (retry/fallback)

Se o FCM falhar, se `pg_net` falhar, se a Edge Function não estiver implantada — **nada disso afeta o dispatch**:
- `delivery_offer`/`routes` continuam existindo normalmente (a trigger roda `AFTER INSERT`, depois do commit da linha; e `notify_push_edge_function` tem seu próprio `EXCEPTION WHEN OTHERS` que nunca propaga).
- Realtime (`useDeliveryOffers`) e polling (5s/7s) continuam sendo os caminhos que realmente garantem que o entregador vê a oferta — push só acelera a percepção quando o app está fechado/em background.
- O watchdog (`recover_dispatch_state()`) continua funcionando exatamente como antes — a trigger nova roda numa transação separada da lógica de recovery, sem interferir nela.

---

## 8. Deduplicação Realtime vs Push (foreground)

**Não foi necessária nenhuma lógica de dedupe explícita.** `useDeliveryOffers`/`useAssignedRoute` guardam o estado num único slot (`offer`/`route`), não numa lista — Realtime e push convergem para a MESMA chamada (`fetchPendingOffer()`/`fetchMyActiveRoute()`), então não existe "segundo modal" possível estruturalmente: se o Realtime já populou o estado, o refetch disparado pelo push busca a mesma linha e produz o mesmo resultado. `onNotificationOpened` foi estendido para rotear por `type` (`offer_created` → `deliveryOffers.refetch()`, `route_assigned` → `assignedRoute.refetch()`), preservando essa garantia.

---

## 9. Fluxo de abertura (app aberto / background / fechado)

`registerForPush()`'s listeners (`pushNotificationReceived`, `pushNotificationActionPerformed`) são registrados assim que `driver` fica disponível após o login — o Capacitor entrega o evento de "ação" mesmo quando foi ele quem disparou o cold start (comportamento documentado do próprio SDK, nenhuma lógica adicional necessária aqui).

- **App aberto (foreground)**: `pushNotificationReceived` dispara → `refetch()` → dedupe natural (seção 8).
- **App em background**: a bandeja mostra a notificação nativa (canal `delivery_offers`); ao tocar, `pushNotificationActionPerformed` dispara com `source: 'opened'` → `refetch()` → se não encontrar nada (oferta expirada/aceita por outro/rota cancelada), **nenhum modal abre** — o estado correto (nada) já é o comportamento certo, sem precisar de uma tela de erro dedicada. `push.offer_stale_on_open` é logado nesse caso (seção 10).
- **App fechado (cold start)**: mesmo fluxo do "opened" acima, mais o `session restore` normal do Supabase Auth acontecendo primeiro — o listener só é registrado depois de `authenticated && driver` resolverem, então a ordem já é: restaura sessão → registra listener → processa a ação pendente do Capacitor.

**Nunca confia no payload da notificação para exibir dado nenhum** — `offerId`/`routeId` são só o gatilho para um refetch real (`fetchPendingOffer`/`fetchMyActiveRoute`), documentado explicitamente no código (`parseOpenedPayload`, `notifications.ts`).

### O que não foi validado em device real

Tela apagada / bateria otimizada / app encerrado pelo sistema / alternância dados móveis-Wi-Fi — nenhum desses cenários é testável sem um dispositivo Android real com Google Play Services e um projeto Firebase configurado (mesma limitação já aceita para GPS em background neste projeto). Uma vez que `google-services.json` exista e o DSN/config estejam completos, validar manualmente:
1. Tela apagada, app em background: push deve aparecer e tocar/vibrar conforme o canal.
2. App removido da lista de recentes (mas não forçado a parar): FCM em geral ainda entrega — mas otimização de bateria agressiva de fabricante (Xiaomi/Samsung/etc.) pode atrasar ou suprimir; sem solução de código para isso, é orientação ao usuário (desativar otimização de bateria pro app).
3. Dados móveis vs Wi-Fi: sem diferença esperada — FCM usa a conexão persistente do Google Play Services, não depende do tipo de rede do app.

---

## 10. Observabilidade — eventos novos

| Evento | Nível | Onde |
|---|---|---|
| `push.token_registered` | info | `notifications.ts`, após upsert bem-sucedido em `driver_devices` — nunca loga o token. |
| `push.permission_denied` | warn | `notifications.ts` — usuário negou, não é bug. |
| `push.notification_opened` | info | `notifications.ts` — toda vez que uma notificação chega/é tocada, com `type` e `source` (`received`/`opened`). |
| `push.offer_stale_on_open` | info | `App.tsx` — usuário tocou a notificação mas o refetch não encontrou nada pendente (oferta/rota já resolvida por outro caminho). |
| `push.setup_failed`, `push.registration_failed`, `push.register_token_failed`, `push.unregister_failed`, `push.revoke_token_failed` | **error (Sentry)** | `notifications.ts` — já existiam. |
| `push.unauthorized_call`, `push.no_active_device`, `push.notification_sent`, `push.token_invalidated`, `push.send_failed` | info/warn/error | **Edge Function** (`send-push-notification`) — log JSON estruturado próprio (mesmo formato `{level, event, time, ...}` do `logger.ts`, mas escrito diretamente porque o runtime Deno da Edge Function não compartilha módulos com o app). `push.send_failed` é o único que deveria eventualmente ir para o Sentry — não implementado nesta rodada (exigiria um SDK Sentry compatível com Deno na função; documentado como possível P1). |

**Nunca**: token completo em nenhum log, nem no APK nem na Edge Function.

---

## 11. Segurança — checklist

| Requisito | Status |
|---|---|
| Restaurante não lê `driver_devices` | ✅ já garantido pela RLS existente (`driver_profiles.user_id = auth.uid()` — identidade, não papel; um usuário de restaurante nunca tem uma linha correspondente em `driver_profiles`). |
| Driver só gerencia o próprio device | ✅ mesma policy, `FOR ALL`. |
| `anon` sem acesso | ✅ confirmado (`REVOKE ALL ... FROM anon`, já existia). |
| `service_role`/backend envia push | ✅ novo grant `SELECT, UPDATE` (não `INSERT`/`DELETE` — client continua dono da criação/remoção). |
| Token nunca vai para logs/Sentry | ✅ `tokenFingerprint()` na Edge Function; `notifications.ts` nunca loga `token.value`/`push_token`. |
| Token nunca aparece em mensagem de erro | ✅ todo `captureError`/`log` de erro de push carrega só o id do driver e (quando aplicável) a fingerprint, nunca o valor bruto. |
| Credencial Firebase nunca no APK | ✅ existe só como secret da Edge Function — o cliente nunca a recebe, nunca a solicita. |

---

## 12. Testes

`src/services/__tests__/notifications.test.ts` (novo) — cobre a única parte deste módulo que não depende de device/native runtime: `parseOpenedPayload()` (roteamento `offer_created`/`route_assigned`/`unknown`, extração segura de id, nunca confia num campo não-string, preserva `source`). 5 testes.

Migration: 20 asserções via embedded-postgres (seção 6).

### O que não é testável sem device/Firebase reais (mesma categoria já aceita para GPS neste projeto)

`PUSH_NOTIFICATIONS_ENABLED = false` faz todo o corpo de `registerForPush`/`onNotificationOpened`/`unregisterPush` retornar cedo — testar permissão concedida/negada, registro de token real, revogação real no logout, e "push não quebra o dispatch" de ponta a ponta exigiria (a) um emulador/device Android com Google Play Services, e (b) um projeto Firebase configurado — nenhum dos dois disponível nesta sessão. Cobertos, em vez disso, por: leitura de código (todo `try/catch` já confirmado não-propagante), e a checklist manual abaixo.

### Checklist manual (rodar depois que `google-services.json` + Edge Function implantada existirem)

1. Permissão concedida → token aparece em `driver_devices`.
2. Permissão negada → app funciona normalmente, `push.permission_denied` logado.
3. Logout → token revogado (`revoked_at` setado), sem push chegando depois.
4. Nova oferta, app aberto → modal via Realtime, push chega depois sem duplicar.
5. Nova oferta, app em background → notificação na bandeja, toque abre o modal correto.
6. Oferta expira antes do toque → toque não abre modal inválido, `push.offer_stale_on_open` logado.
7. Rota atribuída direto (loja) → notificação "Nova rota atribuída", toque abre Minha Rota.
8. Falha proposital no envio (ex.: `FIREBASE_SERVICE_ACCOUNT_JSON` inválido) → oferta continua existindo, Realtime/polling continuam funcionando.

---

## 13. Status — o que já foi feito vs. o que ainda falta

**Já feito** (rodadas de 2026-09-20):
1. ✅ Projeto Firebase criado para `com.rotazro.entregador`, `google-services.json` colocado em `android/app/`.
2. ✅ `PUSH_NOTIFICATIONS_ENABLED = true`.
3. ✅ Edge Function implantada (`supabase functions deploy send-push-notification --no-verify-jwt`).
4. ✅ `FIREBASE_SERVICE_ACCOUNT_JSON`/`PUSH_NOTIFY_SECRET` configurados como secrets da Edge Function.
5. ✅ Ambas as migrations aplicadas no banco remoto (`20260920000000_push_notifications.sql` e a correção `20260920010000_push_notification_vault_config.sql`).
6. ✅ `PUSH_NOTIFY_SECRET` inserido no Supabase Vault manualmente via SQL Editor (`select vault.create_secret(...)`), com o mesmo valor do secret da Edge Function.

**Falta**:
1. Testar em dispositivo real (não emulador — push FCM real precisa de Google Play Services) — checklist completo na seção 12.

Depois de validar em device, o próximo passo natural é abrir PR/merge dos commits desta rodada (não feito automaticamente — ver relatório da sessão).
