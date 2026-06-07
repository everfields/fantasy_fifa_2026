// ============================================================================
// Server-side auth + role guards for the Mundial 2026 Pool.
//
// These are the single source of truth for "who is the current user" and
// "is the current user allowed here". Admin and API agents import these.
// All functions run on the server (they use the cookie-bound Supabase client).
// ============================================================================

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/**
 * Return the current authenticated user's `profiles` row, or `null` when there
 * is no session (or no matching profile). Never redirects — callers decide.
 */
export async function getProfile(): Promise<Profile | null> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (profile as Profile | null) ?? null;
}

/**
 * Require an authenticated user. Redirects to `/login` when anonymous (or when
 * the profile row is missing). Returns the `Profile` otherwise.
 */
export async function requireUser(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  return profile;
}

/**
 * Require an admin. Redirects to `/login` when anonymous, or to `/dashboard`
 * when authenticated but `role !== "admin"`. Returns the admin `Profile`.
 */
export async function requireAdmin(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/dashboard");
  return profile;
}
