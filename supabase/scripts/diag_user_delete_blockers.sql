-- =============================================================================
-- DIAGNÓSTICO — qué bloquea eliminar un usuario ("Database error deleting user")
-- Pegar TODO en Supabase Studio → SQL Editor → Run. Copiar el resultado.
-- Es SOLO LECTURA: no cambia nada.
-- =============================================================================

-- 1) TODAS las foreign keys (de cualquier esquema) que apuntan a public.users o
--    auth.users. La columna clave es delete_rule:
--      'NO ACTION' / 'RESTRICT' = BLOQUEAN el borrado  ← estos son el problema
--      'SET NULL' / 'CASCADE'   = OK, no bloquean
--    is_not_null=true en una columna con SET NULL también truena (contradicción).
select
  ns.nspname            as ref_schema,   -- 'public' o 'auth' (a quién apunta)
  refcl.relname         as ref_table,    -- 'users'
  cns.nspname           as fk_schema,    -- esquema de la tabla que referencia
  cl.relname            as fk_table,     -- tabla que referencia (ej. storage.objects)
  att.attname           as fk_column,    -- columna (ej. owner, user_id, therapist_id)
  case con.confdeltype
    when 'a' then 'NO ACTION'
    when 'r' then 'RESTRICT'
    when 'n' then 'SET NULL'
    when 'c' then 'CASCADE'
    when 'd' then 'SET DEFAULT'
  end                   as delete_rule,
  att.attnotnull        as is_not_null,
  con.conname           as constraint_name
from pg_constraint con
join pg_class    cl    on cl.oid = con.conrelid
join pg_namespace cns  on cns.oid = cl.relnamespace
join pg_class    refcl on refcl.oid = con.confrelid
join pg_namespace ns   on ns.oid = refcl.relnamespace
join pg_attribute att  on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
where con.contype = 'f'
  and refcl.relname = 'users'
  and ns.nspname in ('public', 'auth')
order by
  (case when con.confdeltype in ('a','r') then 0 else 1 end),  -- bloqueantes primero
  fk_schema, fk_table, fk_column;

-- 2) (Ejecutá esta segunda consulta por separado si querés) Triggers en
--    public.users y auth.users, por si un trigger es el que truena.
-- select tgrelid::regclass as tabla, tgname as trigger, tgenabled as habilitado
-- from pg_trigger
-- where tgrelid in ('public.users'::regclass, 'auth.users'::regclass)
--   and not tgisinternal;
