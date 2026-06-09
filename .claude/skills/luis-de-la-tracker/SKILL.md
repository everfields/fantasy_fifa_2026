---
name: luis-de-la-tracker
description: Generate, preview or debug the "Luis de la Tracker" daily AI report — the prediction-strategy analysis verbalized in the persona of the Spanish NT coach. Use when asked to run Luis, regenerate a parte, tune his voice/analysis, or test the tracker locally.
argument-hint: "[date YYYY-MM-DD | force | dry]"
allowed-tools: Bash, Read, Edit
---

# Luis de la Tracker — the míster's daily parte

"Luis de la Tracker" is the AI prediction-strategy tracker for the Mundial 2026 pool: a
**parody of Luis de la Fuente** (Spain NT coach) who, once a day, reads every player's
prediction strategy against the results and drops his **5 key findings** — seco, directo,
chulesco y sobrado. See `docs/decisions/0003-luis-de-la-tracker.md` for the why.

## How it's wired (read these before changing anything)

Two layers, deliberately split so the same voice powers both prod and this skill:

| Concern | File | Notes |
|---|---|---|
| **Analysis (pure)** | `lib/tracker/analysis.ts` | "Análisis puro y duro": detects patterns (cracks, batacazos, rebaño, perfiles de riesgo, jóker, clasificación) and emits ranked, factual `TrackerCandidateFinding`s. No IO, no LLM, deterministic. Unit-tested in `analysis.spec.ts`. |
| **Persona** | `lib/tracker/persona.ts` | `LUIS_SYSTEM_PROMPT` (his voice) + `buildLuisBriefing()` (the facts he must verbalize). Single source of truth for the voice. |
| **Verbalization (LLM)** | `lib/tracker/luis.ts` | Anthropic SDK (`ANTHROPIC_API_KEY`, model `TRACKER_MODEL` ?? `claude-opus-4-8`, adaptive thinking, structured JSON output). Turns candidates → 5 findings. Falls back to `analysis_only` (raw data, no persona) with no key. |
| **Brand/display** | `lib/tracker/brand.ts` | Photo URL, title — safe for player UI. |
| **Cron** | `app/api/cron/luis-tracker/route.ts` | Daily Vercel cron. `CRON_SECRET` bearer. Idempotent upsert into `tracker_reports` (one row per day). |
| **UI** | `components/LuisTracker.tsx`, `app/tracker/page.tsx`, dashboard teaser | Player-facing. |

**HARD RULE:** Luis only *verbalizes* — he never computes or invents numbers/names. New
insights = new patterns in `analysis.ts` (with a test), not prompt embellishment.

## Mode = `$ARGUMENTS`

- *(none)* — generate the latest day's parte (skips if it already exists).
- `force` — regenerate even if today's report exists (re-spends LLM tokens).
- `YYYY-MM-DD` — generate the parte for a specific day.
- `dry` — run the **analysis only** (no LLM, no DB write) and print the candidate findings.

## Run it locally

The app reads env from `.env.local`. You need `CRON_SECRET` (any string locally) and, for the
real voice, `ANTHROPIC_API_KEY`. The dev server must be running (`/run-porra dev`).

```bash
# Latest day (idempotent — skips if already generated)
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/cron/luis-tracker" | jq

# A specific day, forcing regeneration
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/cron/luis-tracker?date=2026-06-12&force" | jq
```

Then read it at `http://localhost:3000/tracker` (or the dashboard teaser).

### `dry` — analysis only, no LLM/DB

Inspect what Luis *would* be handed, without spending tokens or writing a row:

```bash
npx tsx -e '
  import { analyzePredictions } from "./lib/tracker/analysis";
  // Build a small AnalysisInput fixture (see lib/tracker/analysis.spec.ts) or
  // wire it to your local Supabase, then:
  // console.log(JSON.stringify(analyzePredictions(input), null, 2));
'
```

For real data, the cron route is the path that loads from Supabase — use `?force` against a
date and inspect the stored `analysis` jsonb in `tracker_reports`.

## Tuning his voice

Edit `LUIS_SYSTEM_PROMPT` in `lib/tracker/persona.ts`. Keep him **picante pero no ofensivo**
(pique sano entre amigos), español de España, frases cortas, aire de superioridad. Re-run with
`force` to see the effect. Don't loosen the "no inventes datos" rule.

## Tests

```bash
node --test --import tsx lib/tracker/analysis.spec.ts
```

Add a test for every new pattern you add to the analysis engine.
