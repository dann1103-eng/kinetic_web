-- 0175 — Recargo por mora: se cobra en la mensualidad SIGUIENTE + exención por familia
--
-- Cambio operativo pedido por administración:
--   (a) La multa por pago tardío de una mensualidad NO se suma a la factura del
--       mes que se está cobrando: se registra en el ciclo y se cobra como línea
--       de cargo en la factura de la mensualidad siguiente (espejo del rollover
--       de descuento, pero como CARGO). La inyección de la línea en la factura
--       siguiente vive en TS (createInvoiceForCycle, kinetic-invoices.ts).
--   (b) Familias con trato especial pueden quedar EXENTAS de recargos por mora
--       (families.late_fee_exempt) — el RPC de pago no genera recargo.
--
-- Redefine mark_monthly_cycle_paid con la MISMA firma de 4 args (0136/0145):
-- CREATE OR REPLACE sin drop, no cambia la firma (gotcha de sobrecargas).

-- 1) Flag de exención por familia
alter table public.families
  add column if not exists late_fee_exempt boolean not null default false;

-- 2) Columnas de arrastre en el ciclo
alter table public.monthly_session_cycles
  add column if not exists surcharge_carried_in_usd numeric(12,2) not null default 0,
  add column if not exists surcharge_carried_at timestamptz;

comment on column public.monthly_session_cycles.surcharge_amount_usd is
  'Recargo por mora GENERADO al pagar tarde este ciclo. Desde 0175 no se suma a la factura de este mes: se cobra en la factura del mes siguiente.';
comment on column public.monthly_session_cycles.surcharge_carried_in_usd is
  'Recargo(s) de meses anteriores cobrados en la factura de ESTE ciclo.';
comment on column public.monthly_session_cycles.surcharge_carried_at is
  'Cuándo el recargo generado por este ciclo fue incluido en una factura posterior (evita doble cobro).';

-- 3) RPC: mismo flujo de 0145 salvo (a) exención y (b) el recargo YA NO toca la
--    factura ni el monto pagado de este mes — solo queda registrado en el ciclo.
create or replace function public.mark_monthly_cycle_paid(
  p_cycle_id        uuid,
  p_payment_method  text default 'cash',
  p_payment_reference text default null,
  p_paid_at         timestamptz default now()
) returns public.monthly_session_cycles
language plpgsql security definer as $$
declare
  v_cycle       public.monthly_session_cycles;
  v_invoice     public.invoices;
  v_grace       date;
  v_days_late   int;
  v_blocks      int;
  v_pct         numeric;
  v_base        numeric(12,2);
  v_surcharge   numeric(12,2) := 0;
  v_exempt      boolean := false;
begin
  if not public.kn_can_manage_cycles() then
    raise exception 'not_authorized';
  end if;

  select * into v_cycle from public.monthly_session_cycles where id = p_cycle_id for update;
  if not found then raise exception 'cycle_not_found'; end if;
  if v_cycle.status = 'cancelled' then raise exception 'cycle_cancelled'; end if;
  if v_cycle.payment_status = 'paid' then raise exception 'cycle_already_paid'; end if;

  -- Recargo por mora: 5% por cada 5 días de atraso vs gracia efectiva.
  v_grace := coalesce(v_cycle.grace_extended_to, v_cycle.due_date);
  v_base  := v_cycle.payment_amount_usd;  -- total esperado (sin recargo)

  if v_cycle.invoice_id is not null then
    select * into v_invoice from public.invoices where id = v_cycle.invoice_id;
    if found then v_base := v_invoice.total; end if;
  end if;

  -- Exención por familia (trato especial): no se genera recargo.
  select coalesce(f.late_fee_exempt, false) into v_exempt
    from public.children c
    join public.families f on f.id = c.family_id
   where c.id = v_cycle.child_id;

  if not v_exempt and v_grace is not null then
    v_days_late := (p_paid_at::date - v_grace);
    if v_days_late > 0 then
      v_blocks := ceil(v_days_late::numeric / 5);
      v_pct := v_blocks * 5;
      v_surcharge := round(v_base * v_pct / 100, 2);
    end if;
  end if;

  -- Marcar la factura pagada por su total ORIGINAL: el recargo ya NO se agrega
  -- como línea ni infla el total de este mes (se cobra el mes siguiente).
  if v_cycle.invoice_id is not null and found then
    update public.invoices
       set status = 'paid',
           payment_date = p_paid_at::date,
           payment_method = p_payment_method,
           payment_reference = p_payment_reference
     where id = v_cycle.invoice_id;
  end if;

  update public.monthly_session_cycles
     set payment_status = 'paid',
         paid_at = p_paid_at,
         paid_by_user_id = auth.uid(),
         payment_method = p_payment_method,
         payment_reference = p_payment_reference,
         surcharge_amount_usd = v_surcharge,
         payment_amount_usd = v_base
   where id = p_cycle_id
   returning * into v_cycle;

  return v_cycle;
end;
$$;

notify pgrst, 'reload schema';
