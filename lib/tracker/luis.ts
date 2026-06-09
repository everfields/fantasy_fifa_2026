// ============================================================================
// "Luis de la Tracker" — the verbalization layer (LLM).
//
// Takes the PURE deterministic analysis (lib/tracker/analysis.ts) and asks
// Claude to turn the top candidate findings into 5 key findings in Luis's
// persona (lib/tracker/persona.ts). The model only VERBALIZES — every number
// and name comes from the analysis.
//
// Server-only: imported exclusively from the cron route. Reads ANTHROPIC_API_KEY.
// Returns null when no key is configured so the cron can still store an
// "analysis_only" report and degrade gracefully.
// ============================================================================

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import type { TrackerAnalysis, TrackerVerbalization } from "@/lib/types";
import { LUIS_SYSTEM_PROMPT, buildLuisBriefing } from "@/lib/tracker/persona";

/** Default model — the most capable Claude tier; override with TRACKER_MODEL. */
const DEFAULT_MODEL = "claude-opus-4-8";

/** The model id actually used (exposed so the cron can record it). */
export function trackerModel(): string {
  return process.env.TRACKER_MODEL || DEFAULT_MODEL;
}

/** True when an Anthropic API key is configured (LLM verbalization possible). */
export function hasLuisLlm(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Validate what the model returns (we don't trust the wire blindly).
const VerbalizationSchema = z.object({
  headline: z.string(),
  findings: z.array(z.object({ title: z.string(), body: z.string() })),
});

// Structured-output JSON schema (Anthropic structured outputs require
// `additionalProperties: false` on every object; no min/max — we clamp to 5).
const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    headline: {
      type: "string",
      description: "Una frase de entrada chulesca, la sentencia del día.",
    },
    findings: {
      type: "array",
      description: "Exactamente 5 hallazgos verbalizados en personaje.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", description: "Titular corto y chulo, máx ~6 palabras." },
          body: {
            type: "string",
            description: "2 a 4 frases en personaje, citando nombres y cifras reales.",
          },
        },
        required: ["title", "body"],
      },
    },
  },
  required: ["headline", "findings"],
} as const;

/** Concatenate the text blocks of a Messages response into one string. */
function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/**
 * Verbalize the analysis in Luis's voice. Returns the validated
 * `{ headline, findings }` (findings clamped to 5), or `null` when no API key
 * is configured / the model refused / output was unparseable. Throws only on a
 * genuine API transport failure — the caller decides how to degrade.
 */
export async function generateLuisReport(
  analysis: TrackerAnalysis,
): Promise<TrackerVerbalization | null> {
  if (!hasLuisLlm()) return null;

  const client = new Anthropic();

  const briefing = buildLuisBriefing({
    reportDate: analysis.reportDate,
    playerCount: analysis.playerCount,
    matchesAnalyzed: analysis.matchesAnalyzed,
    headlineStats: analysis.headlineStats,
    candidateFindings: analysis.candidateFindings,
  });

  const message = await client.messages.create({
    model: trackerModel(),
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: OUTPUT_SCHEMA },
    },
    system: LUIS_SYSTEM_PROMPT,
    messages: [{ role: "user", content: briefing }],
  });

  if (message.stop_reason === "refusal") return null;

  const parsed = VerbalizationSchema.safeParse(safeJson(textOf(message)));
  if (!parsed.success || parsed.data.findings.length === 0) return null;

  return {
    headline: parsed.data.headline.trim(),
    // Clamp to 5: the JSON schema can't hard-enforce array length.
    findings: parsed.data.findings.slice(0, 5).map((f) => ({
      title: f.title.trim(),
      body: f.body.trim(),
    })),
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Deterministic fallback verbalization when the LLM is unavailable (no key or
 * an API failure). Surfaces the raw top candidate findings — no persona, but
 * the players still see the data. Stored with status "analysis_only" so the UI
 * can flag that Luis is "calentando".
 */
export function fallbackVerbalization(
  analysis: TrackerAnalysis,
): TrackerVerbalization {
  const findings = analysis.candidateFindings.slice(0, 5).map((c) => ({
    title: c.title,
    body: c.detail,
  }));
  return {
    headline:
      analysis.matchesAnalyzed > 0
        ? "El míster está en la ducha. De momento, los números en crudo."
        : "Jornada sin partidos: el míster descansa.",
    findings,
  };
}
