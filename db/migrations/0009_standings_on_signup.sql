-- ============================================================================
-- Mundial 2026 Pool — standings row on signup
-- Migration 0009: new (or renamed) profiles appear in standings_cache
-- immediately, instead of waiting for the next manual recalc / rescore.
--
-- Context: refresh_standings() already covers every profile (LEFT JOINs from
-- profiles), but it only runs on manual recalc or auto-rescore. Players who
-- sign up between recalcs were invisible on /standings and undercounted on
-- the dashboard. This trigger re-runs the (cheap, idempotent) refresh after
-- any profile insert or display_name/avatar change. ~20 players → trivial.
--
-- Additive-only (ADR-0007): creates one function + one trigger; touches no
-- player data. Safe to re-run.
--
-- Apply order: 0001 → … → 0008 → 0009
-- ============================================================================

create or replace function handle_profile_standings_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform refresh_standings();
  return new;
end;
$$;

drop trigger if exists profiles_refresh_standings on profiles;
create trigger profiles_refresh_standings
after insert or update of display_name, avatar on profiles
for each row execute function handle_profile_standings_refresh();

-- One-time: pick up everyone who signed up before this trigger existed.
select refresh_standings();
