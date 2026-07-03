# ADR-0024: «La Etapa» — replay animado de la vuelta con timeline por jornadas

- **Date:** 2026-07-03
- **Status:** Accepted
- **Supersedes:** —

## Context

La general de `/standings` es una vuelta ciclista (ADR-0014/0016/0017), pero es estática: no se ve
*qué pasó* — quién adelantó a quién tras la última jornada, ni cómo evolucionó la carrera. Se pidió
una clasificación animada complementaria (no sustitutiva), estilo cartoon y con un timeline
navegable de toda la vuelta, 100 % presetada (sin LLM, sin compute en runtime).

Restricción clave descubierta: **no existe ningún historial de clasificaciones** —
`refresh_standings()` hace MERGE in place sobre `standings_cache`; el "antes" hay que
reconstruirlo.

## Decision

Nueva vista **`/standings/etapa`** (botón «🚴 Ver la etapa» en `/standings`): una escena horizontal
de carrera donde los corredores (un único personaje cartoon, misma cara para todos, diferenciados
SOLO por maillot + chip de nombre) ruedan agrupados según `groupPeloton`, con replay etapa a etapa.

**Timeline reconstruido del ledger, sin migraciones.** `buildEtapaTimeline`
(`lib/classifications/etapa.ts`, puro, testeado) genera una `EtapaStage` por **jornada** (día UTC
del kickoff, mismo criterio que `matchdayKey`) con ≥1 partido finished. Atribución de cada fuente
de puntos a su jornada:

- `predictions.points_awarded` → jornada del kickoff del partido.
- `round_awards` → jornada del último partido finished de su ronda (así asienta ADR-0018).
- `bonus_answers` → jornada del `locks_at` de la pregunta (el grading no tiene historial; el lock es
  estable).
- `point_adjustments` → jornada de `created_at`.
- Fuentes anteriores a la primera etapa cuentan desde la etapa 1; posteriores a la última se pliegan
  en la última ⇒ **la etapa final SIEMPRE cuadra con la clasificación actual** (asegurado en el
  spec).

Cada stage recomputa con las funciones canónicas puras (`groupPeloton`, `computeRegularity`,
`computeMontana`, `assignMaillots`, `assignAstons`) el estado completo de aquel día — se puede ver
quién vestía el amarillo en la etapa 3 — más el **guion de adelantamientos** (diff de posiciones vs
la etapa anterior, menor ganancia primero) y un layout de escena determinista (x 0..100 por grupos
con huecos ∝ √gap, carriles en abanico, pose, jóker/montaña, highlights).

**Reparto (casting).** Líder = tuck de crono a lo Induráin (gafas negras, cadencia rápida, speed
lines); rezagados = lengua fuera; Astons = casco de F1 + safety car (el `AstonBadge`) rodando
detrás; farolillo rojo = farolillo literal colgando del sillín (brilla en dark mode = etapa
nocturna); adelantamiento = pase lento y chulesco haciendo el shaka 🤙.

**Animación presetada.** Loops idle en CSS puro (`etapa.module.css`: pedaleo, radios, lengua,
farolillo, carretera); coreografía de posiciones con `motion` (framer-motion v12, **nueva
dependencia**, aislada en la ruta — `/standings` no engorda) vía tweens con delays escalonados: los
≤4 mayores adelantamientos de la etapa reciben su beat en secuencia. Modos: película de etapa
(auto-play de la última al entrar), scrub estático, «Ver la vuelta» encadenada, «Repetir etapa».
`prefers-reduced-motion` desactiva loops y autoplay (media query + `useReducedMotion`).

## Alternatives considered

- **Lottie / assets prefabricados** — rechazado: no podemos autorar .json de After Effects ni
  parametrizar el maillot por corredor; los fills de `MaillotBadge` ya existen como SVG.
- **Tabla `standings_history` aditiva** — rechazado (por ahora): migración + ceremonia de backup en
  prod para una feature cosmética; el ledger ya permite reconstruir todo. Si algún día el scoring
  config cambia a mitad de torneo y se quiere fidelidad histórica exacta, reevaluar.
- **localStorage con la última clasificación vista** — rechazado: cada usuario vería una película
  distinta y la primera visita no tendría diff.
- **Personajes únicos por corredor** — rechazado por el product owner: mismo careto para todos;
  la identidad es el maillot + nombre.

## Consequences

- Caveat documentado: `points_awarded` refleja la config de scoring VIGENTE (un recalc reescribe la
  historia) — la vuelta se recuenta siempre con las reglas de hoy. Aceptado.
- El bonus se atribuye al `locks_at`, no al momento real del grading — aproximación determinista.
- `assignMaillots` acepta ahora `Pick<RoundAward, "round_key" | "user_id" | "round_points">[]`
  (ensanchamiento de tipo, sin cambio de comportamiento).
- `loadEmailMap()` se movió de `app/standings/page.tsx` a `app/_lib/data.ts` (refactor puro; los
  emails siguen sin llegar jamás al cliente — la escena consume solo `MaillotKey`s resueltos).
- Payload: el timeline completo viaja en el HTML de `/standings/etapa` (~decenas de KB con ~20
  jugadores × ~25 jornadas); campos mínimos, ids opacos, sin pronósticos individuales más allá de
  puntos ya otorgados. Sin spoilers: solo partidos `finished` entran en el timeline.
- Pendiente (nice-to-have): QA visual en móvil real; pan de cámara más fino durante la película.

## Changes landed

- **Contract:** `lib/types.ts` — tipos `EtapaTimeline/EtapaStage/EtapaRider/EtapaOvertake/…`.
- **Code:** `lib/classifications/etapa.ts` (+ `etapa.spec.ts`, 18 tests; export en `index.ts`);
  `components/etapa/` (`EtapaPlayer.tsx`, `Ciclista.tsx`, `jerseys.tsx`, `etapa.module.css`);
  `app/standings/etapa/page.tsx`; botón en `app/standings/page.tsx`; `loadEmailMap` a
  `app/_lib/data.ts`.
- **Deps:** `motion` ^12 (solo cliente, solo esta ruta).
- **DB:** — (cero migraciones).
- **Docs:** línea nueva en `CLAUDE.md` (directory map + clasificaciones); este ADR.
