# GPS e Localização — RotazRO Entregador

> Auditoria de 2026-09-15. Todo o código citado está em `src/App.tsx` (não modularizado — é o maior bloco de lógica do arquivo, linhas ~1220-1730).

## Duas camadas de GPS

1. **Foreground** (`@capacitor/geolocation`): usada só para pegar a posição inicial ao tocar "Iniciar trabalho" (`Geolocation.getCurrentPosition`, `enableHighAccuracy: true`, `timeout: 15000ms`).
2. **Background** (`@capgo/background-geolocation`): o watcher real, contínuo, que funciona com o app minimizado ou a tela apagada. Configurado com `minIntervalMs: LOCATION_SYNC_INTERVAL_MS` (8000ms) e `distanceFilter: 0` (não filtra por distância, só por tempo).

Ambas escrevem no mesmo estado local e disparam o mesmo envio ao Supabase (`sendLocationToSupabase`).

## Fluxo "Iniciar trabalho" → GPS ativo

1. `startGps()` pede permissão (`Geolocation.checkPermissions`/`requestPermissions`).
2. Pega uma posição única em foreground (`getCurrentPosition`) para preencher a tela imediatamente.
3. Para qualquer watcher de background pré-existente (`BackgroundGeolocation.stop()`, silencioso se falhar).
4. Inicia `BackgroundGeolocation.start(...)` com notificação persistente ("Sua localização está ativa enquanto você realiza entregas.") — obrigatória no Android para manter um foreground service de localização vivo (`foregroundServiceType="location"`, declarado no manifest do próprio plugin, mesclado automaticamente no build).
5. Cada posição do watcher de background chama `saveBackgroundPosition` → `sendLocationToSupabase`.

"Encerrar trabalho" (`stopGps`) chama `BackgroundGeolocation.stop()` e zera o estado local.

## Throttle e validação antes de gravar

`sendLocationToSupabase` (linha ~1222):

- **Throttle duplo**: ignora chamadas se `(agora - última tentativa) < 8000ms` OU se já existe um envio em voo (`locationSyncInFlight`) — evita rajada de RPCs se o watcher disparar mais rápido que o esperado.
- **Validação de faixa**: rejeita (lança erro local, nunca chega a chamar o RPC) latitude fora de [-90,90] ou longitude fora de [-180,180]. `accuracy`/`speed`/`heading` são normalizados para `null` se não-finitos ou negativos (heading também precisa ser `< 360`).
- Essas mesmas faixas são re-validadas no banco via `CHECK` constraints em `driver_live_locations`/`driver_presence` (defesa em profundidade — mesmo que o cliente mude, o banco não aceita lixo).

## Onde a posição é gravada (dois destinos, um envio)

Cada envio bem-sucedido grava em **dois lugares**, sequencialmente:

1. **`update_my_driver_location`** (RPC, `SECURITY DEFINER`, `search_path` fixo) → grava em `public.driver_live_locations` (chave primária `driver_id`, upsert implícito). Este é o caminho **legado**, ligado ao modelo "entregador de loja" (`drivers.id`, não `driver_profiles.id`). O `driver_id` nunca vem do cliente — o RPC resolve a partir de `auth.uid()` internamente (não passar o ID pelo frontend é uma decisão de segurança documentada no `CLAUDE.md` do repo).
2. **`updateMyPresence('online', ...)`** (via `services/presence.ts` → RPC `update_my_presence`) → grava em `public.driver_presence` (chave primária `driver_profile_id`), o modelo **novo**, usado pelo despacho regional para saber quem está online e onde. Chamada em `void` (fire-and-forget) — **nunca pode interromper o fluxo de GPS legado**, erros são só logados (`ERRO_UPDATE_PRESENCE`).

Quem lê `driver_live_locations`: o próprio entregador (RLS `driver reads own location`) e membros da organização dona daquele `drivers.organization_id` (`org members read driver locations`) — nunca cross-tenant.

## Estados e feedback visual

- `gpsStatus` — texto livre ("Solicitando permissão...", "Obtendo localização...", "Em trabalho", "Erro na localização", etc.), mostrado na Home.
- `syncStatus`/`syncError` — separado do GPS em si: reflete o resultado do ÚLTIMO envio ao Supabase ("Localização sincronizada", "Falha na sincronização" + mensagem).
- `lastSyncedAt` — timestamp do servidor (`data` retornado pelo RPC) quando disponível, senão `Date.now()` local como fallback.

## Riscos e observações

- **Sem teste automatizado**: todo o fluxo acima só foi validado manualmente (rodadas anteriores confirmaram GPS foreground/background com tela bloqueada funcionando num dispositivo real).
- **`distanceFilter: 0`**: o watcher dispara por tempo, não por movimento — um entregador parado (ex.: esperando na loja) ainda gera 1 gravação a cada 8s. Não é um problema de custo hoje (é 1 RPC ao próprio Supabase, sem custo por chamada de terceiro), mas é volume de escrita constante enquanto QUALQUER entregador está "em trabalho", mesmo parado. Vale monitorar em piloto (ver `ROTazRO_PRE_PILOT_CHECKLIST.md` no repo Web).
- **Sem correlação de erro**: se `sendLocationToSupabase` falhar repetidamente, o único sinal é `syncStatus`/`syncError` na tela — nada é reportado a um serviço de observabilidade (não existe Sentry nem equivalente hoje em nenhum dos dois repos).
- **`ACCESS_BACKGROUND_LOCATION`** não é declarada no manifest (nem do app nem do plugin) — o app usa o padrão moderno (foreground service com notificação), que dispensa essa permissão mais restrita. Isso é a abordagem correta para Android 10+, não uma lacuna.
