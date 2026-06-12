-- ============================================================================
-- 0011 — Meta volante: prize DISTRIBUTION per round position (ADR-0015).
--
-- The meta volante stops being winner-takes-all: each round now pays a prize
-- per position, configured in app_settings.settings -> 'meta_volante_distribution'
-- (defaults: 1º=100, 2º=50, 3º=50, 4º–7º=20). The legacy scalar
-- 'meta_volante_points' stays in the blob (deprecated, mirrors position 1).
--
-- Additive-only and idempotent: seeds the key ONLY when absent, touches no
-- player data, no schema change (round_awards already supports N rows/round
-- via its (round_key, user_id) uniqueness).
-- ============================================================================

update app_settings
set settings = settings ||
      jsonb_build_object(
        'meta_volante_distribution',
        jsonb_build_array(100, 50, 50, 20, 20, 20, 20)
      ),
    updated_at = now()
where id = 1
  and not (settings ? 'meta_volante_distribution');
