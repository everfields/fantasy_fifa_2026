# Decision Log (ADRs)

This is the project's **incremental, persistent memory**. `PROJECT_PLAN.md` is the frozen v0
baseline; everything that changed since lives here, one **Architecture/Decision Record** (ADR) per
significant change. Read newest-to-oldest to understand how the system got to where it is.

**Precedence when docs disagree:** latest ADR > `CLAUDE.md` (current operative rules) > `PROJECT_PLAN.md` (baseline).

## Index

| # | Date | Title | Status | Summary |
|---|------|-------|--------|---------|
| [0001](0001-scoring-overhaul.md) | 2026-06-09 | Scoring system overhaul | Accepted (code merged, migration unapplied) | ×10 points, admin-assigned jokers, meta volante, group-winner bonuses, free-text bonus type |
| [0002](0002-manual-results-no-live-data.md) | 2026-06-09 | Manual results — no live data provider | Accepted | Admin enters scores by hand + manual recalc; cron & external poller removed; provider/route kept dormant |
| [0003](0003-luis-de-la-tracker.md) | 2026-06-10 | "Luis de la Tracker" — AI prediction-strategy tracker | Accepted | Daily cron → pure analysis → LLM (Anthropic SDK, persona del míster) → 5 key findings in `tracker_reports`; `/tracker` page + dashboard teaser; single daily `crons` re-added (Hobby-legal) |
| [0004](0004-admin-tools-manual-text-grading.md) | 2026-06-10 | Admin tools — delete bonus, point adjustments, manual text grading | Accepted | Delete bonus questions from admin; `point_adjustments` table (± points with reason) folded into standings; `text` bonus graded per-answer by the admin (`bonus_answers.manual_correct`), no string matching; recalc now grades bonus answers (bug fix) |
| [0005](0005-remove-chat.md) | 2026-06-10 | Remove the in-app chat | Accepted | `/chat` placeholder deleted — the group chats on WhatsApp; nav + dashboard link removed; no DB impact (`messages` table was never created) |
| [0006](0006-bonus-categories.md) | 2026-06-10 | Bonus questions in 3 visual blocks | Accepted | `bonus_questions.category` (`group_winner`/`spain_scorer`/`tournament`); `/bonus` + `/admin/bonus` render 3 sections; migration 0007 seeds Spain first-scorer (×3), pichichi and Curazao questions idempotently |
| [0007](0007-data-safety-guardrails.md) | 2026-06-10 | Data-safety guardrails — predictions can never be lost | Accepted | Seed files abort if player data exists; `db/backup.sh` one-command backup; additive-only migrations post-launch; never delete/truncate `matches`/`teams`/`bonus_questions` (FK cascades wipe predictions); rules in `db/README.md` "Data safety" |
| [0008](0008-dark-mode.md) | 2026-06-10 | Dark mode (class-based, next-themes) | Accepted | `next-themes` provider + nav toggle activates the existing `.dark` palette; system default, user override persisted; admin converted from hardcoded zinc to semantic tokens; rule: new UI uses theme tokens |
| [0009](0009-live-results-llm-web-search.md) | 2026-06-10 | Live results via LLM web search + pg_cron scheduler | Accepted | Supersedes 0002: `LlmWebSearchProvider` (Haiku + web_search, two polls/match, FT-confirmation rule) feeds the dormant `update-results` route; Supabase pg_cron+pg_net every 15 min (Vault secrets); auto-scoring on finish; meta volante/bonus stay manual-recalc; Luis cron → 04:30 UTC |
| [0010](0010-pot-payout-model.md) | 2026-06-10 | Pot payout model | Accepted | 20 € entry fee; 2º gets stake back; 20 € domain + infra costs reimbursed to the organizer; 1º takes the rest; `pot_amount` derived (`entry_fee × paid`); players see only the two prizes on `/standings` |
| [0011](0011-mundial-section.md) | 2026-06-10 | "Mundial" section — local standings + bracket from matches | Accepted | `/mundial`: group tables computed purely from `matches` (FIFA criteria; non-computable ties flagged), best-thirds ranking, bracket rendered from knockout rows; admin assigns knockout teams (`saveTeams`); no LLM; vitest infra fixed (`npm test`, 139 tests) |
| [0012](0012-matchday-ops.md) | 2026-06-11 | Matchday ops — auto-rescore on manual result save + live meta volante view | Accepted | «Sync ahora» body fix (`matchId`); `saveResult` rescores its match idempotently + refreshes standings (full recalc still owns jokers/bonus/meta volante); Meta volante tab shows a provisional current-round standing computed from scored predictions (awards still granted only at recalc) |
| [0013](0013-tracker-jornada-espanola.md) | 2026-06-12 | Tracker — jornada española (anoche + madrugada) + guardia anti-spoilers | Accepted | El parte de fecha D cubre kickoffs en [D-1 12:00, D 12:00) hora Madrid (`jornadaOf` = +14h); solo predicciones de partidos `finished` entran al análisis (filtro en motor y cron); HARD RULE: nunca revelar nada de pronósticos pendientes |
| [0014](0014-cycling-classifications.md) | 2026-06-12 | Clasificaciones ciclistas — pelotón dinámico, montaña, regularidad y maillots | Accepted | `/standings` estilo vuelta: grupos de carrera calculados de la distribución (gaps + consolidación, `lib/classifications`); montaña = 7 etapas × 3 partidos (`matches.montana_stage`, sin jóker/España/QF+, auto-pick incremental); regularidad = nº de veces que puntúas; maillots amarillo/verde/lunares/blanco/arcoíris/rojo (fijos por email, `profile_emails()` solo service_role) |
| [0015](0015-meta-volante-distribution.md) | 2026-06-12 | Meta volante — distribución de premios por posición | Accepted | Deja de ser winner-takes-all: `app_settings.meta_volante_distribution` (1º=100, 2º=50, 3º=50, 4º–7º=20); ranking por puntos de ronda → plenos; empates totales reparten la suma de sus posiciones (`floor`); solo `round_points > 0` premia; `pickRoundAwards` en `lib/scoring`; `meta_volante_points` deprecada; migración 0011 siembra la clave |
| [0016](0016-maillot-azul-ui-consistency.md) | 2026-06-12 | Maillot azul + consistencia visual y de lenguaje en las clasificaciones | Accepted | `MaillotKey` += `azul`: lo viste todo ganador de ronda de meta volante (varios a la vez; `assignMaillots` con `roundAwards`); terminología «corredor» en toda UI de clasificaciones; `RankBadge`/`initials` compartidos (`components/classifications.tsx`) + chrome unificado; en móvil `/standings` sin h1 ni botón Bote — el bote vive en `/rules`; `PotDialog` eliminado |
| [0017](0017-extremadura-monars-classifications.md) | 2026-06-14 | Clasificaciones Extremadura y Monars (maillots de peña) | Accepted | Dos maillots de roster fijo por email (mecánica del `blanco`): `extremadura` (bandera extremeña verde/blanco/negro) y `monars` (bandera de Canarias con "M"); el maillot lo viste el mejor de la general del roster; dos pestañas en `/standings` tras "Jóvenes"; sin DB ni recalc — derivado en render |
| [0018](0018-meta-volante-auto-settlement.md) | 2026-06-18 | Meta volante — liquidación automática al cerrar la ronda + 1ª ronda winner-takes-all | Accepted | Los premios de ronda se otorgan SOLOS al terminar el último partido (helper `settleRoundAwardsAndRefresh` en cron/sync-now/`saveResult`, idempotente; jokers/bonus siguen manuales); `distributionForRound` hace `group-md1` winner-takes-all y el resto escalera completa; `buildLiveRound` pasa a basarse en completitud (una ronda cerrada ya no se queda "en curso") |
| [0019](0019-bonus-answers-reveal.md) | 2026-06-24 | Revelar las respuestas bonus del resto del grupo tras el cierre | Accepted | Reutiliza la RLS existente de `bonus_answers` (propias siempre; ajenas solo tras `locks_at`): panel desplegable "Respuestas del grupo" bajo cada pregunta cerrada en `/bonus` + vista por jugador en `/bonus/[playerId]` con selector de corredores. Sin migración ni recalc; nunca expone emails |
| [0020](0020-fix-bonus-protect-trigger.md) | 2026-06-25 | Fix: las puntuaciones bonus nunca se guardaban (`security definer` rompía el trigger) | Accepted | `bonus_answers_protect_admin_cols()` era `security definer`, así que `current_user` era el dueño (no `service_role`): el motor de scoring veía su escritura de `points_awarded` revertida a `null` en cada recalc/cierre. Migración 0012 lo recrea como `security invoker`; `closeBonus` ahora puntúa en el sitio y refresca. Pendiente: aplicar 0012 a prod + re-cerrar grupos A/B |
| [0021](0021-paginate-predictions-1000-row-cap.md) | 2026-06-26 | Fix: el tope de 1000 filas de PostgREST truncaba las lecturas de `predictions` | Accepted | `predictions` superó las 1000 filas (1116): un `.select("*")` sin paginar devolvía solo las primeras 1000 SIN error, así que la meta volante "en curso" infravaloraba puntos (a alberandu le caía su pleno de 50 en la cola descartada → mostraba 40). Mismo fallo latente en el recalc manual y en la liquidación de rondas. Nuevo helper `selectAll` (`lib/supabase/paginate.ts`) pagina con `.range()`; aplicado en `/standings`, recalc y `app/api/_lib.ts`. Sin corrupción de datos (era lectura) — no hace falta migración |
| [0022](0022-knockout-auto-propagation.md) | 2026-07-03 | Auto-propagación del cuadro de eliminatorias (ganador → siguiente ronda) | Accepted | El admin declara el cuadro una vez (`matches.home_source`/`away_source` + `winner\|loser`, migración 0013) y `propagateKnockoutBracket` coloca solo al ganador (o perdedor, para el 3er puesto) en la siguiente ronda al terminar cada partido (cron/«Sync ahora»/`saveResult`/`saveSources`; idempotente, solo dependientes `scheduled`, auditado). `penalty_winner` resuelve empates; editor «Cruce» + selector de penaltis en `/admin/matches`. Extiende ADR-0011 |
| [0023](0023-provider-diagnostics-four-polls.md) | 2026-07-03 | Diagnóstico del proveedor en las respuestas del cron + 4 sondeos por partido | Accepted | Incidente: la API key de Anthropic murió el 2026-06-23 y el poller informó `ok:true, providerMatches:0` durante 10 días (el error se tragaba en `llmWebSearch`) — todos los resultados desde entonces los metió el admin a mano. `getLiveMatches` devuelve ahora `LiveMatchesResult` (`matches`, `candidatesInWindow`, `providerError`) y las rutas cron/sync lo exponen en su JSON (visible en `net._http_response` y en «Sync ahora»). Además, 4 ventanas de sondeo por partido (20–45′, 45–70′, 80–110′, 115′+) en vez de 2; `finished` sigue exigiendo confirmación explícita de final |
| [0024](0024-etapa-animada.md) | 2026-07-03 | «La Etapa»: replay animado de la vuelta en /standings/etapa con timeline por jornadas | Accepted | Vista cartoon complementaria de la general: un único personaje (identidad = maillot + nombre), líder en tuck de crono, rezagados con la lengua fuera, cascos F1 para los Astons, shaka 🤙 en los adelantamientos. Sin snapshot en DB: `buildEtapaTimeline` reconstruye cada jornada del ledger (predicciones→kickoff, awards→cierre de ronda, bonus→locks_at, ajustes→created_at; la última etapa cuadra siempre con la actual). Loops en CSS + coreografía con `motion` (dep nueva, aislada en la ruta); cero LLM, cero migraciones |
| [0025](0025-meta-volante-ends-at-quarters.md) | 2026-07-16 | La meta volante termina en cuartos: semis y final no reparten | Accepted | Con 2 partidos por ronda el reparto degeneraba (semis: 11 empatados a 20 pts cobraron 16 cada uno). `distributionForRound` devuelve `[]` para `semi`/`final` — al ser la ronda elegible con conjunto deseado vacío, el diff idempotente de `recomputeRoundAwards` borra solo los awards ya persistidos (autocurativo en todos los caminos de settlement). Datos aplicados a prod el 2026-07-16: backup + 12 filas `semi` borradas (−276 pts) + refresh + audit. Deploy necesario ANTES de la final (19-jul) o el settlement viejo los resucita |

