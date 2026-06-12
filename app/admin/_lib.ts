// ============================================================================
// Shared server-only helpers for the admin dashboard.
//
// - `getAppSettingsAdmin()` loads the single app_settings row (defaults if
//   absent), shaped as the strict `AppSettings` type.
// - `writeAudit()` is the single choke-point every admin write goes through, so
//   "all admin writes are audited" is enforced in one place.
// These run with the service-role client (privileged writes bypass RLS).
// ============================================================================

import "server-only";

import { requireAdmin } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/server";
import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type Profile,
} from "@/lib/types";

/** The fixed primary-key of the single app_settings row. */
export const APP_SETTINGS_ID = 1;

/**
 * The persisted app_settings blob. Mirrors `AppSettings` plus two admin-only
 * extension arrays we store here because the `profiles` table has no column for
 * them (and we cannot add a migration from this layer):
 *   - `banned_user_ids`: players whose access is revoked.
 *   - `paid_user_ids`:   players who have paid into the pot.
 * Storing these in the single admin-owned jsonb row keeps them queryable and
 * RLS-protected without a schema change. See the admin/users + admin/pot pages.
 */
export interface AppSettingsStored extends AppSettings {
  banned_user_ids: string[];
  paid_user_ids: string[];
}

/** Read the raw stored settings blob (the `settings` jsonb column). */
async function readSettingsBlob(): Promise<Record<string, unknown>> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("app_settings")
    .select("settings")
    .eq("id", APP_SETTINGS_ID)
    .maybeSingle();
  return (data?.settings as Record<string, unknown> | undefined) ?? {};
}

/** Shape a raw blob into the strict stored type, merged onto defaults. */
function shapeSettings(raw: Record<string, unknown>): AppSettingsStored {
  const scoring = (raw.scoring as Record<string, unknown>) ?? {};
  return {
    scoring: { ...DEFAULT_APP_SETTINGS.scoring, ...scoring },
    bonus_default_points:
      (raw.bonus_default_points as number) ??
      DEFAULT_APP_SETTINGS.bonus_default_points,
    group_winner_points:
      (raw.group_winner_points as number) ??
      DEFAULT_APP_SETTINGS.group_winner_points,
    meta_volante_points:
      (raw.meta_volante_points as number) ??
      DEFAULT_APP_SETTINGS.meta_volante_points,
    meta_volante_distribution:
      Array.isArray(raw.meta_volante_distribution) &&
      raw.meta_volante_distribution.length > 0
        ? (raw.meta_volante_distribution as number[])
        : DEFAULT_APP_SETTINGS.meta_volante_distribution,
    jokers_per_user:
      (raw.jokers_per_user as number) ?? DEFAULT_APP_SETTINGS.jokers_per_user,
    pot_amount: (raw.pot_amount as number) ?? DEFAULT_APP_SETTINGS.pot_amount,
    entry_fee: (raw.entry_fee as number) ?? DEFAULT_APP_SETTINGS.entry_fee,
    pot_expenses:
      (raw.pot_expenses as number) ?? DEFAULT_APP_SETTINGS.pot_expenses,
    season_locked:
      (raw.season_locked as boolean) ?? DEFAULT_APP_SETTINGS.season_locked,
    live_polling_seconds:
      (raw.live_polling_seconds as number) ??
      DEFAULT_APP_SETTINGS.live_polling_seconds,
    banned_user_ids: Array.isArray(raw.banned_user_ids)
      ? (raw.banned_user_ids as string[])
      : [],
    paid_user_ids: Array.isArray(raw.paid_user_ids)
      ? (raw.paid_user_ids as string[])
      : [],
  };
}

/** Load app_settings (incl. admin extension arrays), merged onto defaults. */
export async function getAppSettingsAdmin(): Promise<AppSettingsStored> {
  return shapeSettings(await readSettingsBlob());
}

/**
 * Persist the full settings blob to the single app_settings row. Callers pass
 * the complete `AppSettingsStored` object; this writes it under the `settings`
 * jsonb column (the actual DB shape) and is the single writer of that row.
 */
export async function saveAppSettings(next: AppSettingsStored): Promise<{
  error: string | null;
}> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("app_settings")
    .upsert({ id: APP_SETTINGS_ID, settings: next, updated_at: new Date().toISOString() });
  return { error: error?.message ?? null };
}

/**
 * Append an entry to `audit_log`. Best-effort: a failed audit insert must never
 * mask the primary write, so it is logged and swallowed. `actor_id` defaults to
 * the current admin when omitted.
 */
export async function writeAudit(params: {
  actor: Profile | string;
  action: string;
  target_type: string;
  target_id?: string | null;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  const supabase = createServiceClient();
  const actor_id =
    typeof params.actor === "string" ? params.actor : params.actor.id;

  const { error } = await supabase.from("audit_log").insert({
    actor_id,
    action: params.action,
    target_type: params.target_type,
    target_id: params.target_id ?? null,
    before: params.before ?? null,
    after: params.after ?? null,
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[audit_log] failed to record action", params.action, error);
  }
}

/**
 * Standard guard for every admin server action: confirms the caller is an admin
 * and returns the admin `Profile` to use as the audit actor.
 */
export async function adminActor(): Promise<Profile> {
  return requireAdmin();
}
