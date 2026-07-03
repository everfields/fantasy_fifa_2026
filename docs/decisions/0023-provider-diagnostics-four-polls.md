# ADR-0023: Diagnóstico del proveedor en las respuestas del cron + 4 sondeos por partido

- **Date:** 2026-07-03
- **Status:** Accepted
- **Supersedes:** — (endurece ADR-0009; la regla de confirmación de FT sigue vigente)

## Context

Incidente en prod: la API key de Anthropic dejó de funcionar el **2026-06-23** (los dos
consumidores — el poller de resultados con Haiku+web_search y Luis de la Tracker con Opus —
murieron el mismo día; el tracker cayó a `analysis_only` con `model: null`). El poller, sin
embargo, siguió respondiendo `200 {"ok":true,"providerMatches":0,...}` cada 15 minutos durante
**10 días**: `llmWebSearch.callLlm` capturaba el error, hacía `console.error` (invisible en Hobby)
y devolvía `[]`, indistinguible de «no hay partidos en ventana». Resultado: desde el 23-06 el 100%
de los resultados (43/43) los metió el admin a mano creyendo puntualmente que «no se actualizaba».
La infraestructura (pg_cron, secrets, ventanas, matching) estaba perfecta — 2204 ejecuciones, 0
fallos.

Además el grupo pidió más frescura durante el partido: con 2 sondeos (descanso y final) el
marcador en vivo solo se veía una vez antes del pitido final.

## Decision

1. **Los fallos del proveedor son visibles, no tragados.** `FootballDataProvider.getLiveMatches`
   devuelve `LiveMatchesResult = { matches, candidatesInWindow, providerError }`. Los impls nunca
   lanzan, pero el primer error upstream (status + mensaje recortado) viaja en `providerError`.
   Las rutas `update-results` y `sync-now` lo incluyen en su JSON (junto a `candidates`), de modo
   que queda grabado en `net._http_response` y el admin lo ve en «Sync ahora». Sigue siendo HTTP
   200/`ok:true` (el sondeo corrió) para que pg_net conserve el body.
2. **4 ventanas de sondeo por partido** (minutos desde el kickoff): primer tiempo **[20′, 45′)**,
   descanso **[45′, 70′)**, segundo tiempo **[80′, 110′)** y final **[115′, ∞)** con reintento
   hasta FT. Los sondeos intermedios actualizan marcador/estado en vivo pero NUNCA marcan
   `finished`; `finished` sigue exigiendo confirmación explícita de final (regla ADR-0009).

## Alternatives considered

- **Devolver HTTP 5xx cuando falla el LLM** — rechazado: pg_net registraría el fallo sin body y
  perderíamos el detalle; además dispararía reintentos sin sentido (el fallo es upstream).
- **Alertas activas (email/webhook)** — deseable pero fuera de alcance Hobby; con el error visible
  en `net._http_response` y en «Sync ahora» basta una consulta para diagnosticar.
- **Sondeo continuo cada 15′ todo el partido** — rechazado: coste LLM x2–3 sin valor añadido
  frente a 4 momentos bien elegidos.

## Consequences

- Una key muerta se detecta en la primera ventana con partidos (`candidates > 0` +
  `providerError` no nulo), no a los 10 días.
- **La causa raíz es operativa y sigue pendiente del usuario:** reponer crédito / regenerar la
  `ANTHROPIC_API_KEY` en la consola de Anthropic y actualizarla en Vercel (Production) + redeploy.
  El tracker volverá a `generated` y el poller a cerrar partidos solo.
- Más llamadas al LLM por partido (≈4–6 vs ≈2–4): coste Haiku marginal.

## Changes landed

- **Contract:** `lib/providers/FootballDataProvider.ts` — `LiveMatchesResult`.
- **Code:** `lib/providers/llmWebSearch.ts` (4 ventanas + `providerError`/`candidatesInWindow`),
  demás impls adaptados; `app/api/cron/update-results/route.ts` y
  `app/api/admin/sync-now/route.ts` exponen `candidates`/`providerError`.
- **Docs:** línea del stack en `CLAUDE.md` (dos sondeos → cuatro); este ADR.
