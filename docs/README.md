# Documentação RotazRO — Entregador (APK)

> Gerada em auditoria de 2026-09-15. Reflete o código real na época — revalide antes de confiar cegamente em qualquer afirmação aqui, especialmente em sessões futuras.

- [ROTazRO_ENTREGADOR_OVERVIEW.md](./ROTazRO_ENTREGADOR_OVERVIEW.md) — mapa funcional completo, arquitetura de código, o que existe/está parcial/não existe.
- [ROTazRO_GPS_AND_LOCATION.md](./ROTazRO_GPS_AND_LOCATION.md) — foreground/background GPS, throttle, gravação em `driver_live_locations`/`driver_presence`.
- [ROTazRO_ROUTE_EXECUTION.md](./ROTazRO_ROUTE_EXECUTION.md) — "Minha Rota": ciclo de vida, Google Maps, Realtime/sincronização, RPCs.
- [ROTazRO_PUSH_NOTIFICATIONS.md](./ROTazRO_PUSH_NOTIFICATIONS.md) — estado real (preparado, desligado), o que falta para ativar.
- [ROTazRO_ANDROID_BUILD.md](./ROTazRO_ANDROID_BUILD.md) — build local, bug de ambiente conhecido (loopback/TEMP), CI (inexistente).
- [ROTazRO_OBSERVABILITY.md](./ROTazRO_OBSERVABILITY.md) — Sentry, logging estruturado, eventos, privacidade (inclui GPS), offline vs erro real, error boundary, versionamento, configuração manual.

Documentação do painel Web: `D:\RotazRO\RotazRO\docs\README.md`.
