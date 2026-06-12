// ============================================================================
// "Luis de la Tracker" — the analysis engine (PURE).
//
// "Análisis de datos puro y duro": detects patterns in every player's
// prediction strategy and crosses them with the results, producing a ranked
// list of factual `TrackerCandidateFinding`s. The LLM (lib/tracker/luis.ts)
// then VERBALIZES the top ones in character — it never computes or invents.
//
// PURE module: no IO, no DB, no fetch, no Date.now(). `reportDate` is passed
// in. Deterministic: same input → same output. Unit-tested in analysis.spec.ts.
// ============================================================================

import { outcomeSign, type OutcomeSign } from "@/lib/scoring";
import type {
  MatchStatus,
  Stage,
  TrackerAnalysis,
  TrackerCandidateFinding,
  TrackerStat,
} from "@/lib/types";

// ----------------------------------------------------------------------------
// Inputs — minimal shapes the engine needs (decoupled from the DB row types).
// ----------------------------------------------------------------------------

export interface AnalysisMatch {
  id: string;
  home_label: string; // resolved team name/code for display
  away_label: string;
  stage: Stage;
  matchday: number | null;
  kickoff_at: string; // ISO
  home_score: number | null;
  away_score: number | null;
  status: MatchStatus;
  is_joker: boolean;
}

export interface AnalysisPrediction {
  user_id: string;
  match_id: string;
  home_pred: number;
  away_pred: number;
  points_awarded: number | null;
}

export interface AnalysisPlayer {
  user_id: string;
  display_name: string;
}

export interface AnalysisInput {
  reportDate: string; // YYYY-MM-DD (UTC calendar date the report covers)
  players: AnalysisPlayer[];
  matches: AnalysisMatch[];
  predictions: AnalysisPrediction[];
}

// ----------------------------------------------------------------------------
// Small helpers
// ----------------------------------------------------------------------------

// "Jornada" = the pool's day in Spain, not the UTC calendar day. The Mundial is
// played in North America, so one matchday there spans two Spanish dates: the
// evening games ("anoche") plus the small-hours games ("madrugada"). A report
// for date D covers kickoffs in [D-1 12:00, D 12:00) Europe/Madrid — i.e. what
// players wake up to on the morning of D. Madrid is CEST (UTC+2) for the whole
// tournament (Jun 11 – Jul 19, 2026), so shifting the kickoff by +14h (2h to
// Madrid + 12h to move the noon cut to midnight) and taking the UTC date gives
// the jornada it belongs to.
const JORNADA_SHIFT_MS = 14 * 3600 * 1000;
export const jornadaOf = (kickoffIso: string): string =>
  new Date(new Date(kickoffIso).getTime() + JORNADA_SHIFT_MS).toISOString().slice(0, 10);
const dayOf = jornadaOf;
const isFinished = (m: AnalysisMatch): boolean =>
  m.status === "finished" && m.home_score !== null && m.away_score !== null;
const matchLabel = (m: AnalysisMatch): string =>
  `${m.home_label} ${m.home_score}-${m.away_score} ${m.away_label}`;
const round1 = (n: number): number => Math.round(n * 10) / 10;
const pct = (n: number, d: number): number => (d === 0 ? 0 : Math.round((100 * n) / d));
const pctRate = (rate: number): number => Math.round(rate * 100); // 0..1 → 0..100

// De-duplicate display names while preserving order.
function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

const SIGN_ES: Record<OutcomeSign, string> = {
  home: "1 (local)",
  draw: "X (empate)",
  away: "2 (visitante)",
};

// ----------------------------------------------------------------------------
// Main entry point
// ----------------------------------------------------------------------------

/**
 * Run the full deterministic analysis for one report day. Returns a ranked,
 * variety-capped list of candidate findings plus a few header stats. Empty /
 * sparse data yields fewer (or zero) candidates — never throws.
 */
