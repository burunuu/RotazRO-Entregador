# RotazRO Entregador — Visão Geral

> Auditoria de 2026-09-15. Reflete o código real na branch `feature/minha-rota-dispatch` (8 commits locais à frente de `origin/main`, nada pushado). Não confie neste documento cegamente em sessões futuras — o código é a fonte da verdade; revalide antes de agir sobre qualquer afirmação aqui.

## O que é

App Android do entregador do RotazRO. Capacitor 8 + React 19 + TypeScript + Vite, `appId com.rotazro.entregador`. Consome o mesmo projeto Supabase do Web (`haciigmaszlbevdzzmod`), sem backend próprio.

Estrutura de código: **monolítico em `src/App.tsx`** (login, Home, GPS, histórico, perfil, drawer/menu, logout — tudo num componente só, ~2900 linhas) + uma tela separada (`src/screens/MyRouteScreen.tsx`) para a execução de rota, que por sua vez usa componentes/hooks/serviços modulares (`src/components/`, `src/hooks/`, `src/services/`, `src/lib/`).

## Módulos e status

| Módulo | Status | Onde |
|---|---|---|
| Login (Supabase Auth, email/senha) | COMPLETO | `App.tsx` |
| Restaurar sessão | COMPLETO | `App.tsx` (`restoreSession`) |
| Perfil (nome, telefone, veículo) | COMPLETO | `App.tsx`, sincroniza com `public.drivers` |
| Histórico (resumo mensal/semanal, lista de rotas) | COMPLETO | `App.tsx` (`loadHistory`) |
| Clima/data no topo da Home | COMPLETO (decorativo) | `App.tsx` |
| GPS foreground | COMPLETO | `@capacitor/geolocation`, ver `docs/ROTazRO_GPS_AND_LOCATION.md` |
| GPS background (tela bloqueada) | COMPLETO | `@capgo/background-geolocation`, validado manualmente em rodadas anteriores |
| Minha Rota (execução) | COMPLETO | `MyRouteScreen.tsx` + `useCurrentRoute`, ver `docs/ROTazRO_ROUTE_EXECUTION.md` |
| Oferta regional (aceitar/recusar) | COMPLETO (nunca testado com 2 entregadores reais simultâneos) | `useDeliveryOffers`, `services/dispatch.ts` |
| Popup de rota atribuída (loja) | COMPLETO | `useAssignedRoute` (polling 7s) |
| Realtime (rota ativa) | COMPLETO | `useCurrentRoute.ts` — ver `docs/ROTazRO_ROUTE_EXECUTION.md` |
| Push notifications (FCM) | PREPARADO, desligado | `PUSH_NOTIFICATIONS_ENABLED = false` em `services/notifications.ts` — sem `google-services.json` no projeto Android; chamar a API nativa sem isso pode crashar nativamente (ver `docs/ROTazRO_PUSH_NOTIFICATIONS.md`) |
| Deep link (push → oferta) | PREPARADO, código existe mas não roda (push desligado) | `onNotificationOpened` |
| Logout com revogação de push token | PARCIAL — revoga token de push (`driver_devices`), mas o token nunca é criado de fato hoje (push desligado); logout em si funciona | `App.tsx` `handleLogout` |
| Termos de Uso / Privacidade | NÃO EXISTE | nenhum checkbox, nenhuma tabela de aceite — ver `docs/ROTazRO_PRE_PILOT` no repo Web |
| Testes automatizados | NÃO EXISTE | zero arquivos `*.test.*`/`*.spec.*` no repo |
| CI | NÃO EXISTE | nenhum `.github/workflows` |

## Autenticação e identidade do entregador

Dois modelos de identidade coexistem, deliberadamente (ver `docs/ROTazRO_ROUTE_EXECUTION.md` para RLS):

- **Legado, por loja** (`public.drivers` + `public.driver_accounts`): o entregador é cadastrado por um restaurante específico. `drivers.organization_id` amarra a um único restaurante.
- **Novo, regional** (`public.driver_profiles`): identidade única do entregador, independente de organização, criada via `ensure_driver_profile()` (idempotente, chamada no login/restore). `restaurant_driver_links` conecta um `driver_profiles` a N restaurantes.

Um entregador pode ter as duas coisas ao mesmo tempo (loja original + vínculos regionais). `driver_owns_route()` (RPC, `SECURITY DEFINER`) verifica os dois caminhos.

## Dependências principais

```
@capacitor/core, @capacitor/android        ^8.5.1
@capacitor/geolocation                     ^8.2.2
@capacitor/push-notifications              ^8.1.2  (instalado, mas gate desligado)
@capgo/background-geolocation              ^8.4.5
@supabase/supabase-js                      ^2.116.0
react, react-dom                           ^19.2.8
```

Sem framework de estado global (Redux/Zustand) — tudo é `useState`/`useEffect`/hooks customizados.

## Arquivos "chave" para orientação rápida

- `src/App.tsx` — shell do app: login, Home, drawer, histórico, perfil, GPS, logout.
- `src/screens/MyRouteScreen.tsx` — execução de rota (tela cheia, separada do shell).
- `src/hooks/useCurrentRoute.ts` — estado + Realtime + polling da rota ativa.
- `src/hooks/useAssignedRoute.ts` — polling (7s) para detectar nova rota atribuída (popup na Home).
- `src/hooks/useDeliveryOffers.ts` — polling (5s) para oferta regional pendente.
- `src/services/routes.ts` — todo acesso a `routes`/`route_stops` do lado do entregador.
- `src/services/dispatch.ts` — oferta regional (`delivery_offers`, `accept/decline_delivery_offer`).
- `src/services/notifications.ts` — push (desligado), com a flag central documentada.
- `src/services/presence.ts` — `driver_presence` (online/offline/on_route), usado pelo despacho regional. Desde 2026-09-17, um `'offline'` explícito (enviado por logout, ou por "Encerrar trabalho" quando não há rota ativa) é honrado pelo backend mesmo durante `on_route`, terminando DIRETO em `offline` — só o heartbeat `'online'` de rotina continua sendo ignorado nesse estado. O botão "Encerrar trabalho" em si (`App.tsx`) bloqueia a ação quando há uma rota `confirmed`/`in_progress` atribuída — logout continua sem esse bloqueio, deliberadamente. Ver `ROTazRO_ROUTE_EXECUTION.md`, seção "Dispatch Recovery", e `ROTazRO_BACKEND_SUPABASE.md` no repo Web.
- `src/services/driver-identity.ts` — `driver_profiles` / `ensure_driver_profile`.
- `src/lib/format.ts` — formatação de duração e tradução de status de rota, compartilhados.

## Achados desta auditoria (resumo — detalhe nos outros docs)

- **Nenhum teste automatizado, nenhum CI.** Toda validação hoje é manual (`npm run lint`/`build`/`assembleDebug` rodados por mim nesta sessão, nunca em pipeline).
- **Código morto removido nesta rodada:** `src/App.foreground-backup.tsx` (700 linhas, não importado em lugar nenhum — cópia de segurança de antes do GPS em background existir).
- Comentário desatualizado em `useAssignedRoute.ts` (linhas 12-19): justifica polling dizendo que Realtime "não traria ganho real" — mas `useCurrentRoute.ts` já usa Realtime hoje para a rota ativa. A decisão de manter polling na Home continua válida (ver seção Realtime no doc de execução), só o texto do comentário ficou desatualizado.
