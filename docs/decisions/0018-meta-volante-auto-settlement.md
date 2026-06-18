# ADR-0018: Meta volante — liquidación automática al cerrar la ronda + 1ª ronda winner-takes-all

- **Date:** 2026-06-18
- **Status:** Accepted
- **Supersedes:** — (amplía ADR-0015 y matiza la regla 5 de CLAUDE.md / ADR-0012 para la meta volante)

## Context

ADR-0015 dejó la meta volante calculándose **solo en el recalc manual**. En producción la ronda 1
(group-md1) terminó (24/24 partidos `finished`) y los premios **nunca se sumaron**: `round_awards`
estaba vacío. El organizador tuvo que asignar a mano +100 a «Juan y Carlo» vía `point_adjustments`
(razón "sprint meta volante 1"). Dos fallos derivados:

1. **No se liquida sola.** Nadie ejecutó el recalc manual, así que cerrada la ronda no apareció ningún
   premio ni el maillot azul ni el palmarés.
2. **El tablero "Ronda en curso" se quedó atascado.** `buildLiveRound` elegía «la primera ronda
   empezada **sin premio otorgado**»; como `round_awards` seguía vacío, la ronda 1 (ya completa)
   se mostraba como "en curso" aunque se estuviera jugando la ronda 2 (group-md2, 1/24 finished).

Además el grupo decidió una regla de arranque: **la 1ª meta volante reparte solo al ganador (100)**;
a partir de la 2ª se aplica la escalera completa hasta el 7º (ADR-0015).

## Decision

1. **Liquidación automática al cerrar la ronda.** Las rondas de meta volante se liquidan
   AUTOMÁTICAMENTE en cuanto termina el último partido de la ronda, con los mismos helpers
   idempotentes del recalc (`recomputeRoundAwards` — solo premia rondas con **todos** sus partidos
   `finished`, y `upsert`/`delete` idempotente: nunca dobla). Se engancha en los tres caminos de
   puntuación automática vía un único helper `settleRoundAwardsAndRefresh`:
   - cron `GET /api/cron/update-results`
   - `POST /api/admin/sync-now` («Sync ahora»)
   - admin guardando un resultado `finished` (`saveResult`)

   Tras (re)puntuar las predicciones de un partido, se recomputan los premios de ronda y se refresca
   `standings_cache` si cambió **algo** (predicciones o premios). **Jokers y bonus siguen requiriendo
   el recalc manual completo** — la liquidación automática toca solo lo que un partido al acabar puede
   afectar por sí mismo: predicciones + meta volante.

2. **1ª ronda winner-takes-all.** Nueva función pura `distributionForRound(roundKey, distribution)`
   en `lib/scoring`: para `group-md1` devuelve `distribution.slice(0,1)` (solo el premio de 1º);
   para cualquier otra ronda, la escalera completa. La usan por igual la liquidación automática y el
   recalc manual, así que ambos coinciden siempre.

3. **`buildLiveRound` por completitud, no por premio.** La "ronda en curso" pasa a ser la primera
   ronda (en orden cronológico) que ha **empezado** (≥1 partido no `scheduled`) y **no está completa**
   (≥1 partido sin `finished`). Una ronda completa nunca se muestra como "en curso": al acabar pasa al
   palmarés y el tablero avanza solo a la siguiente. Se desacopla de `round_awards`.

## Alternatives considered

- **Seguir solo-manual y arreglar únicamente el tablero** — rechazado: el fallo de fondo es que nadie
  recuerda ejecutar el recalc al cerrar una ronda; los premios deben caer solos.
- **Liquidar meta volante en cada poll aunque no termine nada** — rechazado: derroche; se gatilla solo
  cuando un partido cambia y termina (`finishedChanged`).
- **Hacer la regla de la 1ª ronda configurable en `app_settings`** — rechazado por ahora: una sola
  decisión puntual del grupo; una función pura documentada es suficiente y trivial de cambiar.
- **Que `buildLiveRound` siga mirando `round_awards`** — rechazado: la completitud es la señal correcta
  y robusta frente a lag del cron.

## Consequences

- Cerrada cualquier ronda (md2 en adelante con la escalera completa; md1 winner-takes-all), los
  premios se otorgan solos, alimentan `standings_cache.meta_points`, el maillot azul y la regularidad
  (cada premio cuenta como evento, ADR-0014/0015) sin intervención.
- El recalc manual sigue siendo el único que liquida jokers/bonus y permite preview→confirm.
- **Reconciliación de datos en prod (one-off, hecha en este cambio):** se borró el `point_adjustments`
  manual de +100 a «Juan y Carlo» y la liquidación automática creó el `round_awards` equivalente
  (group-md1, ganador 100, round_points 560) — neto cero en el total, pero ahora «Juan y Carlo» luce
  el maillot azul, aparece en el palmarés y suma el evento de regularidad correcto.
- `roundKeyForMatch` lanza si un partido de grupo no trae matchday; `recomputeRoundAwards` ya lo
  captura y salta esa ronda (sin cambio).

## Changes landed

- **Code:** `lib/scoring/index.ts` — `distributionForRound` (+tests en `scoring.spec.ts`).
  `app/api/_lib.ts` — `recomputeRoundAwards` usa `distributionForRound` por ronda; nuevo helper
  `settleRoundAwardsAndRefresh`. `app/api/cron/update-results/route.ts`,
  `app/api/admin/sync-now/route.ts`, `app/admin/matches/actions.ts` (`saveResult`) — enganchan la
  liquidación automática (+`roundAwardsAffected` en la respuesta/audit y en el mensaje del admin).
  `app/standings/page.tsx` — `buildLiveRound` por completitud (ya no recibe `awards`).
- **Docs:** `CLAUDE.md` (regla de meta volante actualizada); this ADR; índice en
  `docs/decisions/README.md`.