export function analyzePredictions(input: AnalysisInput): TrackerAnalysis {
  const { reportDate, players, matches } = input;

  const nameOf = new Map(players.map((p) => [p.user_id, p.display_name]));
  const name = (id: string): string => nameOf.get(id) ?? "Anónimo";

  const finishedAll = matches.filter(isFinished);
  const finishedById = new Map(finishedAll.map((m) => [m.id, m]));

  // SPOILER GUARD: only predictions on finished matches enter the analysis.
  // Predictions are editable until kickoff — leaking anything about a pending
  // pick (even aggregates like avg goals or a repeated scoreline) lets players
  // copy strategies. Everything below must read from this filtered set.
  const predictions = input.predictions.filter((p) => finishedById.has(p.match_id));
  const dayMatches = finishedAll.filter((m) => dayOf(m.kickoff_at) === reportDate);
  const dayMatchIds = new Set(dayMatches.map((m) => m.id));

  // Predictions grouped a few ways.
  const predsByMatch = new Map<string, AnalysisPrediction[]>();
  const predsByUser = new Map<string, AnalysisPrediction[]>();
  const pushTo = (map: Map<string, AnalysisPrediction[]>, key: string, p: AnalysisPrediction) => {
    const bucket = map.get(key);
    if (bucket) bucket.push(p);
    else map.set(key, [p]);
  };
  for (const p of predictions) {
    pushTo(predsByMatch, p.match_id, p);
    pushTo(predsByUser, p.user_id, p);
  }

  const findings: TrackerCandidateFinding[] = [];
  const push = (f: TrackerCandidateFinding) => findings.push(f);

  // --- Per-day performance --------------------------------------------------
  // dayPoints / dayExact per user, restricted to the day's finished matches.
  const dayPoints = new Map<string, number>();
  const dayExact = new Map<string, number>();
  const dayPredictors = new Set<string>();
  for (const m of dayMatches) {
    for (const p of predsByMatch.get(m.id) ?? []) {
      dayPredictors.add(p.user_id);
      dayPoints.set(p.user_id, (dayPoints.get(p.user_id) ?? 0) + (p.points_awarded ?? 0));
      if (p.home_pred === m.home_score && p.away_pred === m.away_score) {
        dayExact.set(p.user_id, (dayExact.get(p.user_id) ?? 0) + 1);
      }
    }
  }

  if (dayPredictors.size > 0) {
    const ranked = [...dayPredictors]
      .map((u) => ({ u, pts: dayPoints.get(u) ?? 0, ex: dayExact.get(u) ?? 0 }))
      .sort((a, b) => b.pts - a.pts || b.ex - a.ex || name(a.u).localeCompare(name(b.u)));

    const top = ranked[0];
    const bottom = ranked[ranked.length - 1];
    // Ties share the crown/wooden spoon — never crown one of N co-leaders.
    const tops = ranked.filter((r) => r.pts === top.pts && r.ex === top.ex);
    const bottoms = ranked.filter((r) => r.pts === bottom.pts && r.ex === bottom.ex);
    const topNames = tops.map((r) => name(r.u));
    const bottomNames = bottoms.map((r) => name(r.u));

    if (top.pts > 0) {
      push({
        key: "crack_del_dia",
        category: "rendimiento",
        title: tops.length > 1 ? "Los cracks del día" : "El crack del día",
        detail:
          tops.length > 1
            ? `${topNames.join(", ")} empatan como los mejores de la jornada con ${top.pts} puntos (${top.ex} acierto/s exacto/s cada uno).`
            : `${topNames[0]} fue el mejor de la jornada con ${top.pts} puntos (${top.ex} acierto/s exacto/s).`,
        subjects: topNames,
        magnitude: 0.92,
      });
    }
    if (ranked.length > 1 && bottom.pts < top.pts) {
      push({
        key: "desastre_del_dia",
        category: "rendimiento",
        title: bottoms.length > 1 ? "Los desastres del día" : "El desastre del día",
        detail:
          bottoms.length > 1
            ? `${bottomNames.join(", ")} se quedaron en ${bottom.pts} puntos en la jornada, los peores de los ${ranked.length} que pronosticaron.`
            : `${bottomNames[0]} se quedó en ${bottom.pts} puntos en la jornada, el peor de los ${ranked.length} que pronosticaron.`,
        subjects: bottomNames,
        magnitude: 0.82,
      });
    }
  }

  // --- Clavadas (exact hits) of the day ------------------------------------
  const totalDayExact = [...dayExact.values()].reduce((a, b) => a + b, 0);
  if (totalDayExact > 0) {
    const clavadores = [...dayExact.entries()]
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1] || name(a[0]).localeCompare(name(b[0])))
      .map(([u, n]) => `${name(u)} (${n})`);
    push({
      key: "clavadas_del_dia",
      category: "aciertos",
      title: "Resultados clavados",
      detail: `${totalDayExact} clavada/s exacta/s en la jornada. Las firman: ${clavadores.join(", ")}.`,
      subjects: clavadores.map((c) => c.replace(/\s*\(\d+\)$/, "")),
      magnitude: 0.86,
    });
  }

  // --- Per-match herd / consensus analysis (the day's matches) -------------
  for (const m of dayMatches) {
    const preds = predsByMatch.get(m.id) ?? [];
    if (preds.length < 3) continue;
    const actualSign = outcomeSign(m.home_score!, m.away_score!);

    const counts: Record<OutcomeSign, number> = { home: 0, draw: 0, away: 0 };
    for (const p of preds) counts[outcomeSign(p.home_pred, p.away_pred)] += 1;
    const total = preds.length;

    // Dominant predicted sign.
    const domSign = (Object.keys(counts) as OutcomeSign[]).reduce((a, b) =>
      counts[b] > counts[a] ? b : a,
    );
    const domShare = pct(counts[domSign], total);

    // Herd CAUGHT: a strong majority backed a sign that did NOT happen.
    if (domSign !== actualSign && counts[domSign] >= 4 && domShare >= 70) {
      push({
        key: `rebano_${m.id}`,
        category: "rebaño",
        title: "El rebaño, cazado",
        detail: `En ${m.home_label}-${m.away_label}, el ${domShare}% (${counts[domSign]} de ${total}) puso ${SIGN_ES[domSign]} y cayó el ${SIGN_ES[actualSign]}: ${matchLabel(m)}.`,
        subjects: [],
        magnitude: 0.78 + Math.min(0.1, (domShare - 70) / 300),
      });

      // The contrarians who nailed the actual sign against the herd.
      const heroes = preds
        .filter((p) => outcomeSign(p.home_pred, p.away_pred) === actualSign)
        .map((p) => name(p.user_id))
        .sort((a, b) => a.localeCompare(b));
      if (heroes.length > 0 && heroes.length <= Math.ceil(total / 3)) {
        push({
          key: `contrarian_${m.id}`,
          category: "contrarian",
          title: "El que vio venir el batacazo",
          detail: `Contra el rebaño en ${m.home_label}-${m.away_label}, ${heroes.join(", ")} sí puso ${SIGN_ES[actualSign]}.`,
          subjects: heroes,
          magnitude: 0.7,
        });
      }
    }

    // Nobody got the sign right.
    if (counts[actualSign] === 0 && total >= 5) {
      push({
        key: `nadie_${m.id}`,
        category: "rebaño",
        title: "Ni uno acertó",
        detail: `Ni uno de los ${total} pronósticos clavó el signo de ${m.home_label}-${m.away_label} (${matchLabel(m)}).`,
        subjects: [],
        magnitude: 0.74,
      });
    }
  }

  // --- Goal inflation/drought (the day) ------------------------------------
  {
    let predGoals = 0;
    let predCount = 0;
    for (const m of dayMatches) {
      for (const p of predsByMatch.get(m.id) ?? []) {
        predGoals += p.home_pred + p.away_pred;
        predCount += 1;
      }
    }
    const actualGoals = dayMatches.reduce((a, m) => a + m.home_score! + m.away_score!, 0);
    if (predCount > 0 && dayMatches.length > 0) {
      const avgPred = predGoals / predCount;
      const avgActual = actualGoals / dayMatches.length;
      const diff = avgPred - avgActual;
      if (Math.abs(diff) >= 0.6) {
        const word = diff > 0 ? "infladísimos" : "demasiado secos";
        push({
          key: "inflacion_goles",
          category: "tendencia",
          title: diff > 0 ? "Pronósticos inflados" : "Pronósticos de miedo",
          detail: `La porra pedía ${round1(avgPred)} goles de media por partido y cayeron ${round1(avgActual)}: pronósticos ${word}.`,
          subjects: [],
          magnitude: 0.6,
        });
      }
    }
  }

  // --- Joker matches of the day --------------------------------------------
  const dayJokers = dayMatches.filter((m) => m.is_joker);
  if (dayJokers.length > 0) {
    const hits: string[] = [];
    const misses: string[] = [];
    for (const jm of dayJokers) {
      const actual = outcomeSign(jm.home_score!, jm.away_score!);
      for (const p of predsByMatch.get(jm.id) ?? []) {
        const correct = outcomeSign(p.home_pred, p.away_pred) === actual;
        (correct ? hits : misses).push(name(p.user_id));
      }
    }
    const jokerHits = uniqueNames(hits);
    const jokerMiss = uniqueNames(misses);
    push({
      key: "joker_dia",
      category: "joker",
      title: "Día de jóker",
      detail: `Había jóker (puntos multiplicados): ${jokerHits.length} acertó/aron el signo y ${jokerMiss.length} lo falló/aron. Aciertan: ${jokerHits.join(", ") || "nadie"}.`,
      subjects: jokerHits,
      magnitude: 0.66,
    });
  }

  // --- Tournament-wide strategy profiles (over ALL of a player's preds) -----
  // Strategy is about HOW they predict, independent of results.
  interface Profile {
    u: string;
    n: number; // # predictions
    avgGoals: number;
    drawShare: number; // 0..1
    topScoreline: { line: string; count: number };
    signRate: number; // correct signs / finished preds
    exactRate: number;
    finishedN: number;
  }
  const profiles: Profile[] = [];
  for (const [u, ps] of predsByUser) {
    if (ps.length === 0) continue;
    let goals = 0;
    let draws = 0;
    const lineCount = new Map<string, number>();
    let correctSign = 0;
    let exact = 0;
    let finishedN = 0;
    for (const p of ps) {
      goals += p.home_pred + p.away_pred;
      if (p.home_pred === p.away_pred) draws += 1;
      const line = `${p.home_pred}-${p.away_pred}`;
      lineCount.set(line, (lineCount.get(line) ?? 0) + 1);
      const fm = finishedById.get(p.match_id);
      if (fm) {
        finishedN += 1;
        if (outcomeSign(p.home_pred, p.away_pred) === outcomeSign(fm.home_score!, fm.away_score!)) {
          correctSign += 1;
        }
        if (p.home_pred === fm.home_score && p.away_pred === fm.away_score) exact += 1;
      }
    }
    let topLine = { line: "", count: 0 };
    for (const [line, count] of lineCount) {
      if (count > topLine.count || (count === topLine.count && line < topLine.line)) {
        topLine = { line, count };
      }
    }
    profiles.push({
      u,
      n: ps.length,
      avgGoals: goals / ps.length,
      drawShare: draws / ps.length,
      topScoreline: topLine,
      signRate: finishedN ? correctSign / finishedN : 0,
      exactRate: finishedN ? exact / finishedN : 0,
      finishedN,
    });
  }

  const eligible = profiles.filter((p) => p.n >= 5);
  if (eligible.length >= 2) {
    const byGoalsAsc = [...eligible].sort((a, b) => a.avgGoals - b.avgGoals);
    const cagado = byGoalsAsc[0];
    const artillero = byGoalsAsc[byGoalsAsc.length - 1];
    if (cagado.avgGoals <= 2.2) {
      push({
        key: "perfil_conservador",
        category: "perfil",
        title: "El más agarrado",
        detail: `${name(cagado.u)} promedia solo ${round1(cagado.avgGoals)} goles por quiniela en ${cagado.n} pronósticos: el más conservador de la clase.`,
        subjects: [name(cagado.u)],
        magnitude: 0.56,
      });
    }
    if (artillero.avgGoals >= 3.2 && artillero.u !== cagado.u) {
      push({
        key: "perfil_artillero",
        category: "perfil",
        title: "El artillero de salón",
        detail: `${name(artillero.u)} pone ${round1(artillero.avgGoals)} goles de media por partido: el más alegre con la goleada.`,
        subjects: [name(artillero.u)],
        magnitude: 0.54,
      });
    }

    const byDraw = [...eligible].sort((a, b) => b.drawShare - a.drawShare);
    if (byDraw[0].drawShare >= 0.35) {
      push({
        key: "perfil_empatador",
        category: "perfil",
        title: "El rey del empate",
        detail: `${name(byDraw[0].u)} firma empate en el ${pctRate(byDraw[0].drawShare)}% de sus quinielas. Poca valentía.`,
        subjects: [name(byDraw[0].u)],
        magnitude: 0.5,
      });
    }

    const repetitive = [...eligible].sort((a, b) => b.topScoreline.count - a.topScoreline.count)[0];
    if (repetitive.topScoreline.count >= 4) {
      push({
        key: "perfil_repetitivo",
        category: "perfil",
        title: "El del corta-pega",
        detail: `${name(repetitive.u)} ha repetido el mismo ${repetitive.topScoreline.line} ${repetitive.topScoreline.count} veces. Qué imaginación.`,
        subjects: [name(repetitive.u)],
        magnitude: 0.58,
      });
    }
  }

  // --- Accuracy leaders (tournament, needs finished preds) ------------------
  const accEligible = profiles.filter((p) => p.finishedN >= 6);
  if (accEligible.length >= 2) {
    const bySign = [...accEligible].sort(
      (a, b) => b.signRate - a.signRate || b.exactRate - a.exactRate,
    );
    const fino = bySign[0];
    const manta = bySign[bySign.length - 1];
    push({
      key: "mas_fino",
      category: "acierto_global",
      title: "El ojo del míster",
      detail: `${name(fino.u)} acierta el signo en el ${pctRate(fino.signRate)}% de sus pronósticos resueltos. El más fino.`,
      subjects: [name(fino.u)],
      magnitude: 0.55,
    });
    if (manta.u !== fino.u) {
      push({
        key: "mas_manta",
        category: "acierto_global",
        title: "El manta de la porra",
        detail: `${name(manta.u)} solo clava el signo en el ${pctRate(manta.signRate)}% de las veces. A trabajar.`,
        subjects: [name(manta.u)],
        magnitude: 0.5,
      });
    }
  }

  // --- Standings (prediction points only) ----------------------------------
  const totalPts = new Map<string, number>();
  for (const m of finishedAll) {
    for (const p of predsByMatch.get(m.id) ?? []) {
      totalPts.set(p.user_id, (totalPts.get(p.user_id) ?? 0) + (p.points_awarded ?? 0));
    }
  }
  if (totalPts.size >= 2) {
    const ranked = [...totalPts.entries()].sort(
      (a, b) => b[1] - a[1] || name(a[0]).localeCompare(name(b[0])),
    );
    const leadPts = ranked[0][1];
    const lastPts = ranked[ranked.length - 1][1];
    const leaders = ranked.filter(([, p]) => p === leadPts).map(([u]) => name(u));
    const lasts = ranked.filter(([, p]) => p === lastPts).map(([u]) => name(u));
    push({
      key: "lider_porra",
      category: "clasificacion",
      title: "Quién manda aquí",
      detail:
        leaders.length > 1
          ? `${leaders.join(", ")} comparten el liderato de la porra con ${leadPts} puntos de pronóstico.`
          : `${leaders[0]} lidera la porra con ${leadPts} puntos de pronóstico.`,
      subjects: leaders,
      magnitude: 0.48,
    });
    push({
      key: "colista_porra",
      category: "clasificacion",
      title: "El farolillo rojo",
      detail:
        lasts.length > 1
          ? `${lasts.join(", ")} cierran la tabla con ${lastPts} puntos. El que no corre, vuela.`
          : `${lasts[0]} cierra la tabla con ${lastPts} puntos. El que no corre, vuela.`,
      subjects: lasts,
      magnitude: 0.44,
    });
  }

  // --- Rank + diversity-cap (max 2 per category) ---------------------------
  const sorted = findings.sort((a, b) => b.magnitude - a.magnitude || a.key.localeCompare(b.key));
  const perCategory = new Map<string, number>();
  const diversified: TrackerCandidateFinding[] = [];
  for (const f of sorted) {
    const seen = perCategory.get(f.category) ?? 0;
    if (seen >= 2) continue;
    perCategory.set(f.category, seen + 1);
    diversified.push(f);
    if (diversified.length >= 10) break;
  }

  // --- Header stats ---------------------------------------------------------
  const headlineStats: TrackerStat[] = [
    { label: "Partidos del día", value: String(dayMatches.length) },
    { label: "Clavadas del día", value: String(totalDayExact) },
  ];
  if (dayPredictors.size > 0) {
    const dayRank = [...dayPredictors]
      .map((u) => ({ u, pts: dayPoints.get(u) ?? 0 }))
      .sort((a, b) => b.pts - a.pts || name(a.u).localeCompare(name(b.u)));
    const bestPts = dayRank[0].pts;
    if (bestPts > 0) {
      const bests = dayRank.filter((r) => r.pts === bestPts).map((r) => name(r.u));
      headlineStats.push({
        label: bests.length > 1 ? "Mejores del día" : "Mejor del día",
        value: `${bests.join(", ")} (${bestPts} pts)`,
      });
    }
  }
  if (totalPts.size > 0) {
    const rank = [...totalPts.entries()].sort(
      (a, b) => b[1] - a[1] || name(a[0]).localeCompare(name(b[0])),
    );
    const leadPts = rank[0][1];
    const leaders = rank.filter(([, p]) => p === leadPts).map(([u]) => name(u));
    headlineStats.push({
      label: leaders.length > 1 ? "Líderes de la porra" : "Líder de la porra",
      value: `${leaders.join(", ")} (${leadPts} pts)`,
    });
  }

  return {
    reportDate,
    playerCount: players.length,
    matchesAnalyzed: dayMatches.length,
    finishedTotal: finishedAll.length,
    headlineStats,
    candidateFindings: diversified,
  };
}
