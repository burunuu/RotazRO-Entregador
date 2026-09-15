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

## Tempo real vs estimado

O card de resumo (tanto o "QUASE LÁ" quanto o snapshot pós-finalização) mostra **duração real** (`completed_at - started_at`, ou aproximação client-side de `Date.now() - startedAt` no momento exato da finalização) quando disponível — nunca `estimated_duration_s` silenciosamente no lugar de um valor real. `routeRealDurationS()` em `services/routes.ts` centraliza essa regra. Distância continua sendo `total_distance_m` (planejada) — não existe hoje uma "distância real percorrida" calculada (ver `distance_from_previous_m`/`duration_from_previous_s` em `route_stops`: colunas existem no schema mas **nunca são preenchidas** por nenhum fluxo de criação de rota atual, confirmado por grep — não usar sem antes implementar quem as populariam).

## O que NÃO existe aqui

- Reotimização de rota durante a execução (a ordem é sempre a original, menos as paradas já fechadas).
- Qualquer chamada nova ao Google Maps durante a execução (o link de navegação é só uma URL montada localmente, sem custo de API).
- Cancelamento de rota pelo entregador (só o restaurante/admin, via Web, poderia fazer isso hoje — e nem isso foi confirmado nesta auditoria como existente no Web).
