# ADR-0014: Clasificaciones ciclistas — pelotón dinámico, montaña, regularidad y maillots

- **Date:** 2026-06-12
- **Status:** Accepted
- **Supersedes:** —

## Context

La clasificación general (`/standings`) era una tabla plana. El objetivo es hacerla "más simpática
y divertida" dándole el lenguaje de una vuelta ciclista: el grupo de amigos ya usa metáforas de
carrera (las **metas volantes** del ADR-0001 ya eran ciclistas). Requisitos del propietario:

1. **General por grupos de carrera** — fuga / grupo de cabeza / perseguidores / pelotón /
   rezagados, **calculados dinámicamente de la distribución de puntos** en cada actualización,
   nunca posiciones fijas. Con la clasificación del 2026-06-12 (3 líderes a 100, Pablo M.H a 70,
   4 jugadores a 50, 9 a 20) el resultado esperado es: sin fuga, cabeza = los tres de 100,
   perseguidor = Pablo, pelotón = el resto, sin rezagados.
2. **Montaña** (maillot de lunares) — solo puntúan ~21 partidos en 7 "etapas" de 3, espaciadas,
   nunca jókers, nunca partidos de España, nunca cuartos/semis/final.
3. **Regularidad** (maillot verde) — cuenta *cuántas veces* se puntúa, no cuánto: un signo vale
   igual que un exacto; bonus y metas volantes cuentan 1 cada uno.
4. **Mejor joven** (maillot blanco) — roster fijo: Juan y Carlo, alberandu, Pablo M.H.
5. **Maillot amarillo** al líder de la general; **arcoíris** fijo para JM (campeón de la edición
   anterior). Los jugadores fijos se identifican **por email**, robusto frente a cambios de nick.

## Decision

### Módulo puro `lib/classifications/` (mismo régimen que `lib/scoring`: sin I/O, unit-testeado)

**Pelotón dinámico** (`peloton.ts`, `groupPeloton(rows, {signPoints, exactPoints})`):

1. Umbral de corte `T = max(sign, ceil(0.1 × (líder − último)))` — escala con la dispersión, nunca
   por debajo de un acierto de signo.
2. Clústeres: corte entre corredores consecutivos con gap ≥ T.
3. **Pelotón = clúster más grande** (empate de tamaño → el más retrasado).
4. **Consolidación**: mientras haya más de `max(3, 30% de N)` corredores por delante del pelotón,
   éste absorbe el clúster inmediatamente anterior (las escapadas son pequeñas por definición; si
   un tercio de la carrera va "delante del pelotón", eso *es* el pelotón).
5. Etiquetas por delante (de delante atrás): la primera es **fuga** solo si tiene ≤ 3 corredores y
   su gap con el siguiente ≥ `max(exact, 2×T)`; la última antes del pelotón = **perseguidores**;
   lo demás se funde en **cabeza**. Por detrás, todo se funde en **rezagados**.
6. Casos borde: N ≤ 4 o todos empatados → un único grupo `peloton`.

El snapshot real de prod del 2026-06-12 es el **test canónico de regresión** (`peloton.spec.ts`)
y reproduce exactamente la lectura del propietario (punto 1 del contexto).

**Montaña** (`montana.ts`): `computeMontana` suma `points_awarded` solo de partidos `finished` con
`montana_stage != null`; desempate por exactos en esos partidos, luego fecha de alta.
`pickMontanaStages` es la selección automática de etapas: **determinista e incremental** — elegible
= grupos/R32/R16, sin jóker, sin España, ambos equipos conocidos, `scheduled`, kickoff ≥ now+24h;
agrupa por día natural de Madrid (UTC+2 fijo), reparte etapas uniformemente y exige ≥ 2 días entre
etapas; de cada día elige los 3 kickoffs más tardíos (los horarios raros son los divertidos).
Como los cruces aún no tienen equipos, asigna ahora las etapas de grupos y **se re-ejecuta desde el
admin** cuando el cuadro esté asignado para completar las 7.

**Regularidad** (`regularity.ts`): `hits = predicciones con puntos > 0 en partidos finished +
respuestas bonus con puntos > 0 + premios de meta volante` (1 por evento, da igual la cuantía).
Orden: hits → total general → fecha de alta.

