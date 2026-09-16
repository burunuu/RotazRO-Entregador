# Execução de Rota — RotazRO Entregador ("Minha Rota")

> Auditoria de 2026-09-15. Arquivos principais: `src/screens/MyRouteScreen.tsx`, `src/hooks/useCurrentRoute.ts`, `src/services/routes.ts`, `src/components/RouteStopCard.tsx`, `src/components/OccurrenceSheet.tsx`.

## Fonte da verdade

`public.route_stops.status` é a única fonte da verdade de pendência: `pending` → ainda não resolvida; `delivered`/`failed`/`skipped` → fechada. Nenhum cálculo local reinterpreta isso — toda contagem/filtro no app usa esse campo direto.

`public.routes.status`: `draft → searching_driver → confirmed → in_progress → completed`/`cancelled`. O entregador só enxerga (via RLS `driver_owns_route`) rotas em `confirmed` ou `in_progress` — uma vez `completed`, a rota some da consulta `fetchMyActiveRoute()` (ver abaixo, isso já causou um bug real, corrigido).

## Ciclo de vida na tela

1. **`confirmed`**: botão "Iniciar rota" → RPC `start_route_tx_as_driver`.
2. **`in_progress`**: lista de paradas, próxima parada em destaque, botão "Entregue" por parada (RPC `deliver_my_stop`), ação única "Problema com alguma entrega?" no fim da lista (abre `OccurrenceSheet`, RPC `report_my_stop_occurrence`).
3. Quando todas as paradas estão fechadas (nenhuma `pending`) mas a rota ainda está `in_progress`: card "QUASE LÁ" com resumo (entregas, distância, tempo) e botão "Finalizar rota" (RPC `complete_my_route`).
4. **Pós-finalização**: como a rota some do `fetchMyActiveRoute()` assim que vira `completed`, a tela captura um **snapshot local** dos números (entregas, distância, duração real calculada client-side como `Date.now() - startedAt`, nome do restaurante) ANTES de chamar `complete_my_route`, mostra esse snapshot por 2.5s (ou até o usuário tocar "Voltar para o início"), e chama `onFinished()` (prop passada por `App.tsx`, navega pra Home). Ver commit `4ab109e` para o histórico desse bug + fix.

## Google Maps — rota completa

`fullRouteUrls(origin, stops)` (`services/maps-links.ts`) monta o link `https://www.google.com/maps/dir/?api=1&...`, dividido em blocos de até 10 paradas (limite do próprio Google — 9 waypoints + destino por link). A lista de `stops` passada SEMPRE é filtrada por `status === 'pending'` antes de chamar essa função — corrigido nesta feature branch (bug anterior: incluía paradas já entregues). Ordem preservada (`position`), nunca reotimizada.

Quando não há paradas pendentes, `fullRouteUrls` retorna `[]` e o botão simplesmente não renderiza (escolha de UX: esconder, não mostrar mensagem redundante — o botão "Finalizar rota" já comunica o estado).

## Realtime + sincronização (`useCurrentRoute.ts`)

Enquanto `route.status` é `confirmed` ou `in_progress`:

- Assina `postgres_changes` em `routes` (filtro `id=eq.<routeId>`) e `route_stops` (filtro `route_id=eq.<routeId>`) via um canal Supabase (`route-execution-<routeId>`).
- Qualquer evento dispara um **debounce de 300ms** antes de um refetch completo (`fetchMyActiveRoute()`) — nunca reconstrói estado a partir do payload do evento.
- **Poll de segurança de 10s**, incondicional (não tenta detectar se o socket Realtime caiu — roda sempre, mais simples e robusto).
- Reconciliação em `visibilitychange` (app volta de background) e `online` (rede volta).
- Guarda de sequência (`fetchSeqRef`): uma resposta de fetch mais antiga nunca sobrescreve uma mais nova (protege contra Realtime+poll disparando quase juntos).
- Depois de qualquer ação local (`start`/`deliver`/`reportOccurrence`/`complete`) bem-sucedida, `runAction` já chama `refresh()` imediatamente — a UI nunca espera o evento Realtime voltar para o próprio autor da mudança.

Migration que habilita isso no Postgres: `supabase/migrations/20260915000000_enable_realtime_route_execution.sql` (repo Web) — já aplicada em produção. RLS de sempre (`driver_owns_route`) é o que garante que Realtime não vaza dados entre entregadores.

## RPCs usadas (todas `SECURITY DEFINER`, `search_path=public`, só `authenticated`)

| RPC | Efeito |
|---|---|
| `start_route_tx_as_driver(_route_id)` | `confirmed → in_progress`, marca stops/orders relevantes como `in_route` |
| `deliver_my_stop(_stop_id)` | Fecha a parada (`status='delivered'`), marca `orders.status='delivered'` — condicional (`WHERE status='pending'`), evita double-delivery em race |
| `report_my_stop_occurrence(_stop_id, _occurrence_type, _note)` | Fecha a parada (`status='failed'`), grava motivo/nota, reabre o pedido (`orders.status`) exceto quando `refused` (aí cancela) |
| `set_my_stop_note(_stop_id, _note)` | Só atualiza a nota de execução — não fecha a parada. Hook (`useCurrentRoute.setNote`) continua exportado mas **sem gatilho na UI atual** (removido visualmente numa rodada de polimento, capacidade mantida) |
| `complete_my_route(_route_id)` | `in_progress → completed`, grava `completed_at` |

