# Observabilidade — RotazRO Entregador (APK)

> Implementado em 2026-09-19, preparação para o piloto. Nada disto foi aplicado em produção/Play Store — ver "Configuração manual" no final. Contraparte do painel Web: `D:\RotazRO\RotazRO\docs\ROTazRO_OBSERVABILITY.md` (arquitetura idêntica, este documento cobre só o que é específico do APK). Formato: para cada área, "SE ACONTECER X, OLHE Y".

---

## 1. Arquitetura

Mesmo padrão de três camadas do Web (`logger` sempre ativo → `captureError` no-op sem DSN → `sanitizeEvent` no `beforeSend`), copiado deliberadamente como um segundo arquivo independente em vez de um pacote compartilhado entre os dois repos (repos separados, sem monorepo — "não criar framework grande"):

```
src/lib/observability/
  context.ts    — ObservabilityContext + contextToFields (mesmos ids do Web)
  logger.ts     — logger.debug/info/warn/error, zero dependência de Sentry
  sanitize.ts   — sanitizeEvent(), + GPS_KEY_PATTERN (só neste repo)
  capture.ts    — captureError/addBreadcrumbSafe, no-op sem VITE_SENTRY_DSN,
                  + downgrade para breadcrumb quando o device está offline
  version.ts    — appCommit()/appPackageVersion()/appRelease()/appEnvironment()
  sentry.init.ts — Sentry.init() com @sentry/capacitor + @sentry/react
```

**SDK oficial**: `@sentry/capacitor` (Capacitor 8) com `@sentry/react` como peer — padrão oficial `Sentry.init(options, SentryReact.init)` (`src/lib/observability/sentry.init.ts`), combinando contexto nativo do Capacitor (device/OS) com as integrações React (component stack em erros de render).

**Por que Sentry é necessário aqui**: este app não tinha absolutamente nenhum mecanismo de captura de erro antes desta rodada — nem um error boundary. Um crash de render virava tela branca sem nenhum registro em lugar nenhum.

---

## 2. O que captura

- Exceção JS não tratada e Promise rejection não tratada — `window.addEventListener('error'/'unhandledrejection', ...)` em `src/main.tsx` (`app.window_error`/`app.unhandled_rejection`), redundante de propósito com o `GlobalHandlers` do próprio SDK Sentry — os listeners manuais garantem que a linha de log estruturado local existe mesmo sem Sentry configurado.
- Erro de render React não tratado por nenhum boundary mais específico — `src/components/ErrorBoundary.tsx` (`app.root_error_boundary`), envolve `<App />` inteiro em `main.tsx`. Nunca mostra stack ao usuário — só "Algo deu errado." / "Tente novamente." + botão que reseta o boundary.
- Erro do Supabase/Realtime, erro de GPS (foreground e background), falha em aceitar/entregar/finalizar rota, erro de auth inesperado, erro de plugin Capacitor (push notifications) — ver tabela de eventos (seção 3).

### O que NÃO é capturado como exceção (comportamento esperado, só `logger.info`/`logger.warn`)
- `auth.login_failed` — senha incorreta é um resultado esperado do usuário, não um bug.
- `gps.location_permission_denied` — usuário negou permissão de localização; é uma escolha do usuário, não uma falha do app.
- `dispatch.offer_accepted`/`dispatch.offer_declined` — ações normais do fluxo de ofertas.
- `route.action_succeeded` — log de sucesso, não de erro.

---

## 3. Eventos implementados