**Maillots** (`maillots.ts`, `assignMaillots`): amarillo = 1º de la general con puntos (empate a
todo → fecha de alta más antigua, como pidió el propietario); verde = 1º regularidad; lunares = 1º
montaña; blanco = mejor clasificado del roster joven; arcoíris = JM siempre; **rojo (farolillo
rojo)** = último de la general — extra propuesto, guiño clásico del ciclismo. Un jugador puede
acumular varios. Roster fijo en `config.ts` **por email** (`MAILLOT_ARCOIRIS_EMAIL`,
`MAILLOT_BLANCO_EMAILS`).

### Esquema (migración additiva `0010_cycling_classifications.sql`)

- `matches.montana_stage smallint null` + CHECK `matches_montana_not_joker`
  (`not (is_joker and montana_stage is not null)`) + CHECK de rango 1..21 + índice parcial.
  Público vía la RLS existente de `matches` (los jugadores deben ver qué partidos son de montaña).
- `public.profile_emails()` — `security definer`, **solo ejecutable por `service_role`**: el
  servidor resuelve los maillots fijos por email sin exponer emails al cliente jamás.

### UI

`/standings` pasa a 6 pestañas: **General** (PelotonBoard: grupos con banderola, gaps "a X pts del
líder", maillots SVG junto al nombre + leyenda), **Montaña** (clasificación + tarjetas de etapa),
**Regularidad**, **Jóvenes**, Meta volante y Evolución (intactas). Componentes nuevos:
`MaillotBadge` (SVG con variantes amarillo/verde/lunares/blanco/arcoíris/rojo), `PelotonBoard`,
`MontanaBoard`, `RegularityBoard`; `RankingTable` gana props opcionales `maillots`/`hideHeader`.
Admin: botón "Auto-asignar etapas de montaña" + editor de etapa por partido en `/admin/matches`,
con guardas en ambos sentidos del conflicto jóker↔montaña.

## Alternatives considered

- **Grupos por posiciones fijas** (1º–3º cabeza, etc.) — rechazado explícitamente por el
  propietario: los grupos deben emerger de la distribución real.
- **Clustering estadístico (k-means/Jenks)** — descartado: opaco, no determinista con empates y
  difícil de explicar en el grupo ("¿por qué estoy en el pelotón?"). El corte por gaps con
  consolidación es explicable en una frase y se calibró con el snapshot real.
- **Etapas de montaña en tabla propia** — innecesario: una columna en `matches` mantiene la verdad
  junto al partido, la RLS ya existe y el CHECK garantiza la exclusión con el jóker.
- **Emails de los fijos en `app_settings`** — rechazado: `app_settings` es legible por clientes y
  filtraría emails. Constantes en código + `profile_emails()` restringida a service_role.
- **Regularidad como vista SQL** — innecesario: todos los datos puntuados son post-cierre por
  construcción (la RLS expone predicciones/respuestas bloqueadas), así que la página los agrega en
  el servidor sin riesgo de spoiler ni service client.

## Consequences

- Nuevas invariantes: un partido jóker nunca es etapa de montaña (CHECK en DB + guardas en admin);
  los maillots fijos se resuelven por email solo en servidor; las clasificaciones derivadas se
  computan en render desde datos ya puntuados — **ningún estado nuevo que recalcular** salvo
  `montana_stage` (asignación admin, nunca afecta a `points_awarded`).
- El no-spoiler del ADR-0013 sigue intacto: regularidad/montaña solo agregan partidos `finished`.
- Pendiente operativo: re-ejecutar el auto-pick cuando el admin asigne equipos de R32/R16 para
  completar las 7 etapas (quedará recordado en el panel admin).

## Changes landed

- **Contract:** `lib/types.ts` — `MaillotKey`, `PelotonGroupKey`, `PelotonGroup`, `RegularityRow`,
  `MontanaRow`, `MontanaEtapa`, `Match.montana_stage`.
- **DB:** `db/migrations/0010_cycling_classifications.sql` (aplicada a prod con backup previo).
- **Code:** `lib/classifications/*` (+ specs), `components/MaillotBadge|PelotonBoard|MontanaBoard|RegularityBoard`,
  `components/RankingTable` (props nuevas), `app/standings/page.tsx`, admin de montaña en
  `app/admin/matches`.
- **Docs:** este ADR; `CLAUDE.md` (sección nueva "Clasificaciones ciclistas"); índice del log.
