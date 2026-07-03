# ADR-0022: Auto-propagación del cuadro de eliminatorias (ganador → siguiente ronda)

- **Date:** 2026-07-03
- **Status:** Accepted
- **Supersedes:** — (extiende ADR-0011: la asignación de cruces deja de ser solo manual)

## Context

ADR-0011 dejó la asignación de equipos en eliminatorias como tarea 100% manual del admin
(`saveTeams`), con la matriz FIFA de terceros explícitamente aplazada. Con los dieciseisavos en
marcha quedó claro el coste: cada vez que un partido termina (p. ej. Portugal gana a Croacia), el
admin tiene que entrar y colocar a mano al ganador en el partido de la siguiente ronda. El modelo
de datos no tenía NINGUNA estructura de cuadro: ni número de partido FIFA, ni «alimenta a», ni
forma de representar al ganador de una eliminatoria empatada (penaltis).

## Decision

**El cuadro se declara una vez (admin) y se propaga solo (código).**

- **Esquema (migración `0013_bracket_sources.sql`, aditiva):** `matches` gana
  `home_source`/`away_source` (uuid → `matches.id`: el partido cuyo resultado llena ese hueco),
  `home_source_kind`/`away_source_kind` (`'winner' | 'loser'`, default `winner` — `loser` alimenta
  el 3er puesto desde las semis) y `penalty_winner` (uuid → `teams.id`: ganador en penaltis cuando
  el partido acaba empatado). CHECK `matches_bracket_knockout_only`: todo NULL en fase de grupos.
- **Lógica pura:** `lib/tournament/bracket.ts` — `matchOutcome`/`resolveSlot`. Solo decide con
  `status='finished'`, ambos marcadores y ambos equipos; un empate solo se resuelve si
  `penalty_winner` coincide con uno de los dos equipos; si no, indeterminable (se salta).
- **Propagación:** `propagateKnockoutBracket(sourceMatchIds)` en `app/api/_lib.ts` (service role,
  idempotente, audita `propagate_bracket`). Solo escribe en dependientes `scheduled` (nunca
  live/finished: pronósticos bloqueados/puntuados); una resolución NULL nunca borra un equipo ya
  asignado; una resolución distinta sobreescribe (correcciones de resultado re-propagan). UPDATE
  in place de `home_team`/`away_team` únicamente (regla 7 intacta).
- **Disparadores (los mismos 3 puntos de «finish» de ADR-0012/0018):** cron `update-results`,
  «Sync ahora» y `saveResult` del admin. `saveSources` (nuevo) también propaga al configurar un
  origen cuyo partido ya terminó.
- **Admin UI (`/admin/matches`):** editor «Cruce» por partido de eliminatoria (origen Local /
  Visitante + Ganador/Perdedor de) y, en el editor de resultado, selector «Ganador en penaltis»
  cuando el marcador introducido es empate. `saveTeams` manual sigue existiendo como override
  autoritativo.

## Alternatives considered

- **Inferir el cuadro de FIFA por número de partido** — rechazado: las filas no tienen número FIFA
  y mapear por orden de kickoff es frágil. El admin declara el cuadro una vez y queda auditado.
- **Propagar también grupos → dieciseisavos (1A/2B/mejores terceros)** — aplazado igual que en
  ADR-0011: la matriz de asignación de terceros es compleja y los dieciseisavos de 2026 ya están
  jugados; sin valor este Mundial.
- **Columna `winner_team` calculada** — innecesaria: el ganador se deriva del marcador +
  `penalty_winner`; una sola fuente de verdad.

## Consequences

- Configurado el cuadro, los ganadores aparecen en la siguiente ronda sin intervención humana,
  también con correcciones de resultado. Los empates a 90'/prórroga requieren que el admin marque
  el ganador en penaltis (el proveedor LLM no lo captura — posible mejora futura).
- La propagación NUNCA toca partidos ya bloqueados; si un cruce se descubre tarde (partido
  siguiente ya live), sigue haciendo falta el override manual.
- Pendiente al escribir esto: aplicar 0013 en prod + backfill de los `*_source` del cuadro real.

## Changes landed

- **Contract:** `lib/types.ts` — `Match.home_source/away_source/home_source_kind/away_source_kind/penalty_winner`, `SlotSourceKind`.
- **DB:** `db/migrations/0013_bracket_sources.sql`; índice en `db/README.md`.
- **Code:** `lib/tournament/bracket.ts` (+`bracket.spec.ts`, 13 tests), `app/api/_lib.ts`
  (`propagateKnockoutBracket`), wiring en `app/api/cron/update-results` y `app/api/admin/sync-now`
  (contador `bracketPropagated`), `app/admin/matches/actions.ts` (`saveSources`, `saveResult` +
  `penalty_winner`), `components/admin/MatchRow.tsx`, `app/admin/matches/page.tsx`.
- **Docs:** línea de `lib/tournament` y regla de cruces en `CLAUDE.md`; este ADR.
