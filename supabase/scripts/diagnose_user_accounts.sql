-- diagnose_user_accounts.sql
-- Diagnóstico de cuentas de usuario en mal estado.
-- Correr en Supabase Studio → SQL Editor. Solo LEE (no modifica nada).
--
-- NOTA: el SQL Editor muestra solo el resultado de la ÚLTIMA sentencia cuando
-- corrés varias. Por eso los 3 chequeos van en UNA sola query (UNION) para que
-- veas todos los problemas juntos. Si no devuelve filas, no hay cuentas rotas.

-- ── Chequeo combinado (auth sin perfil / rol legacy operator / email desync) ──
select 'auth_sin_perfil' as problema, au.id::text as id,
       au.email as email_auth, null as email_perfil, null as full_name, null as role
from auth.users au
left join public.users pu on pu.id = au.id
where pu.id is null

union all
select 'rol_operator_legacy', pu.id::text,
       null, pu.email, pu.full_name, pu.role
from public.users pu
where pu.role = 'operator'

union all
select 'email_desincronizado', au.id::text,
       au.email, pu.email, pu.full_name, pu.role
from auth.users au
join public.users pu on pu.id = au.id
where lower(coalesce(au.email,'')) <> lower(coalesce(pu.email,''))
order by problema;

-- ── Búsqueda puntual por persona (cambiá el filtro 'ana') ─────────────────────
-- Correr POR SEPARADO (seleccionar solo este bloque y Run) para ver su cuenta:
--
-- select au.id, au.email as email_auth, au.email_confirmed_at,
--        pu.email as email_perfil, pu.full_name, pu.role, pu.current_session_id
-- from auth.users au
-- left join public.users pu on pu.id = au.id
-- where au.email ilike '%ana%' or pu.full_name ilike '%ana%';
