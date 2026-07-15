# ADR-0025: La meta volante termina en cuartos — semis y final no reparten

- **Date:** 2026-07-16
- **Status:** Accepted
- **Supersedes:** — (refina ADR-0015/ADR-0018: la escalera de rondas ya no incluye semis ni final)

## Context

La meta volante repartía premio en TODAS las rondas (jornadas de grupos + cada eliminatoria,
con la final absorbiendo el tercer puesto). El grupo decidió que las semifinales y la final
no deben repartir meta volante: con solo 2 partidos (semis) o 2 partidos (final + 3er puesto),
la ronda es demasiado corta — un acierto de signo (20 pts) bastaba para colarse en la escalera
y el reparto degeneraba en empates masivos. De hecho así ocurrió: al terminar las semis
(2026-07-15) el settlement automático (ADR-0018) pagó la ronda `semi` — 100 pts al 1º
(Alvaro O Rei Poll, 170 pts de ronda) y 16 pts a ONCE jugadores empatados a 20 pts
(2º–7º = 50+50+20+20+20+20 = 180 → floor(180/11) = 16). Esos 276 puntos ya estaban sumados
en `standings_cache` y había que retirarlos.

## Decision

1. **Regla:** la meta volante paga en `group-md1` (solo 1º, ADR-0018), `group-md2`,
   `group-md3`, `round_of_32`, `round_of_16` y `quarter`. Las rondas `semi` y `final`
   (que incluye el 3er puesto) **no reparten nada**.
2. **Implementación en un único punto:** `distributionForRound` (`lib/scoring`) devuelve `[]`
   para `semi`/`final`. Todos los caminos de settlement (cron `update-results`, «Sync ahora»,
   `saveResult` del admin y el recalc manual) pasan por `recomputeRoundAwards` →
   `distributionForRound`, así que la regla es consistente en todas partes. Con distribución
   vacía la ronda sigue siendo *eligible* pero su conjunto deseado es vacío → el diff
   idempotente de `recomputeRoundAwards` **borra** cualquier award ya persistido de esas
   rondas (su propio camino de «stragglers»). Es autocurativo: si un recalc con código viejo
   los resucitara, el siguiente settlement con código nuevo los volvería a quitar.
3. **Datos (aplicado 2026-07-16):** backup REST completo en
   `db/backups/rest_20260715T225535Z/` (predictions paginadas — 1732 filas), borrado de las
   12 filas `round_key='semi'` de `round_awards` (−276 pts), `refresh_standings()` y entrada
   en `audit_log` (`meta_volante_semi_final_removed`). Verificado contra el snapshot:
   suma de deltas de `total_points` = −276 exacto. Iulian y Raderof quedan con `meta_points = 0`
   y pierden el maillot azul (su única ronda ganada era la semi) — consecuencia coherente.
4. **UI:** `/standings` ya no muestra «Ronda en curso» para semis/final (ROUND_SEQ del live
   board termina en `quarter`); los textos explicativos de `/rules` y del pie del
   `MetaVolanteBoard` dicen «hasta cuartos». Las etiquetas `semi`/`final` se conservan en el
   board por robustez de render histórico.

## Alternatives considered

- **Borrar solo los datos sin tocar el código** — rechazado: el settlement automático de la
  final (19-jul) o cualquier recalc manual los habría re-otorgado.
- **Filtrar semis/final en `recomputeRoundAwards` (excluirlas de las rondas elegibles)** —
  rechazado: una ronda no-elegible nunca se recomputa, así que los awards viejos NO se
  borrarían solos; habría hecho falta un delete ad-hoc adicional. Con distribución vacía el
  mecanismo idempotente existente hace la limpieza.
- **Poner la distribución a ceros en `app_settings`** — rechazado: la distribución es global,
  no por ronda; anularla habría matado también las rondas legítimas.

## Consequences

- Operativo: nunca más se otorgan awards de `semi`/`final`; el live board no muestra sprint
  provisional en esas rondas; el maillot azul solo puede ganarse hasta cuartos.
- **DEPLOY REQUERIDO ANTES DE LA FINAL (2026-07-19):** si la final termina con el código viejo
  desplegado, el settlement re-otorgará `semi` Y pagará `final`. (El cron rutinario no toca
  awards salvo que un partido acabe de terminar, así que no hay riesgo entre medias.)
- De regalo, `db/backup-rest.sh` arreglado: paginación de `predictions` (antes truncaba en
  silencio a 1000 filas por el cap de PostgREST — regla 8/ADR-0021) y `--ssl-no-revoke`
  (en redes corporativas con inspección TLS el schannel de curl fallaba con exit 35 y el
  backup diario entero abortaba por `set -e`).

## Changes landed

- **Code:** `lib/scoring/index.ts` (`distributionForRound` → `[]` para `semi`/`final`),
  `lib/scoring/scoring.spec.ts` (tests nuevos), `app/standings/page.tsx` (ROUND_SEQ),
  `app/rules/page.tsx` + `components/MetaVolanteBoard.tsx` (textos), `db/backup-rest.sh`
  (paginación + `--ssl-no-revoke`).
- **DB (datos, no schema):** 12 filas de `round_awards` borradas + `refresh_standings()` +
  audit; backup previo en `db/backups/rest_20260715T225535Z/`.
- **Docs:** `CLAUDE.md` (bloque «Meta volante») actualizado; este ADR añadido.
