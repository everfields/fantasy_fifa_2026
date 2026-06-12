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

## How to add a decision

1. Copy [`0000-template.md`](0000-template.md) → `NNNN-short-slug.md` (next number, zero-padded).
2. Fill it in: **Context → Decision → Consequences**, plus what code/schema/docs changed.
3. Add a row to the table above (newest at the bottom or top — keep it chronological).
4. If the decision changes an **operative rule** (something Claude must follow), update the relevant
   line in `CLAUDE.md` and link back to the ADR. Do **not** edit `PROJECT_PLAN.md`.
5. Keep ADRs append-only: don't rewrite history. To reverse a past decision, write a *new* ADR that
   supersedes it and set the old one's status to `Superseded by NNNN`.

## Conventions

- **Status** values: `Proposed` · `Accepted` · `Superseded by NNNN` · `Deprecated`.
- One decision per file. Keep it concrete: cite files, schema objects, settings keys.
- Record the *why* and the alternatives considered, not just the *what* — that's the value a diff can't capture.
