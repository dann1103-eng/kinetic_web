-- =============================================================================
-- diag_cycle_amount_mismatch.sql — ¿por qué el detalle de pago muestra un monto
-- distinto al esperado?
--
-- El "Detalle de pago mensual" (PDF) lee DOS campos del ciclo:
--   · las filas de la tabla de costos → treatment_plan_snapshot->therapies_json
--     (`sessions_per_month` × `unit_cost_usd` de cada terapia activa)
--   · el "Total a pagar"              → payment_amount_usd
-- Si esos dos no concuerdan entre sí, o no concuerdan con la agenda, el
-- documento se ve mal. Este script muestra los tres números (snapshot, monto
-- guardado y agenda real) para saber cuál quedó atrás.
--
-- USO: cada paso es AUTÓNOMO — se corre solo, con su propio bloque `params`.
-- (El SQL Editor de Supabase ejecuta cada consulta en su propia sesión, así que
-- una vista temporal compartida entre pasos NO sobrevive.) Editar el `params`
-- del paso que se vaya a correr. Los pasos 1-4 son solo lectura; el 5 corrige.
-- =============================================================================


-- ── 1. El ciclo: estado y montos ─────────────────────────────────────────────
with params as (
  select 'Apellido'::text as apellido,   -- ← EDITAR: apellido del niño/a
         date '2026-08-01' as mes        -- ← EDITAR: primer día del mes del ciclo
)
select
  ch.full_name                          as nino,
  c.id                                  as cycle_id,
  c.period_month,
  c.status,
  c.payment_status,
  c.payment_amount_usd                  as total_que_muestra_el_pdf,
  c.discount_kind,
  c.discount_value,
  c.surcharge_amount_usd,
  c.paid_expected_usd,
  c.billing_adjustment_usd,
  c.invoice_id is not null              as tiene_factura,
  c.appointments_generated_count,
  c.notes
from public.monthly_session_cycles c
join public.children ch on ch.id = c.child_id
cross join params p
where ch.full_name ilike '%' || p.apellido || '%'
  and c.period_month = p.mes
  and c.status <> 'cancelled';


-- ── 2. Lo que COBRA el snapshot (= las filas de la tabla de costos del PDF) ──
with params as (
  select 'Apellido'::text as apellido,
         date '2026-08-01' as mes
)
select
  ch.full_name                                     as nino,
  t->>'service'                                    as terapia,
  (t->>'sessions_per_month')::numeric              as sesiones_cobradas,
  (t->>'unit_cost_usd')::numeric                   as precio_unit,
  case
    when public._kn_is_monthly_flat(t) then (t->>'unit_cost_usd')::numeric
    else (t->>'sessions_per_month')::numeric * (t->>'unit_cost_usd')::numeric
  end                                              as subtotal_linea
from public.monthly_session_cycles c
join public.children ch on ch.id = c.child_id
cross join params p
cross join lateral jsonb_array_elements(c.treatment_plan_snapshot->'therapies_json') t
where ch.full_name ilike '%' || p.apellido || '%'
  and c.period_month = p.mes
  and c.status <> 'cancelled'
  and (t->>'active')::boolean
order by terapia;


-- ── 3. Lo que hay en la AGENDA, por mes / terapia / estado ──────────────────
-- Ventana de DOS meses a propósito: si una sesión desapareció del mes del ciclo
-- por reagendamiento, la original queda 'rescheduled' acá y la nueva aparece en
-- el mes siguiente. Así se ve a dónde se fue.
--
-- Regla de cobro (`billableSessionCounts`): NO cuentan 'rescheduled' (lápida de
-- una cita movida) ni 'replacement' (reposición de una falta ya cobrada). Todo
-- lo demás sí, incluidas no_show / late_cancel / cancelled.
with params as (
  select 'Apellido'::text as apellido,
         date '2026-08-01' as desde,   -- ← EDITAR: mes del ciclo
         date '2026-10-01' as hasta    -- ← EDITAR: exclusivo (2 meses después)
)
select
  to_char(a.starts_at at time zone 'America/El_Salvador', 'YYYY-MM') as mes,
  a.service_type                                                    as terapia,
  a.status,
  count(*)                                                          as citas,
  count(*) filter (
    where a.status not in ('rescheduled','replacement')
  )                                                                 as cuentan_para_cobro,
  string_agg(to_char(a.starts_at at time zone 'America/El_Salvador', 'DD (Dy)'), ', '
             order by a.starts_at)                                  as dias
from public.appointments a
join public.children ch on ch.id = a.child_id
cross join params p
where ch.full_name ilike '%' || p.apellido || '%'
  and a.event_type = 'terapia'
  and a.starts_at >= (p.desde::text || ' 00:00:00')::timestamp at time zone 'America/El_Salvador'
  and a.starts_at <  (p.hasta::text || ' 00:00:00')::timestamp at time zone 'America/El_Salvador'
group by 1, 2, 3
order by 1, 2, 3;


