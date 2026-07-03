"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";

import type {
  EtapaStage,
  EtapaTimeline,
  MaillotKey,
  PelotonGroupKey,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { AstonBadge } from "@/components/classifications";
import { MaillotBadge, MAILLOT_LABELS } from "@/components/MaillotBadge";

import { Ciclista } from "./Ciclista";
import styles from "./etapa.module.css";

/**
 * "La Etapa" — animated replay of the race, stage by stage (jornada by
 * jornada). Fully preset: the choreography is derived from the precomputed
 * `EtapaTimeline` (positions + overtake script); playback is CSS keyframe
 * loops + motion/react tweens with staggered delays. No LLM, no network.
 *
 * Playback modes:
 *  - stage movie: riders snap to the PREVIOUS stage's layout, then tween to
 *    the current one; each overtake (biggest gain last) gets its own slow,
 *    cocky beat — shaka 🤙 on, swing out of the line, speed lines.
 *  - tour («Ver la vuelta»): chains every stage quickly, start to finish.
 *  - idle scrub: picking a stage shows THAT day's race (jerseys, groups,
 *    gaps of that moment).
 */

const GROUP_LABELS: Record<PelotonGroupKey, { label: string; icon: string }> = {
  fuga: { label: "La fuga", icon: "⚡" },
  cabeza: { label: "Grupo de cabeza", icon: "🚴" },
  perseguidores: { label: "Perseguidores", icon: "🚴‍♂️" },
  peloton: { label: "El pelotón", icon: "👥" },
  rezagados: { label: "Rezagados", icon: "🐢" },
};

// Choreography timing (seconds).
const BEAT_START = 1.1; // non-overtakers settle first
const BEAT_LEN = 1.5; // one slow, easy, chulesco pass
const MAX_BEATS = 4; // only the biggest moves get their own beat
const TOUR_STEP_MS = 1500;

const RIDER_W = 82;
const LANE_BOTTOM = [40, 68, 96] as const; // px from the scene floor per lane

// Deterministic night-sky stars (percent coordinates).
const STARS = [
  [6, 14], [14, 30], [22, 10], [31, 22], [40, 8], [48, 26], [57, 12],
  [66, 28], [74, 9], [82, 20], [90, 13], [96, 31], [12, 44], [86, 42],
] as const;

const EMPTY_SET: ReadonlySet<string> = new Set();

interface Choreo {
  beats: Map<string, number>; // user_id → beat index (sequential slow passes)
  beatCount: number;
  overtakers: ReadonlySet<string>;
}

const dateLabel = (key: string) =>
  new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${key}T00:00:00Z`));

export function EtapaPlayer({
  timeline,
  currentUserId,
}: {
  timeline: EtapaTimeline;
  currentUserId: string;
}) {
  const stages = timeline.stages;
  const last = stages.length - 1;
  const reduced = useReducedMotion() ?? false;

  const [selected, setSelected] = React.useState(Math.max(last, 0));
  // Stage whose LAYOUT is on screen; -1 = presentation parade (off-screen left).
  const [shown, setShown] = React.useState(Math.max(last, 0));
  const [instant, setInstant] = React.useState(false);
  const [choreo, setChoreo] = React.useState<Choreo | null>(null);
  const [touring, setTouring] = React.useState(false);

  const timers = React.useRef<number[]>([]);
  const scroller = React.useRef<HTMLDivElement | null>(null);

  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };

  const playStage = (k: number) => {
    clearTimers();
    setTouring(false);
    setSelected(k);
    if (reduced) {
      setChoreo(null);
      setShown(k);
      return;
    }
    // 1) snap to the previous stage's layout (or the parade line-up)…
    setInstant(true);
    setChoreo(null);
    setShown(k - 1);
    // 2) …then run the movie towards stage k.
    timers.current.push(
      window.setTimeout(() => {
        setInstant(false);
        const overtakes = stages[k].overtakes;
        const beatList = overtakes.slice(-MAX_BEATS); // biggest gains last
        setChoreo({
          beats: new Map(beatList.map((o, i) => [o.user_id, i])),
          beatCount: beatList.length,
          overtakers: new Set(overtakes.map((o) => o.user_id)),
        });
        setShown(k);
        const totalMs =
          (BEAT_START + beatList.length * BEAT_LEN + 0.8) * 1000;
        timers.current.push(
          window.setTimeout(() => setChoreo(null), totalMs),
        );
      }, 90),
    );
  };
  const playStageRef = React.useRef(playStage);
  playStageRef.current = playStage;

  const selectStage = (k: number) => {
    clearTimers();
    setTouring(false);
    setChoreo(null);
    setInstant(false);
    setSelected(k);
    setShown(k);
  };

  const playTour = () => {
    if (stages.length < 2) return;
    if (reduced) {
      selectStage(last);
      return;
    }
    clearTimers();
    setChoreo(null);
    setTouring(true);
    setInstant(true);
    setSelected(0);
    setShown(0);
    let t = 140;
    for (let i = 1; i < stages.length; i++) {
      const idx = i;
      timers.current.push(
        window.setTimeout(() => {
          setInstant(false);
          setSelected(idx);
          setShown(idx);
        }, t),
      );
      t += TOUR_STEP_MS;
    }
    timers.current.push(window.setTimeout(() => setTouring(false), t));
  };

  // Auto-play the latest stage's movie once on mount.
  React.useEffect(() => {
    if (stages.length === 0 || reduced) return;
    const t = window.setTimeout(
      () => playStageRef.current(stages.length - 1),
      400,
    );
    return () => window.clearTimeout(t);
  }, [stages.length, reduced]);

  React.useEffect(() => clearTimers, []);

  // On phones (scene wider than the viewport) keep the camera on the action.
  React.useEffect(() => {
    const el = scroller.current;
    if (!el || el.scrollWidth <= el.clientWidth + 8) return;
    const disp = stages[Math.max(shown, 0)];
    if (!disp) return;
    const focus = choreo?.overtakers.size
      ? disp.riders
          .filter((r) => choreo.overtakers.has(r.user_id))
          .reduce((s, r) => s + r.x, 0) / choreo.overtakers.size
      : (disp.riders[0]?.x ?? 60);
    el.scrollTo({
      left: (focus / 100) * el.scrollWidth - el.clientWidth / 2,
      behavior: reduced ? "auto" : "smooth",
    });
  }, [shown, choreo, stages, reduced]);

  if (stages.length === 0) {
    return (
      <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
        La vuelta no ha comenzado.
      </div>
    );
  }

  const stage = stages[selected]; // drives chrome (header, ticker, scrubber)
  const dispIdx = Math.max(shown, 0);
  const disp = stages[dispIdx]; // drives the scene (riders, groups)
  const parade = shown < 0;
  const playing = choreo !== null;

  const shakaIds: ReadonlySet<string> = playing
    ? choreo.overtakers
    : touring && dispIdx > 0
      ? new Set(disp.overtakes.map((o) => o.user_id))
      : EMPTY_SET;

  const riderTransition = (userId: string) => {
    if (instant) return { duration: 0 };
    if (choreo) {
      const beat = choreo.beats.get(userId);
      if (beat !== undefined) {
        return {
          delay: BEAT_START + beat * BEAT_LEN,
          duration: BEAT_LEN - 0.2,
          ease: "easeInOut" as const,
        };
      }
      return { delay: 0.1, duration: 1.0, ease: "easeInOut" as const };
    }
    if (touring) return { duration: 1.15, ease: "easeInOut" as const };
    return { duration: 0.5, ease: "easeInOut" as const };
  };

  // Group banner anchors: mean x of each group's riders in the shown layout.
  const groupAnchors = disp.groups.map((g) => {
    const xs = disp.riders.filter((r) => r.group === g.key).map((r) => r.x);
    const cx = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 50;
    return { ...g, cx };
  });

  const hasAston = disp.riders.some((r) => r.aston);
  const tailX = Math.min(...disp.riders.map((r) => r.x));

  const presentMaillots = Array.from(
    new Set(stage.riders.flatMap((r) => r.maillots)),
  ) as MaillotKey[];

  const btn =
    "inline-flex items-center gap-1 rounded-full border bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40";

  return (
    <div className="space-y-3">
      {/* ── header: stage + controls ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto flex items-baseline gap-2">
          <span className="text-lg font-black tracking-tight">
            Etapa {stage.index}
          </span>
          <span className="text-sm text-muted-foreground">
            {dateLabel(stage.key)}
          </span>
          {stage.montana && <span title="Etapa de montaña">🏔️</span>}
          {selected === last && <span title="Última etapa">🏁</span>}
        </div>
        <button
          type="button"
          className={btn}
          onClick={() => selectStage(selected - 1)}
          disabled={selected === 0 || touring}
          aria-label="Etapa anterior"
        >
          ←
        </button>
        <button
          type="button"
          className={btn}
          onClick={() => selectStage(selected + 1)}
          disabled={selected === last || touring}
          aria-label="Etapa siguiente"
        >
          →
        </button>
        <button
          type="button"
          className={btn}
          onClick={playTour}
          disabled={stages.length < 2 || touring}
        >
          ▶ Ver la vuelta
        </button>
        <button
          type="button"
          className={btn}
          onClick={() => playStage(selected)}
          disabled={touring}
        >
          ↻ Repetir etapa
        </button>
      </div>

      {/* ── the scene ────────────────────────────────────────────────────── */}
      <div
        ref={scroller}
        className="overflow-x-auto rounded-xl border [scrollbar-width:thin]"
      >
        <div className="relative h-[360px] min-w-[1000px] overflow-hidden sm:h-[400px]">
          {/* sky (day) / night stage (dark) */}
          <div className="absolute inset-0 bg-gradient-to-b from-sky-300 via-sky-100 to-amber-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900" />
          <div className="absolute right-10 top-6 h-10 w-10 rounded-full bg-amber-300 shadow-[0_0_34px_rgba(251,191,36,0.75)] dark:bg-slate-200 dark:shadow-[0_0_22px_rgba(226,232,240,0.45)]" />
          <div className="hidden dark:block">
            {STARS.map(([l, t], i) => (
              <div
                key={i}
                className="absolute h-[3px] w-[3px] rounded-full bg-slate-200/80"
                style={{ left: `${l}%`, top: `${t}%` }}
              />
            ))}
          </div>
          {/* hills */}
          <div className="absolute bottom-[128px] left-[-12%] h-44 w-[58%] rounded-[100%] bg-emerald-300/60 dark:bg-emerald-950/70" />
          <div className="absolute bottom-[122px] right-[-16%] h-52 w-[68%] rounded-[100%] bg-emerald-400/50 dark:bg-emerald-900/50" />
          {/* road */}
          <div className="absolute inset-x-0 bottom-[150px] h-2 bg-emerald-500/50 dark:bg-emerald-800/70" />
          <div className="absolute inset-x-0 bottom-0 h-[150px] bg-zinc-300 dark:bg-zinc-800" />
          <div
            className={cn(
              "absolute inset-x-0 bottom-[72px] h-[6px] text-zinc-50/90 dark:text-zinc-500/60",
              styles.road,
            )}
          />

          {/* finish line */}
          <div className="absolute bottom-[136px]" style={{ left: "96.2%" }}>
            <div
              className="h-9 w-9 rounded-sm border border-border shadow"
              style={{
                backgroundImage:
                  "repeating-conic-gradient(#18181b 0% 25%, #fafafa 0% 50%)",
                backgroundSize: "12px 12px",
              }}
            />
            <div className="mx-auto h-[104px] w-1 rounded bg-foreground/50" />
          </div>

          {/* safety car behind the tail (Aston Martin, of course) */}
          {hasAston && (
            <motion.div
              initial={false}
              animate={{ left: `${Math.max(tailX - 6, 0.5)}%` }}
              transition={
                instant ? { duration: 0 } : { duration: 0.9, ease: "easeInOut" }
              }
              className={cn("absolute", styles.carBob)}
              style={{ bottom: 24, zIndex: 5 }}
              title="Coche de seguridad"
            >
              <AstonBadge size="md" />
            </motion.div>
          )}

          {/* riders */}
          {disp.riders.map((r) => {
            const x = parade ? -10 - r.position * 3 : r.x;
            const bottom = LANE_BOTTOM[r.lane] ?? LANE_BOTTOM[0];
            const shaka = shakaIds.has(r.user_id);
            const isBeat = playing && choreo.beats.has(r.user_id);
            const isMe = r.user_id === currentUserId;
            return (
              <motion.div
                key={r.user_id}
                initial={false}
                animate={{
                  left: `${x}%`,
                  bottom: isBeat
                    ? [null, Math.max(bottom - 26, 8), bottom]
                    : bottom,
                }}
                transition={riderTransition(r.user_id)}
                className="absolute"
                style={{
                  width: RIDER_W,
                  marginLeft: -RIDER_W / 2,
                  zIndex: 10 + (3 - r.lane) + (shaka ? 20 : 0),
                }}
                title={`${r.position}º · ${r.display_name} — ${r.total_points} pts`}
              >
                <Ciclista
                  idPrefix={r.user_id}
                  jersey={r.jersey}
                  kit={r.kit}
                  pose={r.pose}
                  aston={r.aston}
                  farolillo={r.farolillo}
                  shaka={shaka}
                  cadence={
                    r.pose === "crono"
                      ? "fast"
                      : r.pose === "lengua"
                        ? "slow"
                        : "normal"
                  }
                  animated={!reduced}
                  size={RIDER_W}
                />
                <div
                  className={cn(
                    "mx-auto -mt-1 w-fit max-w-full truncate rounded-full border bg-background/85 px-2 py-px text-center text-[10px] font-semibold leading-tight backdrop-blur",
                    isMe && "ring-2 ring-primary",
                  )}
                >
                  {r.position}º {r.display_name.split(" ")[0].slice(0, 10)}
                </div>
              </motion.div>
            );
          })}

          {/* group banners */}
          {groupAnchors.map((g) => (
            <motion.div
              key={g.key}
              initial={false}
              animate={{ left: `${g.cx}%` }}
              transition={
                instant ? { duration: 0 } : { duration: 0.6, ease: "easeInOut" }
              }
              className="absolute bottom-1 -translate-x-1/2 whitespace-nowrap rounded-full bg-background/70 px-2 py-px text-[10px] text-muted-foreground backdrop-blur"
              style={{ zIndex: 4 }}
            >
              {GROUP_LABELS[g.key].icon} {GROUP_LABELS[g.key].label}
              {g.gapToLeader > 0 && ` · a ${g.gapToLeader} pts`}
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── ticker: the jornada's results + highlights ───────────────────── */}
      <motion.div
        key={selected}
        initial={reduced ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="space-y-2 rounded-xl border bg-card p-3"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {stage.matches.map((m) => (
            <span
              key={m.id}
              className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 font-mono text-[11px]"
            >
              {m.label}
              {m.is_joker && <span title="Partido jóker">🃏</span>}
              {m.montana && <span title="Etapa de montaña">🏔️</span>}
            </span>
          ))}
        </div>
        {stage.highlights.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {stage.highlights
              .map(
                (h) =>
                  `${h.display_name} +${h.points} pts${
                    h.exacts > 0
                      ? ` (${h.exacts} exacto${h.exacts > 1 ? "s" : ""})`
                      : ""
                  }`,
              )
              .join(" · ")}
          </p>
        )}
        {stage.overtakes.length > 0 && (
          <p className="text-xs text-muted-foreground">
            🤙{" "}
            {stage.overtakes
              .slice()
              .reverse()
              .map((o) => `${o.display_name} ${o.from}º→${o.to}º`)
              .join(" · ")}
          </p>
        )}
      </motion.div>

      {/* ── scrubber: the whole race, chapter by chapter ─────────────────── */}
      <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max items-center gap-1 px-1 py-1">
          {stages.map((s, i) => (
            <React.Fragment key={s.key}>
              {i > 0 && <div className="h-px w-3 shrink-0 bg-border" />}
              <button
                type="button"
                onClick={() => selectStage(i)}
                disabled={touring}
                title={`Etapa ${s.index} — ${dateLabel(s.key)}`}
                aria-label={`Etapa ${s.index}`}
                aria-current={i === selected ? "step" : undefined}
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold transition-colors",
                  i === selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : i < selected
                      ? "bg-muted text-muted-foreground hover:bg-accent"
                      : "bg-background text-muted-foreground hover:bg-accent",
                )}
              >
                {s.montana ? "🏔️" : i === last ? "🏁" : s.index}
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ── legend ───────────────────────────────────────────────────────── */}
      {presentMaillots.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1 text-[11px] text-muted-foreground">
          {presentMaillots.map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <MaillotBadge maillot={k} />
              {MAILLOT_LABELS[k].split(" — ")[0]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