| Evento | Nível | Onde | Significa |
|---|---|---|---|
| `app.window_error` | **error (Sentry)** | `main.tsx` | Exceção JS não tratada em qualquer lugar do app. |
| `app.unhandled_rejection` | **error (Sentry)** | `main.tsx` | Promise rejeitada sem `.catch`. |
| `app.root_error_boundary` | **error (Sentry)** | `ErrorBoundary.tsx` | Erro de render React (component stack incluído, truncado em 2000 chars). |
| `auth.login_failed` | warn | `App.tsx`/`error-helpers.ts` | Falha de login — inclui senha errada (esperado). |
| `auth.ensure_driver_profile_failed` | **error (Sentry)** | `App.tsx` | Falha inesperada ao garantir/criar o perfil de entregador após login. |
| `dispatch.fetch_offer_failed` | **error (Sentry)** | `useDeliveryOffers.ts` | Polling de ofertas pendentes falhou. |
| `dispatch.offer_accepted` / `dispatch.offer_declined` | info | `useDeliveryOffers.ts` | Ação normal do entregador sobre uma oferta. |
| `gps.location_permission_denied` | warn | `App.tsx` | Usuário negou permissão de localização — esperado. |
| `gps.foreground_location_error` | **error (Sentry)** | `App.tsx`/`error-helpers.ts` | Falha ao obter localização em primeiro plano. |
| `gps.background_location_error` | **error (Sentry)** | `App.tsx`/`error-helpers.ts` | Falha do plugin de GPS em segundo plano (`@capgo/background-geolocation`). |
| `gps.start_work_failed` / `gps.stop_work_failed` | **error (Sentry)** | `App.tsx` | Falha ao iniciar/encerrar o rastreamento de "em trabalho". |
| `gps.clear_location_failed` | **error (Sentry)** | `App.tsx` | Falha ao limpar a última localização conhecida. |
| `gps.presence_update_failed` | **error (Sentry)** | `presence.ts` | Falha ao gravar presença (`driver_presence`) no Supabase. |
| `route.action_succeeded` | info | `useCurrentRoute.ts` | Ação de rota (entregar parada, reportar ocorrência, etc.) concluída com sucesso. |
| `route.check_active_route_failed` | **error (Sentry)** | `useCurrentRoute.ts` | Falha ao verificar se há rota ativa. |
| `route.poll_assigned_route_failed` | **error (Sentry)** | `useAssignedRoute.ts` | Polling de rota recém-atribuída falhou. |
| `route.history_load_failed` | **error (Sentry)** | `App.tsx` | Falha ao carregar histórico de rotas. |
| `realtime.subscription_error` | warn / **error com `force:true`** | `useCurrentRoute.ts`, `useDeliveryOffers.ts` | Canal Realtime caiu em `CHANNEL_ERROR`/`TIMED_OUT` — `force:true` usado onde o erro é claramente não relacionado a rede (ver seção 5). |
| `push.setup_failed`, `push.registration_failed`, `push.register_token_failed`, `push.unregister_failed`, `push.revoke_token_failed` | **error (Sentry)** | `notifications.ts` | Falhas do fluxo de push notifications (hoje desligado em produção, ver `ROTazRO_PUSH_NOTIFICATIONS.md` — os eventos existem prontos para quando for ativado). |
| `profile.save_failed` | **error (Sentry)** | `notifications.ts` | Falha ao salvar dado de perfil relacionado a push. |

**"error (Sentry)"** = passa por `captureError`, vai para Sentry se configurado, sempre logado localmente também.

**Cobertura ampla via `describeError()`** (`src/services/error-helpers.ts`): este é o ponto central que a maioria dos `catch` do app chama para transformar um erro do Supabase/rede numa mensagem amigável — todas as 3 ramificações internas dele já chamam `captureError`, então qualquer chamador novo que use `describeError()` ganha observabilidade automaticamente, sem precisar adicionar `captureError` manualmente em cada site.

---

## 4. Privacidade — o que nunca é enviado

Mesma base do Web (`src/lib/observability/sanitize.ts`) — strip estrutural de headers de auth/cookies/corpo da requisição, redação por padrão de chave de segredos e PII — **mais uma regra exclusiva deste repo**:

- **GPS nunca sai do device em texto legível dentro de um evento de erro**: `GPS_KEY_PATTERN = /^(latitude|longitude|lat|lng|lon|coords?)$/i` redige qualquer chave com esse nome em `extra`/`contexts`/`breadcrumbs`, recursivamente. `ObservabilityContext` (seção 5 do doc do Web) também nunca inclui um campo de coordenada por design — a regra existe nos dois níveis (o quê é colocado no contexto em primeiro lugar, e uma rede de segurança no `beforeSend`).
- **Nenhum evento de erro grava latitude/longitude precisa** — confirmado por leitura de todos os call sites de `captureError` no GPS (`App.tsx`, `presence.ts`): nenhum passa coordenadas em `extra`.

Ver `src/lib/observability/__tests__/sanitize.test.ts` (inclui um teste específico de redação de GPS).

---

## 5. Offline vs erro real

`isDeviceOffline()` (`capture.ts`) checa `navigator.onLine === false`. Quando o device está offline e `captureError` é chamado sem `force: true`:
- A estrutura de log local (JSON via `logger.error`) **sempre** é escrita — nada é perdido localmente.
- O envio ao Sentry é **rebaixado para um breadcrumb** (`offline_suppressed`) em vez de uma exceção completa — evita inundar o Sentry com dezenas de falhas de rede idênticas durante um período sem sinal, que não diriam nada de útil além de "o device ficou sem internet".
- `force: true` é usado nos poucos lugares onde o erro claramente não tem cara de problema de rede (ex.: um erro de Realtime que não é `CHANNEL_ERROR`/`TIMED_OUT`) — usar com moderação.

**SE o Sentry mostrar muitos breadcrumbs `offline_suppressed` e poucas exceções reais num período, é esperado** — significa que o app estava se comportando corretamente offline, não que a observabilidade está com problema.

---

## 6. Error Boundary

