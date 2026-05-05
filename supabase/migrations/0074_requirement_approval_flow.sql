-- 0074_requirement_approval_flow.sql
-- Solicitudes de requerimiento desde el portal del cliente:
--   * Cliente con can_work crea un requirement con approval_status='pending'
--     llenando solo título, descripción, fecha deseada y tipo (reunion|produccion).
--   * Staff (admin/supervisor) lo aprueba completando los campos faltantes
--     (estimated_time_minutes, priority, assigned_to, deadline final, consumo).
--   * Mientras está pending o rejected, NO aparece en pipeline ni en consumo.

begin;

alter table public.requirements
  add column if not exists approval_status text
    not null default 'approved'
    check (approval_status in ('approved','pending','rejected')),
  add column if not exists requested_by_user_id uuid references public.users(id),
  add column if not exists client_requested_deadline timestamptz,
  add column if not exists client_requested_notes text,
  add column if not exists approved_by_user_id uuid references public.users(id),
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_reason text,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by_user_id uuid references public.users(id);

create index if not exists requirements_pending_approval_idx
  on public.requirements(approval_status)
  where approval_status = 'pending';

-- Backfill explícito (default ya cubre filas nuevas; aseguramos las viejas)
update public.requirements set approval_status = 'approved' where approval_status is null;

-- Policy: work user puede insertar solicitudes (pending) para reunion/produccion
-- en sus propias billing_cycles. Los campos de staff se llenan luego al aprobar.
drop policy if exists "Work users can request requirements" on public.requirements;
create policy "Work users can request requirements" on public.requirements
  for insert
  with check (
    approval_status = 'pending'
    and content_type in ('reunion','produccion')
    and requested_by_user_id = auth.uid()
    and exists (
      select 1 from public.billing_cycles bc
      where bc.id = requirements.billing_cycle_id
        and public.is_work_user_of(bc.client_id)
    )
  );

commit;
