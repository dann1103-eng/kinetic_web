-- =============================================================================
-- repair_missing_pattern_appointments.sql — reponer citas del patrón que una
-- regeneración canceló y no volvió a crear.
--
-- Síntoma: en la agenda del mes hay una tumba `rescheduled` de cierto día sin
-- ninguna cita nueva que la reemplace, y el ciclo cobra más sesiones que las que
-- hay agendadas (el detalle de pago lo avisa: "N sesiones cobradas aún no
-- aparecen en el calendario").
--
-- Estrategia: CLONAR la cita de la misma terapia de la semana anterior y
-- correrla N días. Así el terapeuta, la hora, la duración, la modalidad y las
-- notas salen del dato real en vez de escribirse a mano.
--
-- OJO — esto inserta directo en la tabla y NO pasa por `createAppointment`, o
-- sea que no corre el sync de cobro (`syncCycleChargeToAgenda`). Si el ciclo ya
-- cobra estas sesiones, perfecto: la agenda se empareja con el cobro y no hay
-- nada más que hacer. Si NO las cobra, hay que subir "Ses/mes" en Editar ciclo
-- después (o borrar y recrear la cita desde la app para que el sync la tome).
--
-- USO: correr el paso A, leerlo, y solo entonces el paso B.
-- =============================================================================


-- ── A. Pre-chequeo: ¿es seguro insertar? ─────────────────────────────────────
-- Revisa las tres cosas que valida la app antes de agendar: que el día no sea
-- cierre institucional, que la cita no exista ya, y que el terapeuta esté libre.
with params as (
  select 'Apellido'::text  as apellido,        -- ← EDITAR
         date '2026-08-24' as dia_origen,      -- ← EDITAR: día a clonar (la semana que sí está)
         date '2026-08-31' as dia_destino,     -- ← EDITAR: día a reponer
         array['lenguaje','sensorial']::text[] as terapias  -- ← EDITAR
),
origen as (
  select a.*
    from public.appointments a
    join public.children ch on ch.id = a.child_id
    cross join params p
   where ch.full_name ilike '%' || p.apellido || '%'
     and a.event_type = 'terapia'
     and a.service_type = any(p.terapias)
     and a.status = 'scheduled'
     and (a.starts_at at time zone 'America/El_Salvador')::date = p.dia_origen
)
select
  o.service_type                                                     as terapia,
  to_char(o.starts_at at time zone 'America/El_Salvador', 'DD/MM HH24:MI') as origen,
  to_char((o.starts_at + (p.dia_destino - p.dia_origen) * interval '1 day')
            at time zone 'America/El_Salvador', 'DD/MM HH24:MI')     as destino,
  u.full_name                                                        as terapeuta,
  -- ¿el día destino es cierre institucional?
  (select string_agg(ic.name, ', ') from public.institutional_calendar ic
    where ic.date = p.dia_destino)                                   as cierre_institucional,
  -- ¿ya existe una cita viva de esa terapia ese día?
  (select count(*) from public.appointments x
    where x.child_id = o.child_id
      and x.service_type = o.service_type
      and x.status not in ('rescheduled','cancelled')
      and (x.starts_at at time zone 'America/El_Salvador')::date = p.dia_destino) as ya_existe,
  -- ¿el terapeuta tiene otra cita encima en ese horario?
  (select count(*) from public.appointments y
    where y.therapist_id = o.therapist_id
      and y.status in ('scheduled','in_progress','replacement')
      and y.starts_at < o.ends_at   + (p.dia_destino - p.dia_origen) * interval '1 day'
      and y.ends_at   > o.starts_at + (p.dia_destino - p.dia_origen) * interval '1 day') as solapes
from origen o
cross join params p
left join public.users u on u.id = o.therapist_id
order by o.starts_at;

-- Interpretación: insertar solo si `cierre_institucional` es NULL,
-- `ya_existe` = 0 y `solapes` = 0 en TODAS las filas.


-- =============================================================================
-- ── B. INSERT (destructivo — descomentar después de leer el paso A) ──────────
-- Va en transacción y con guarda anti-duplicado, así que re-correrlo no crea
-- copias. Revisar el SELECT final ANTES de hacer commit.
-- =============================================================================

-- begin;
--
-- with params as (
--   select 'Apellido'::text  as apellido,
--          date '2026-08-24' as dia_origen,
--          date '2026-08-31' as dia_destino,
--          array['lenguaje','sensorial']::text[] as terapias
-- )
-- insert into public.appointments (
--   child_id, therapist_id, event_type, service_type, modality,
--   starts_at, ends_at, status, created_by_user_id, notes, is_extra
-- )
-- select
--   a.child_id,
--   a.therapist_id,
--   a.event_type,
--   a.service_type,
--   a.modality,
--   a.starts_at + (p.dia_destino - p.dia_origen) * interval '1 day',
--   a.ends_at   + (p.dia_destino - p.dia_origen) * interval '1 day',
--   'scheduled',
--   a.created_by_user_id,
--   a.notes,     -- conserva "Auto-generado del ciclo YYYY-MM": así una futura
--                -- regeneración la reemplaza en vez de duplicarla
--   false
-- from public.appointments a
-- join public.children ch on ch.id = a.child_id
-- cross join params p
-- where ch.full_name ilike '%' || p.apellido || '%'
--   and a.event_type = 'terapia'
--   and a.service_type = any(p.terapias)
--   and a.status = 'scheduled'
--   and (a.starts_at at time zone 'America/El_Salvador')::date = p.dia_origen
--   -- no duplicar si ya hay una cita viva de esa terapia ese día
--   and not exists (
--     select 1 from public.appointments x
--      where x.child_id = a.child_id
--        and x.service_type = a.service_type
--        and x.status not in ('rescheduled','cancelled')
--        and (x.starts_at at time zone 'America/El_Salvador')::date = p.dia_destino
--   )
--   -- no agendar en día de cierre institucional
--   and not exists (
--     select 1 from public.institutional_calendar ic where ic.date = p.dia_destino
--   );
--
-- -- Verificación: la agenda del mes después del insert.
-- select
--   a.service_type as terapia,
--   a.status,
--   count(*) as citas,
--   string_agg(to_char(a.starts_at at time zone 'America/El_Salvador', 'DD'), ', '
--              order by a.starts_at) as dias
-- from public.appointments a
-- join public.children ch on ch.id = a.child_id
-- where ch.full_name ilike '%Apellido%'          -- ← mismo apellido
--   and a.event_type = 'terapia'
--   and a.starts_at >= '2026-08-01 00:00:00'::timestamp at time zone 'America/El_Salvador'
--   and a.starts_at <  '2026-09-01 00:00:00'::timestamp at time zone 'America/El_Salvador'
-- group by 1, 2
-- order by 1, 2;
--
-- -- Si el conteo cuadra: commit;  si no: rollback;
