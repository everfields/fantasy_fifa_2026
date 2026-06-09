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