-- ── 4. El veredicto: cobrado vs. agendado, terapia por terapia ───────────────
with params as (
  select 'Apellido'::text as apellido,
         date '2026-08-01' as mes
),
cyc as (
  select c.*, ch.full_name
    from public.monthly_session_cycles c
    join public.children ch on ch.id = c.child_id
    cross join params p
   where ch.full_name ilike '%' || p.apellido || '%'
     and c.period_month = p.mes
     and c.status <> 'cancelled'
),
cobrado as (
  select
    t->>'service'                       as terapia,
    (t->>'sessions_per_month')::numeric as sesiones,
    (t->>'unit_cost_usd')::numeric      as precio,
    public._kn_is_monthly_flat(t)       as es_mensualidad
  from cyc
  cross join lateral jsonb_array_elements(cyc.treatment_plan_snapshot->'therapies_json') t
  where (t->>'active')::boolean
),
agendado as (
  select a.service_type as terapia, count(*)::numeric as sesiones
  from public.appointments a, cyc
  where a.child_id = cyc.child_id
    and a.event_type = 'terapia'
    and a.status not in ('rescheduled','replacement')
    and a.starts_at >= (cyc.period_month::text || ' 00:00:00')::timestamp at time zone 'America/El_Salvador'
    and a.starts_at <  ((cyc.period_month + interval '1 month')::date::text || ' 00:00:00')::timestamp at time zone 'America/El_Salvador'
  group by a.service_type
)
select
  coalesce(c.terapia, g.terapia)                        as terapia,
  c.sesiones                                            as cobradas,
  g.sesiones                                            as agendadas,
  case
    when c.es_mensualidad                       then 'mensualidad fija (no aplica)'
    when c.sesiones is null                     then 'AGENDADA PERO NO COBRADA'
    when g.sesiones is null                     then 'cobrada, sin citas en la agenda'
    when c.sesiones = g.sesiones                then 'ok'
    when c.sesiones < g.sesiones                then 'FALTA COBRAR ' || (g.sesiones - c.sesiones) || ' sesión(es)'
    else 'COBRA DE MÁS ' || (c.sesiones - g.sesiones) || ' sesión(es)'
  end                                                   as veredicto,
  c.precio,
  case when c.es_mensualidad then c.precio else c.sesiones * c.precio end as subtotal_cobrado,
  case when c.es_mensualidad then c.precio else g.sesiones * c.precio end as subtotal_segun_agenda
from cobrado c
full outer join agendado g on g.terapia = c.terapia
order by terapia;


-- =============================================================================
-- ── 5. CORRECCIÓN (destructiva — descomentar solo después de leer 1-4) ───────
--
-- OJO: si el paso 4 dice 'ok' en todas las terapias, el cobro YA coincide con la
-- agenda y el documento está bien. Que el monto no sea el esperado significa que
-- lo que está mal es la AGENDA (falta o sobra una cita), no el ciclo: arreglar
-- la agenda y el cobro la sigue solo (`syncCycleChargeToAgenda`). Este paso 5 es
-- solo para el caso contrario: la agenda está bien y el ciclo quedó atrás.
--
-- Pone las sesiones cobradas de UNA terapia al valor correcto y recalcula
-- payment_amount_usd desde el snapshot (subtotal − descuento), que es la misma
-- fórmula que usan generar y editar el ciclo. Actualiza los DOS campos que lee
-- el PDF, así que después de correrlo el documento cierra solo.
--
-- Si el ciclo ya está PAGADO no toques payment_amount_usd: la diferencia se
-- arrastra al mes siguiente vía billing_adjustment_usd (ver createInvoiceForCycle).
-- =============================================================================

-- begin;
--
-- with target as (
--   select '00000000-0000-0000-0000-000000000000'::uuid as cycle_id,  -- ← del paso 1
--          'conductual'::text                           as servicio,  -- ← terapia a corregir
--          4::numeric                                   as sesiones   -- ← cantidad correcta
-- )
-- update public.monthly_session_cycles c
--    set treatment_plan_snapshot = jsonb_set(
--          c.treatment_plan_snapshot,
--          '{therapies_json}',
--          (select jsonb_agg(
--             case when t->>'service' = target.servicio
--                  then jsonb_set(t, '{sessions_per_month}', to_jsonb(target.sesiones))
--                  else t end)
--             from jsonb_array_elements(c.treatment_plan_snapshot->'therapies_json') t)
--        )
--   from target
--  where c.id = target.cycle_id;
--
-- -- Recalcular el total desde el snapshot ya corregido.
-- update public.monthly_session_cycles c
--    set payment_amount_usd = greatest(0, round(
--          sub.subtotal
--          - case
--              when c.discount_kind = 'percent' then sub.subtotal * c.discount_value / 100
--              when c.discount_kind = 'fixed'   then least(c.discount_value, sub.subtotal)
--              else 0
--            end, 2))
--   from (
--     select c2.id,
--            sum(case when public._kn_is_monthly_flat(t) then (t->>'unit_cost_usd')::numeric
--                     else (t->>'sessions_per_month')::numeric * (t->>'unit_cost_usd')::numeric end) as subtotal
--       from public.monthly_session_cycles c2
--       cross join lateral jsonb_array_elements(c2.treatment_plan_snapshot->'therapies_json') t
--      where c2.id = '00000000-0000-0000-0000-000000000000'::uuid   -- ← mismo cycle_id
--        and (t->>'active')::boolean
--      group by c2.id
--   ) sub
--  where c.id = sub.id
--    and c.payment_status = 'pending';   -- no re-cobrar un ciclo ya pagado
--
-- -- Revisar el resultado ANTES de confirmar; si no cuadra: rollback;
-- -- commit;