## Everything in one document

Prefer a single combined view? Run `npm run adr:build` (generator:
[`build-combined.mjs`](build-combined.mjs)) to regenerate two always-in-sync artifacts from the
individual ADR files:

- **[`ALL.md`](ALL.md)** — every ADR concatenated, with a TOC. Renders on GitHub / in any editor.
- **[`index.html`](index.html)** — a self-contained browsable page (sidebar TOC + rendered
  markdown, light/dark). Open it directly in a browser.

Both are generated; **don't edit them by hand** — edit the source `NNNN-*.md` and re-run the build.

## How to add a decision

1. Copy [`0000-template.md`](0000-template.md) → `NNNN-short-slug.md` (next number, zero-padded).
2. Fill it in: **Context → Decision → Consequences**, plus what code/schema/docs changed.
3. Add a row to the table above (newest at the bottom or top — keep it chronological).
4. If the decision changes an **operative rule** (something Claude must follow), update the relevant
   line in `CLAUDE.md` and link back to the ADR. Do **not** edit `PROJECT_PLAN.md`.
5. Keep ADRs append-only: don't rewrite history. To reverse a past decision, write a *new* ADR that
   supersedes it and set the old one's status to `Superseded by NNNN`.
6. Run `npm run adr:build` to refresh the combined `ALL.md` / `index.html`.

## Conventions

- **Status** values: `Proposed` · `Accepted` · `Superseded by NNNN` · `Deprecated`.
- One decision per file. Keep it concrete: cite files, schema objects, settings keys.
- Record the *why* and the alternatives considered, not just the *what* — that's the value a diff can't capture.
