-- =============================================================================
-- 0171 — Arregla el bloqueo de `storage.objects.owner` al eliminar usuarios
-- =============================================================================
-- Las migraciones 0169/0170 solo revisaron FKs en el esquema `public`. Pero
-- Supabase Storage tiene su PROPIA tabla `storage.objects` (un archivo subido =
-- una fila ahí) con una columna `owner` que referencia a `auth.users(id)` SIN
-- `ON DELETE SET NULL` (comportamiento por defecto de Supabase, no algo que
-- creamos nosotros). Cuando un usuario sube un archivo desde el NAVEGADOR con
-- su propia sesión (no el admin client) — como la foto de perfil en el bucket
-- `user-avatars` (mig 0143, políticas RLS por auth.uid()) — Storage marca esa
-- fila como suya (`owner`). Si luego se intenta eliminar ese usuario, esa
-- referencia bloquea el borrado con "Database error deleting user", el MISMO
-- síntoma que 0170 quiso arreglar pero no alcanzaba (0170 solo miraba `public`).
--
-- Fix general: en vez de arreglar solo `storage.objects`, se generaliza el DO
-- block de 0170 para revisar TODOS los esquemas (no solo `public`) en busca de
-- FKs bloqueantes hacia `auth.users(id)` o `public.users(id)`, y los pasa a
-- `ON DELETE SET NULL`. Cada fila se altera dentro de su propio bloque
-- EXCEPTION: si alguna no se puede tocar (permisos, tabla de sistema, etc.), se
-- omite con un aviso en vez de abortar toda la migración.
-- =============================================================================

do $$
declare
  r record;
begin
  for r in
    select
      con.conname,
      ns.nspname as schema_name,
      cl.relname as tbl,
      att.attname as col,
      att.attnotnull as notnull,
      refns.nspname as ref_schema
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_namespace ns on ns.oid = cl.relnamespace
    join pg_class ref on ref.oid = con.confrelid
    join pg_namespace refns on refns.oid = ref.relnamespace
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f'
      and con.confdeltype in ('a', 'r')          -- bloqueante: NO ACTION / RESTRICT
      and ref.relname = 'users'
      and refns.nspname in ('public', 'auth')     -- apunta a public.users o auth.users
      and array_length(con.conkey, 1) = 1         -- FK de una sola columna
      -- No tocar los esquemas de sistema NI el esquema interno `auth` de
      -- Supabase (sus propias tablas como auth.identities/sessions ya manejan
      -- su cascada correctamente; no es nuestro código y no debemos alterarlo).
      and ns.nspname not in ('pg_catalog', 'information_schema', 'auth')
  loop
    begin
      if r.notnull then
        execute format('alter table %I.%I alter column %I drop not null', r.schema_name, r.tbl, r.col);
      end if;
      execute format('alter table %I.%I drop constraint %I', r.schema_name, r.tbl, r.conname);
      execute format(
        'alter table %I.%I add constraint %I foreign key (%I) references %I.users(id) on delete set null',
        r.schema_name, r.tbl, r.conname, r.col, r.ref_schema
      );
      raise notice 'Arreglado: %.%.% -> ON DELETE SET NULL', r.schema_name, r.tbl, r.col;
    exception when others then
      -- No abortar toda la migración por una tabla que no se pueda tocar
      -- (p.ej. falta de permisos en un esquema de extensión).
      raise notice 'Omitido % . % . % (%): %', r.schema_name, r.tbl, r.col, r.conname, sqlerrm;
    end;
  end loop;
end $$;

-- ── Fin de migración 0171_fix_storage_owner_blocks_user_delete ───────────────