`src/components/ErrorBoundary.tsx` — não existia antes desta rodada (era a única lacuna crítica de UX: um erro de render virava tela branca). Comportamento:
- Nunca mostra stack trace ao usuário — só "Algo deu errado." / "Tente novamente." e um botão que reseta o estado do boundary (sem recarregar o app inteiro).
- `componentDidCatch` sempre chama `captureError` com o `component_stack` (truncado em 2000 caracteres) em `extra`.
- Envolve `<App />` inteiro em `main.tsx` — qualquer erro de render em qualquer tela cai aqui se não houver um boundary mais específico antes.

---

## 7. Versionamento

- `__ROTAZRO_COMMIT__` — hash curto do git, injetado via `vite.config.ts`'s `define` (mesmo padrão do Web). Cai em `"unknown"` se `git rev-parse` falhar no build.
- `__ROTAZRO_PKG_VERSION__` — versão de `package.json`, injetada do mesmo jeito. **Gap conhecido, não resolvido nesta rodada**: `package.json.version` está fixo em `"0.0.0"` e `android/app/build.gradle` tem `versionCode 1`/`versionName "1.0"` nunca incrementados. `appRelease()` monta `rotazro-entregador@<pkg_version>+<commit>` — hoje isso vira algo como `rotazro-entregador@0.0.0+a1b2c3d`, então o `commit` é, na prática, o único identificador de build realmente único até a versão ser corrigida.
- **Proposta mínima de versionamento** (não implementada, fora do escopo desta rodada): antes de cada build para o piloto, bumpar `package.json.version` e `versionCode`/`versionName` juntos (ex.: `0.1.0` / `versionCode 2` / `versionName "0.1.0"`) — nem que seja manual por enquanto, um script de bump automatizado é um P2.

---

## 8. Sem infraestrutura de banco/cron própria

Este app não tem backend próprio — GPS, ofertas, rotas passam todos pelo Supabase compartilhado com o Web. Para watchdog/cron/health check do backend, ver `ROTazRO_OBSERVABILITY.md` do repo Web (seções 5-7) — não há nada específico de infraestrutura de servidor para documentar aqui.

---

## 9. Performance / Tracing

`tracesSampleRate: 0.1` (10%) em `Sentry.init()` — mesma política do Web, deliberadamente baixa, não uma solução de APM completa.

---

## 10. Variáveis de ambiente

Ver `.env.example` (novo nesta rodada — o repo não tinha um antes). Todas opcionais — sem `VITE_SENTRY_DSN`, Sentry nunca inicializa e tudo em `capture.ts` é no-op garantido.

| Variável | Onde é lida | Obrigatória? |
|---|---|---|
| `VITE_SENTRY_DSN` | `sentry.init.ts`, via `import.meta.env` (bundlada no APK) | Não — sem ela, Sentry nunca inicializa. |
| `VITE_SENTRY_ENVIRONMENT` | `version.ts` | Não — cai em `"production"`. |

Não existe `SENTRY_AUTH_TOKEN` neste repo (não há upload de source maps configurado nesta rodada) — se configurado no futuro, nunca deve ir para uma variável `VITE_*` (viraria parte do APK instalado, legível por qualquer um).

---

## 11. Testes

Este repo **não tinha runner de testes configurado** antes desta rodada (`package.json` só tinha `dev`/`build`/`lint`/`preview`). Adicionado `vitest` como devDependency (mesma ferramenta do repo Web, sem framework novo) + script `npm test`.

`src/lib/observability/__tests__/` (`npm test`):
- `sanitize.test.ts` — headers de auth removidos, chaves de segredo/PII/**GPS** redigidas (incluindo aninhadas), contexts/breadcrumbs sanitizados, no-op em evento limpo.
- `logger.test.ts` — forma da linha JSON, roteamento por nível, debug silencioso por padrão, chamada sem `fields`.
- `capture.test.ts` — **confirma que com Sentry desabilitado (sem DSN, o estado padrão), `captureError`/`addBreadcrumbSafe` nunca lançam exceção e continuam logando localmente**.

15 testes, todos passando nesta rodada (`npx vitest run src/lib/observability`).

---

## 12. Configuração manual necessária (nada disto foi feito automaticamente)

1. Criar um projeto no [sentry.io](https://sentry.io) para o APK (Android/React, pode reaproveitar a mesma conta usada para o projeto Web, mas como projeto separado — plataformas diferentes têm processamento de evento ligeiramente diferente no Sentry).
2. Copiar o DSN e configurar `VITE_SENTRY_DSN` como variável de ambiente **no processo de build** (o Capacitor empacota o bundle Vite já compilado — a env var precisa estar presente no momento do `npm run build`, não em runtime no device).
3. Opcional: `VITE_SENTRY_ENVIRONMENT=production`.
4. Resolver o gap de versionamento (seção 7) antes do piloto real, para que builds futuras sejam identificáveis no Sentry sem depender só do commit.
5. No painel do Sentry: configurar notificação (e-mail/Slack) para novas issues.

**Este documento não pede para colar nenhum DSN no chat — configure diretamente no ambiente de build.**
