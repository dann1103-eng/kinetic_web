-- diagnose_user_accounts.sql
-- Diagnóstico de cuentas de usuario en mal estado.
-- Correr en Supabase Studio → SQL Editor. Solo LEE (no modifica nada).
--
-- Sirve para casos como "no me da pase al ingresar": cuentas de auth sin perfil,
-- perfiles con rol legacy 'operator' (creación a medias), o email desincronizado
-- entre auth.users y public.users.

-- 1) Usuarios de AUTH sin fila en public.users (no podrían entrar a la app:
--    getEffectiveUser devuelve null → rebote a /login).
select 'auth_sin_perfil' as problema, au.id, au.email, au.created_at
from auth.users au
left join public.users pu on pu.id = au.id
where pu.id is null
order by au.created_at desc;

-- 2) Perfiles con rol legacy 'operator' (default del trigger): suele indicar
--    una creación que NO completó el upsert de rol → cuenta a medias.
select 'rol_operator_legacy' as problema, pu.id, pu.email, pu.full_name, pu.role
from public.users pu
where pu.role = 'operator'
order by pu.email;

-- 3) Email desincronizado entre auth.users y public.users (la persona inicia
--    sesión con el email de AUTH; si difieren, confunde y el panel muestra otro).
select 'email_desincronizado' as problema, au.id,
       au.email as email_auth, pu.email as email_perfil, pu.full_name, pu.role
from auth.users au
join public.users pu on pu.id = au.id
where lower(coalesce(au.email,'')) <> lower(coalesce(pu.email,''))
order by pu.full_name;

-- 4) Buscar una persona puntual por nombre/correo (editar el filtro):
-- select au.id, au.email as email_auth, au.email_confirmed_at,
--        pu.email as email_perfil, pu.full_name, pu.role, pu.current_session_id
-- from auth.users au
-- left join public.users pu on pu.id = au.id
-- where au.email ilike '%ana%' or pu.full_name ilike '%ana%';
