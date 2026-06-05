-- Migración 0146 — coordinadora_familias puede anular ciclos
-- =============================================================================
-- El RPC cancel_monthly_cycle (0101) restringía la anulación a admin/directora.
-- Ahora también coordinadora_familias puede anular (void factura + cancelar las
-- citas 'scheduled' del mes). Mismo set en la server action cancelMonthlyCycle
-- y en CAN_CANCEL_CYCLES_ROLES (página del niño).
--
-- Reproducción verbatim de la función de 0101; ÚNICO cambio: el rol en el
-- bloque de autorización. Misma firma (uuid, text) ⇒ CREATE OR REPLACE
-- reemplaza (no crea sobrecarga).
-- =============================================================================

create or replace function public.cancel_monthly_cycle(
  p_cycle_id uuid,
  p_reason   text
) returns public.monthly_session_cycles
language plpgsql security definer as $$
declare
  v_cycle public.monthly_session_cycles;
  v_first_day date;
  v_last_day  date;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid()
      and role in ('admin','directora','coordinadora_familias')
  ) then
    raise exception 'not_authorized';
  end if;

  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'reason_too_short';
  end if;

  select * into v_cycle
    from public.monthly_session_cycles
   where id = p_cycle_id
   for update;

  if not found then raise exception 'cycle_not_found'; end if;
  if v_cycle.status = 'cancelled' then return v_cycle; end if;

  v_first_day := v_cycle.period_month;
  v_last_day  := (v_first_day + interval '1 month' - interval '1 day')::date;

  -- Void la invoice asociada
  if v_cycle.invoice_id is not null then
    update public.invoices
       set status = 'void',
           void_reason = trim(p_reason),
           void_by = auth.uid(),
           void_at = now()
     where id = v_cycle.invoice_id;
  end if;

  -- Cancelar appointments scheduled del periodo (los ya iniciados/completed se respetan)
  update public.appointments
     set status = 'rescheduled',
         notes = coalesce(notes,'') || E'\nCiclo cancelado: ' || trim(p_reason)
   where child_id = v_cycle.child_id
     and starts_at >= v_first_day
     and starts_at <  (v_last_day + interval '1 day')
     and status = 'scheduled'
     and (notes like '%Auto-generado del ciclo%' or notes is null);

  update public.monthly_session_cycles
     set status = 'cancelled',
         cancel_reason = trim(p_reason),
         cancelled_at = now(),
         cancelled_by_user_id = auth.uid()
   where id = p_cycle_id
   returning * into v_cycle;

  return v_cycle;
end;
$$;

-- ── Fin de migración 0146 ────────────────────────────────────────────────────