Essas RPCs do APK **já eram atômicas** desde que foram criadas (RLS via `driver_owns_route`, `UPDATE ... WHERE status='pending'` numa única instrução) — não precisaram de nenhuma mudança na rodada de 2026-09-16 que corrigiu o mesmo tipo de risco no Web (repo Web, `ROTazRO_SECURITY.md` item M1). O Web autenticado e o portal público (`/e/{token}`) tinham uma versão mais antiga da mesma ação — dois `UPDATE`s sequenciais em código de aplicação, com rollback manual — que foi substituída por duas novas RPCs (`deliver_route_stop_tx`, `report_route_stop_occurrence_tx`) seguindo exatamente o mesmo princípio já usado aqui: um único `UPDATE` guardado por `status='pending'` dentro de uma função `SECURITY DEFINER`, sem round-trips separados. Ver `ROTazRO_BACKEND_SUPABASE.md` (repo Web) para os detalhes dessas duas novas funções.

## Tempo real vs estimado

O card de resumo (tanto o "QUASE LÁ" quanto o snapshot pós-finalização) mostra **duração real** (`completed_at - started_at`, ou aproximação client-side de `Date.now() - startedAt` no momento exato da finalização) quando disponível — nunca `estimated_duration_s` silenciosamente no lugar de um valor real. `routeRealDurationS()` em `services/routes.ts` centraliza essa regra. Distância continua sendo `total_distance_m` (planejada) — não existe hoje uma "distância real percorrida" calculada (ver `distance_from_previous_m`/`duration_from_previous_s` em `route_stops`: colunas existem no schema mas **nunca são preenchidas** por nenhum fluxo de criação de rota atual, confirmado por grep — não usar sem antes implementar quem as populariam).

## Dispatch Recovery (2026-09-17, revisado no mesmo dia)

**"Encerrar trabalho" durante rota ativa — duas camadas de correção.**

Auditoria inicial confirmou: "Encerrar trabalho" (`stopGps()`, `App.tsx`) não checava rota ativa nenhuma — o entregador podia tocar nesse botão no meio de uma rota `confirmed`/`in_progress`. Até então, o backend simplesmente **ignorava** o `'offline'` que o app já mandava nesse caso (proteção contra o heartbeat `'online'` de 8s derrubar `on_route` por engano acabava bloqueando também a intenção real do entregador). Primeira correção, no repo Web (`update_my_presence`, migration `20260917000000_dispatch_recovery.sql`): só o heartbeat `'online'` de rotina passou a ser ignorado durante `on_route` — um `'offline'` explícito (o que este app sempre enviou) passa a ser honrado imediatamente, mesmo em rota, terminando em `'offline'` **diretamente** (confirmado por teste real contra Postgres, não é leitura de código).

Isso por si só resolvia o dado (presença deixa de mentir), mas a rodada de revisão seguinte identificou que o produto continuava permitindo a ação confusa em si: um entregador podia "encerrar o trabalho" com entregas pendentes, mesmo que a rota continuasse tecnicamente atribuída a ele. **Segunda correção, agora sim neste repo** (`App.tsx`): o botão "Encerrar trabalho" passou a checar `assignedRoute.route` (rota `confirmed`/`in_progress` atribuída) ANTES de chamar `stopGps()` — se houver uma rota ativa, mostra *"Você possui uma rota ativa. Finalize a rota antes de encerrar o trabalho."* e não faz mais nada (não chama `stopGps()`, não toca em `driver_presence`, não mexe na rota).

**Logout continua sem esse bloqueio, deliberadamente** (`handleLogout()`, que também chama `stopGps()`, não foi alterado) — é o único caminho legítimo que sobra pra "offline mid-rota" (telefone perdido, troca de conta, desinstalação), e bloquear logout incondicionalmente seria pior que o problema original. É exatamente por isso que a correção do backend (honrar `'offline'` explícito) continuou necessária mesmo depois do bloqueio do botão — sem ela, um logout no meio da rota deixaria `driver_presence` preso em `on_route` até o watchdog agir.

Consequência prática em ambos os caminhos: a rota em si (`routes.status`) nunca é tocada — continua `in_progress` até `complete_my_route` (ou, no futuro, um cancelamento), exatamente como hoje.

**Watchdog server-side** (`recover_dispatch_state()`, repo Web) expira ofertas regionais vencidas e libera `driver_presence` presa em `on_route` sem rota ativa, independente de qualquer sessão do app estar aberta — relevante para o cenário "app fecha com oferta pendente" (seção acima): a oferta agora expira sozinha mesmo se o entregador nunca mais abrir o app, sem bloquear esse entregador para futuras ofertas. Na rodada de revisão, o watchdog também passou a reavaliar automaticamente rotas com candidatos esgotados quando um driver novo aparece depois — sem nunca reofertar pra quem já recusou/expirou naquela rota específica. Detalhe completo (state machine final, testes) em `ROTazRO_ROUTES_AND_DISPATCH.md` (repo Web).

## O que NÃO existe aqui

- Reotimização de rota durante a execução (a ordem é sempre a original, menos as paradas já fechadas).
- Qualquer chamada nova ao Google Maps durante a execução (o link de navegação é só uma URL montada localmente, sem custo de API).
- Cancelamento de rota pelo entregador (só o restaurante/admin, via Web, poderia fazer isso hoje — e nem isso foi confirmado nesta auditoria como existente no Web).
