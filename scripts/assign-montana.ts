// One-shot operational script: run the montaña etapa auto-pick against the
// live DB — the SAME pure, unit-tested picker the admin button uses
// (lib/classifications/montana.ts), so there is a single source of truth.
//   npx tsx scripts/assign-montana.ts          # preview (dry run)
//   npx tsx scripts/assign-montana.ts --apply  # write assignments
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { pickMontanaStages, type PickableMatch } from "../lib/classifications";

function loadEnv(path: string) {
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

async function main() {
  loadEnv(".env.local");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  const apply = process.argv.includes("--apply");
  // --stages=N caps how many etapas to fill NOW (default 7). Useful to keep
  // late etapa numbers free for the knockout rounds: re-running later (script
  // or admin button) fills the remaining ones incrementally.
  const stagesArg = process.argv.find((a) => a.startsWith("--stages="));
  const totalStages = stagesArg ? Number(stagesArg.split("=")[1]) : undefined;

  const db = createClient(url, key);
  const [{ data: matches, error: me }, { data: teams, error: te }] =
    await Promise.all([
      db
        .from("matches")
        .select(
          "id, stage, status, kickoff_at, is_joker, montana_stage, home_team, away_team",
        ),
      db.from("teams").select("id, code"),
    ]);
  if (me || te || !matches || !teams) throw (me ?? te ?? new Error("no data"));

  const codeOf = new Map(teams.map((t) => [t.id, t.code as string]));
  const pickable: PickableMatch[] = matches.map((m) => ({
    id: m.id,
    stage: m.stage,
    status: m.status,
    kickoff_at: m.kickoff_at,
    is_joker: m.is_joker,
    montana_stage: m.montana_stage,
    home_code: m.home_team ? (codeOf.get(m.home_team) ?? null) : null,
    away_code: m.away_team ? (codeOf.get(m.away_team) ?? null) : null,
  }));

  const assignments = pickMontanaStages(pickable, {
    now: new Date(),
    ...(totalStages ? { totalStages } : {}),
  });
  const byId = new Map(matches.map((m) => [m.id, m]));
  for (const a of assignments.sort((x, y) => x.montana_stage - y.montana_stage)) {
    const m = byId.get(a.match_id)!;
    const label = `${codeOf.get(m.home_team) ?? "?"}-${codeOf.get(m.away_team) ?? "?"}`;
    console.log(
      `etapa ${a.montana_stage}  ${m.kickoff_at}  ${label}  (${m.stage})`,
    );
  }
  console.log(`${assignments.length} asignaciones nuevas.`);

  if (!apply) {
    console.log("Dry run — relanza con --apply para escribir.");
    return;
  }
  for (const a of assignments) {
    const { error } = await db
      .from("matches")
      .update({ montana_stage: a.montana_stage })
      .eq("id", a.match_id);
    if (error) throw error;
  }
  console.log("Aplicado.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
