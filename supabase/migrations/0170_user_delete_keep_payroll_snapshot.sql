-- =============================================================================
-- 0170 — Poder eliminar SIEMPRE un usuario, conservando el registro contable
-- =============================================================================
-- Complementa 0169. La 0169 dejaba a propósito bloqueando las FK NOT NULL (p.ej.
-- payroll_items.user_id) para "proteger la planilla". Pero el registro contable
-- YA es autosuficiente: payroll_items.user_snapshot_json guarda nombre, DUI,
-- ISSS, AFP, rol, etc. al momento de sellar. Entonces el user_id es solo un
-- vínculo de conveniencia y NO debe impedir borrar el perfil.
--
-- Este migración hace que NINGUNA FK a public.users bloquee el borrado:
--   • Toda columna con FK bloqueante (NO ACTION / RESTRICT) → ON DELETE SET NULL
--     (si es NOT NULL, primero se vuelve NULLABLE).
--   • Toda columna NOT NULL con FK ya SET NULL (contradicción) → NULLABLE.
-- Es dinámico sobre los constraints REALES e idempotente (se puede correr aunque
-- ya se haya aplicado 0169). Las filas con snapshot (planilla) sobreviven con su
-- info descriptiva intacta; solo se pone user_id = NULL.
-- =============================================================================

do $$
declare
  r record;
begin
  -- 1) FKs a users que BLOQUEAN (NO ACTION 'a' / RESTRICT 'r'): volver la
  --    columna NULLABLE si hace falta y pasar el FK a ON DELETE SET NULL.
  for r in
    select con.conname, cl.relname as tbl, att.attname as col, att.attnotnull as notnull
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid and cl.relnamespace = 'public'::regnamespace
    join pg_class ref on ref.oid = con.confrelid and ref.relname = 'users'
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f'
      and con.confdeltype in ('a', 'r')
      and array_length(con.conkey, 1) = 1
  loop
    if r.notnull then
      execute format('alter table public.%I alter column %I drop not null', r.tbl, r.col);
    end if;
    execute format('alter table public.%I drop constraint %I', r.tbl, r.conname);
    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references public.users(id) on delete set null',
      r.tbl, r.conname, r.col
    );
  end loop;

  -- 2) Contradicción NOT NULL + ON DELETE SET NULL (por si 0169 no se aplicó).
  for r in
    select cl.relname as tbl, att.attname as col
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid and cl.relnamespace = 'public'::regnamespace
    join pg_class ref on ref.oid = con.confrelid and ref.relname = 'users'
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f'
      and con.confdeltype = 'n'
      and att.attnotnull
      and array_length(con.conkey, 1) = 1
  loop
    execute format('alter table public.%I alter column %I drop not null', r.tbl, r.col);
  end loop;
end $$;

-- ── Fin de migración 0170_user_delete_keep_payroll_snapshot ───────────────────
