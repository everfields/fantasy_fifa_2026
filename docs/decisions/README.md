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
