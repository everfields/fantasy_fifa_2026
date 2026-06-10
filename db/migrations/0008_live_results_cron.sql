-- ============================================================================
-- Mundial 2026 Pool — Live-results scheduler (ADR-0009)
-- Migration 0008: pg_cron + pg_net job that pings the existing CRON_SECRET-
-- protected /api/cron/update-results endpoint every 15 minutes. The endpoint is
-- idempotent and, with no candidate matches, does zero writes / zero LLM calls.
--
-- DATA SAFETY (CLAUDE.md rule 7 / db/README.md): this migration touches NO app
-- tables. No DROP / TRUNCATE / DELETE; only reads public.matches (read-only
-- guard) and creates a scheduler function + cron job. Additive-only.
--
-- Apply order: ... -> 0007_bonus_categories.sql -> 0008_live_results_cron.sql
-- Degrades gracefully on local/dev where pg_cron / pg_net may be unavailable.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions. Supabase ships pg_cron (in pg_catalog/extensions) and pg_net (in
-- the `net` schema, created via the `extensions` schema by convention).
-- Wrapped so a host without them does not hard-fail the migration.
-- ----------------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron unavailable (% ) — live-results poll not scheduled', sqlerrm;
end $$;

do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  -- Some images create pg_net without the explicit schema; retry plainly.
  begin
    create extension if not exists pg_net;
  exception when others then
    raise notice 'pg_net unavailable (% ) — live-results poll not scheduled', sqlerrm;
  end;
end $$;

-- ----------------------------------------------------------------------------
-- poll_match_results(): fire-and-forget HTTP GET to the cron endpoint.
--
-- SECURITY DEFINER (owner postgres) so it can read vault.decrypted_secrets and
-- call net.http_get. `set search_path = ''` forces fully-qualified names — no
-- search-path injection. Reads app_base_url + cron_secret from Supabase Vault;
-- returns early if either is missing (no error spam on un-provisioned envs).
-- Cheap guard: only hits the network when a not-finished match kicked off in the
-- last 6 hours (the poll window from ADR-0009), so it costs nothing off-window.
-- ----------------------------------------------------------------------------
create or replace function public.poll_match_results()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base_url    text;
  v_cron_secret text;
  v_has_window  boolean;
begin
  -- Cheap read-only guard: any candidate match in an active poll window?
  select exists (
    select 1
      from public.matches m
     where m.status <> 'finished'
       and m.kickoff_at between now() - interval '6 hours' and now()
  ) into v_has_window;

  if not v_has_window then
    return;  -- off-window: zero network, zero cost
  end if;

  -- Secrets from Vault (never hardcoded). Missing -> quiet early return.
  select decrypted_secret into v_base_url
    from vault.decrypted_secrets where name = 'app_base_url';
  select decrypted_secret into v_cron_secret
    from vault.decrypted_secrets where name = 'cron_secret';

  if v_base_url is null or v_cron_secret is null then
    raise notice 'poll_match_results: app_base_url / cron_secret not set in Vault — skipping';
    return;
  end if;

  -- Fire-and-forget; net.http_get returns a request id we intentionally ignore.
  perform net.http_get(
    url := v_base_url || '/api/cron/update-results',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_cron_secret),
    timeout_milliseconds := 30000
  );
exception when others then
  -- Never let a cron tick raise; log and move on.
  raise notice 'poll_match_results failed: %', sqlerrm;
end $$;

-- Lock down: scheduler only. Players / anon must never invoke it.
revoke all on function public.poll_match_results() from public;
revoke execute on function public.poll_match_results() from anon, authenticated;

-- ----------------------------------------------------------------------------
-- Schedule the 15-minute poll, idempotently. Recent pg_cron upserts on job name,
-- but to be safe across versions we unschedule any existing job of this name
-- first. Wrapped so absence of pg_cron (local/dev) does not fail the migration.
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Remove a pre-existing job of the same name (re-runnable migration).
    if exists (select 1 from cron.job where jobname = 'live-results-poll') then
      perform cron.unschedule('live-results-poll');
    end if;

    perform cron.schedule(
      'live-results-poll',
      '*/15 * * * *',
      $sched$select public.poll_match_results()$sched$
    );
  else
    raise notice 'pg_cron not installed — live-results-poll job not scheduled';
  end if;
exception when others then
  raise notice 'Could not schedule live-results-poll (% ) — schedule manually in prod', sqlerrm;
end $$;
