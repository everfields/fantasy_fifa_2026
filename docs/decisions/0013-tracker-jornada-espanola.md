# ADR-0013: Tracker — jornada española (anoche + madrugada) y guardia anti-spoilers

- **Date:** 2026-06-12
- **Status:** Accepted
- **Supersedes:** — (refina ADR-0003)

## Context

El Mundial se juega en Norteamérica; la porra se vive en España. Un día de partidos allí cae a
caballo entre dos fechas españolas: los partidos de la tarde americana son "anoche" (21:00–00:00
España) y los de la noche americana son "madrugada" (01:00–05:00 España). El tracker agrupaba la
"jornada" por la fecha calendario UTC del kickoff, así que el parte de la mañana partía la jornada
real en dos: el del 12-jun solo analizó el Corea–Chequia (02:00Z) y dejó fuera la inauguración
México–Sudáfrica (19:00Z del 11).

Además, el parte del 12-jun reveló pronósticos futuros («Bondi ha repetido el mismo 2-0 dieciocho
veces»): los hallazgos de "perfil" se calculaban sobre TODAS las predicciones, incluidas las de
partidos sin empezar, que son editables hasta `locks_at`.

## Decision

1. **Jornada = día de la porra en España.** El parte de fecha D cubre los kickoffs en
   [D-1 12:00, D 12:00) Europe/Madrid — lo que los jugadores se encuentran al levantarse la mañana
   de D. Madrid es CEST (UTC+2) durante todo el torneo (11-jun – 19-jul-2026), así que
   `jornadaOf(kickoff) = fecha UTC de (kickoff + 14h)` (2h a Madrid + 12h para llevar el corte de
   mediodía a medianoche). Se usa tanto en el motor (`dayMatches`) como en el cron al elegir el
   día de parte automático.
2. **Guardia anti-spoilers (HARD RULE).** Solo entran al análisis predicciones de partidos
   `finished` — filtrado en `analyzePredictions` Y en el loader del cron (defensa en profundidad).
   Nada de un pronóstico pendiente (marcador, signo, consenso, medias, líneas repetidas) puede
   aparecer en contenido visible para jugadores.

## Alternatives considered

- **Agrupar por fecha local del estadio** — el torneo cruza 4 husos americanos; complica el dato y
  no representa la experiencia del jugador español. Rechazada.
- **Librería de timezones (luxon/date-fns-tz)** — innecesaria: el offset de Madrid es constante
  (CEST) durante toda la ventana del torneo. Un shift fijo de +14h mantiene el módulo puro y sin
  dependencias.

## Consequences

- El parte matinal resume la jornada completa (anoche + madrugada) como la vive el grupo.
- Un kickoff a las 19:00Z del día D pertenece al parte del D+1 — el `?date=` manual del cron sigue
  este criterio.
- Si se reutilizara el código fuera del horario CEST habría que revisar el shift fijo.
- Los hallazgos de "perfil" ahora solo cuentan predicciones resueltas (n más bajo al principio del
  torneo); los umbrales (`n >= 5`, `finishedN >= 6`) se alcanzan con el avance de la fase de grupos.

## Changes landed

- **Motor:** `lib/tracker/analysis.ts` — `jornadaOf` exportada (+14h, corte mediodía Madrid);
  filtro de spoilers al inicio de `analyzePredictions`.
- **Cron:** `app/api/cron/luis-tracker/route.ts` — `finishedDays` vía `jornadaOf`; filtro de
  predicciones a partidos `finished` en la carga.
- **Tests:** `lib/tracker/analysis.spec.ts` — test de jornada (anoche+madrugada juntos, corte a
  mediodía) y test de regresión del spoiler guard.
- **CLAUDE.md:** HARD RULE de no-spoilers en la sección del tracker.
