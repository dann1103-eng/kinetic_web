-- =============================================================================
-- 0099 — Extender is_agency_user() para reconocer roles Kinetic
-- =============================================================================
-- Bug detectado en producción: cuando un terapista, maestra, directora,
-- coordinadora_*, recepcion o contable se logueaba DIRECTAMENTE (no
-- impersonado), el RLS de tablas como `children`, `progress_reports`,
-- `report_templates`, etc. lo trataba como "no staff" porque la función
-- helper is_agency_user() solo aceptaba 'admin','supervisor','operator'
-- (roles FM legacy), heredado de migración 0002_to_0079_merged.
--
-- Fix: agregar los roles Kinetic a la lista. Excluye explícitamente
-- 'client' y 'family' (esos son portal-only).
--
-- Síntomas que cura:
--   - Banner de informes pendientes en /mi-dia salía vacío al logueo directo
--     pero funcionaba al impersonar.
--   - Las terapistas no podían leer niños ni plantillas (afectaba editor de
--     informes, /admin/plantillas si entraran como directora-no-impersonada,
--     etc.).
-- =============================================================================

create or replace function public.is_agency_user()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid()
      and role in (
        -- FM legacy
        'admin',
        'supervisor',
        'operator',
        -- Kinetic
        'directora',
        'coordinadora_familias',
        'coordinadora_terapias',
        'terapista',
        'maestra',
        'recepcion',
        'contable'
      )
  );
$$;

-- ── Fin de migración 0099_kinetic_extend_is_agency_user ──────────────────
