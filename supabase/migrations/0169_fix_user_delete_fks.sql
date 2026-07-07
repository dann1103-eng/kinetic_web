-- =============================================================================
-- 0169 — Permitir eliminar usuarios (arreglar FKs que truenan el borrado)
-- =============================================================================
-- Sintoma: al eliminar un perfil sale "Database error deleting user".
--
-- Causas (dos tipos de FK a public.users que impiden el DELETE en cascada):
--   1) CONTRADICCIÓN NOT NULL + ON DELETE SET NULL: p.ej. therapy_sessions
--      .therapist_id es NOT NULL pero su FK dice ON DELETE SET NULL. Al borrar
--      el usuario, Postgres intenta poner therapist_id = NULL y el NOT NULL lo
--      rechaza → el borrado truena. Afecta a CUALQUIER terapeuta con sesiones.
--   2) COLUMNAS DE AUDITORÍA (created_by/uploaded_by/…) con ON DELETE NO ACTION
--      o RESTRICT: si el usuario creó/subió algo, el borrado se bloquea.
--
-- Fix dinámico sobre los constraints REALES (no depende de nombres):
--   1) Toda columna NOT NULL cuyo FK a users sea SET NULL → se vuelve NULLABLE
--      (el registro sobrevive con el autor/terapeuta en NULL).
--   2) Todo FK a users que BLOQUEE (NO ACTION/RESTRICT) en columna NULLABLE →
--      pasa a ON DELETE SET NULL.
--
-- Las columnas NOT NULL que aún bloquean (p.ej. payroll_items.user_id) se dejan
-- a propósito: un usuario con historial de planilla no debe borrarse en duro
-- (se perdería el registro). Para esos casos: dejar sin acceso, no eliminar.
-- =============================================================================

do $$
declare
  r record;
begin
  -- 1) Arreglar la contradicción NOT NULL + ON DELETE SET NULL.
  for r in
    select cl.relname as tbl, att.attname as col
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid and cl.relnamespace = 'public'::regnamespace
    join pg_class ref on ref.oid = con.confrelid and ref.relname = 'users'
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f'
      and con.confdeltype = 'n'          -- 'n' = SET NULL
      and att.attnotnull                 -- pero la columna es NOT NULL → truena
      and array_length(con.conkey, 1) = 1
  loop
    execute format('alter table public.%I alter column %I drop not null', r.tbl, r.col);
  end loop;

  -- 2) FKs a users que bloquean (NO ACTION 'a' / RESTRICT 'r') en columnas
  --    NULLABLE → ON DELETE SET NULL.
  for r in
    select con.conname, cl.relname as tbl, att.attname as col
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid and cl.relnamespace = 'public'::regnamespace
    join pg_class ref on ref.oid = con.confrelid and ref.relname = 'users'
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f'
      and con.confdeltype in ('a', 'r')
      and not att.attnotnull
      and array_length(con.conkey, 1) = 1
  loop
    execute format('alter table public.%I drop constraint %I', r.tbl, r.conname);
    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references public.users(id) on delete set null',
      r.tbl, r.conname, r.col
    );
  end loop;
end $$;

-- ── Fin de migración 0169_fix_user_delete_fks ────────────────────────────────
