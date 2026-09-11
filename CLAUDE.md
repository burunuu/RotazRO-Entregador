# RotazRO Entregador

- Nome oficial: RotazRO.
- Este repositório é SOMENTE o app Android: `D:\RotazRO-Entregador`.
- O painel Web fica em: `D:\RotazRO\RotazRO`.
- Não alterar o Web em tarefas exclusivas do APK.
- Mudanças de schema, Supabase ou contratos compartilhados exigem analisar os dois repositórios.
- Stack: React + TypeScript + Vite + Capacitor 8.
- Supabase externo.
- Não migrar para Lovable Cloud.
- GPS foreground já funciona.
- GPS background já funciona.
- GPS com tela bloqueada já foi validado.
- Preservar `@capgo/background-geolocation`.
- Não expor:
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `OPENAI_API_KEY`
  - `GOOGLE_MAPS_SERVER_KEY`
  - `ROUTE_SHARE_TOKEN_SECRET`
- Nunca colocar secrets no APK.
- Antes de mudanças relevantes: criar branch.
- Antes de commit: rodar build e checks disponíveis.
- Nunca force push na main.
- Preferir branch → commit → push → PR → checks → merge.
- Não executar alterações destrutivas no Supabase.
- Não modificar RLS/migrations fora do escopo explícito.
- Perfil do entregador atualmente compartilha dados com `public.drivers`.
- GPS usa RPC segura `update_my_driver_location` e não envia `driver_id` do frontend.
- Se uma alteração afetar Web + APK, fazer commits separados em cada repositório.
- Não inventar dados ou schema inexistente.
- Código real tem prioridade sobre documentação histórica.

## Estado atual

- Login Supabase: funcionando.
- Perfil: funcionando, sincronizado com `public.drivers` (nome, telefone com máscara BR, tipo de veículo, placa).
- Histórico: funcionando (resumo mensal, semanal, lista de rotas).
- Métricas: funcionando (entregas, distância, tempo, valor do dia).
- Clima: funcionando (temperatura pontual ao abrir o app autenticado, sem iniciar GPS nem enviar posição ao Supabase).
- GPS foreground: funcionando.
- GPS background: funcionando, inclusive com tela bloqueada.
- Build Android: funcionando.
- Próximo grande módulo planejado: **Minha Rota**.
