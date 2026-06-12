# ADR-0015: Meta volante — distribución de premios por posición

- **Date:** 2026-06-12
- **Status:** Accepted
- **Supersedes:** — (amplía la regla de meta volante de ADR-0001)

## Context

Desde ADR-0001 la meta volante era *winner-takes-all*: solo el campeón de cada ronda se llevaba
`meta_volante_points` (100). Con ~15–20 jugadores eso deja a casi todos sin nada aunque hagan una
gran ronda, y aplana la emoción de la pelea por las posiciones intermedias. Queremos repartir el
premio en escalera, al estilo de los sprints intermedios de una vuelta ciclista.

## Decision

Cada ronda reparte un premio **por posición** según una distribución configurable:

- **Defaults:** 1º = **100**, 2º = **50**, 3º = **50**, 4º–7º = **20**. A partir del 8º, nada.
- Nueva clave `app_settings.meta_volante_distribution: number[]` (`[1º, 2º, 3º, …]`); las
  posiciones más allá del array no premian. `meta_volante_points` queda **deprecada** (se mantiene
  en el blob espejada a `distribution[0]` por back-compat).
- **Ranking dentro de la ronda:** puntos de pronósticos desc → plenos (exact hits) desc.
- **Empate total** (mismos puntos Y mismos plenos, n jugadores): ocupan n posiciones consecutivas y
  **se reparten la suma de los premios de esas posiciones** con `floor(suma / n)` (resto se
  descarta — clasificación entera, como siempre). Un grupo empatado que cae a caballo del final de
  la distribución se reparte solo lo que queda.
- Solo compiten jugadores con `round_points > 0` (quien no puntúa en la ronda nunca ocupa una
  posición con premio; una ronda sin nadie positivo no reparte nada — igual que antes).
- Motor: nueva `pickRoundAwards(entries, distribution)` en `lib/scoring`;
  `pickRoundWinners(entries, points)` pasa a ser el caso particular `[points]` (wrapper,
  back-compat para tests). Los premios siguen calculándose **solo en el recalc manual**
  (ADR-0001/0012 sin cambios) y se persisten en `round_awards` (sin cambio de esquema: ya admitía
  N filas por ronda vía unicidad `(round_key, user_id)`).

## Alternatives considered

- **N claves escalares** (`meta_volante_2nd`, …) — rechazado: rígido y verboso; un array expresa
  cualquier escalera y el admin lo edita en una sola caja.
- **Reparto proporcional a los puntos de la ronda** — rechazado: difícil de explicar y de auditar;
  las posiciones fijas son legibles ("quedé 3º → +50").
- **Premiar también a los de 0 puntos si hay hueco** — rechazado: un premio debe ganarse; además
  preserva la regla histórica de "ronda sin positivos = sin premios".

## Consequences

- Más filas en `round_awards` por ronda (hasta 7+ con empates); `refresh_standings()` y la
  regularidad (verde, ADR-0014) las suman sin cambios — cada premio cuenta como un evento que
  puntúa.
- El desempate por plenos ahora también ordena posiciones intermedias (antes solo decidía el
  campeón).
- Requiere **recalc manual** para regenerar los premios de las rondas ya cerradas con la nueva
  distribución (preview → confirm, como siempre).
- `meta_volante_points` deprecada (como `jokers_per_user`); los lectores migrados leen la
  distribución.

## Changes landed

- **Contract:** `lib/types.ts` — `AppSettings.meta_volante_distribution` (+default
  `[100,50,50,20,20,20,20]`), `meta_volante_points` deprecada, comentario de `RoundAward`.
- **DB:** `db/migrations/0011_meta_volante_distribution.sql` — siembra idempotente de la clave en
  el blob (solo si falta); sin cambio de esquema.
- **Code:** `lib/scoring` — `pickRoundAwards` + `formatDistribution` (+tests);
  `app/api/_lib.ts#recomputeRoundAwards` recibe la distribución; `app/api/admin/recalc/route.ts`;
  loaders (`app/_lib/data.ts`, `app/admin/_lib.ts`); admin `/admin/scoring` (input CSV de
  premios); `components/MetaVolanteBoard.tsx` (premio por ganador y copy); `/rules` y
  `/standings`.
- **Docs:** `CLAUDE.md` (regla meta volante actualizada); `db/README.md` defaults; this ADR.
