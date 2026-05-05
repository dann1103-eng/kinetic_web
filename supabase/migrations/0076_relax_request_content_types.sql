-- 0076_relax_request_content_types.sql
-- Permite que los clientes soliciten cualquier tipo de contenido (artes, reuniones,
-- producciones) EXCEPTO matriz_contenido (que es prerrogativa de la agencia).

begin;

drop policy if exists "Work users can request requirements" on public.requirements;
create policy "Work users can request requirements" on public.requirements
  for insert
  with check (
    approval_status = 'pending'
    and content_type <> 'matriz_contenido'
    and requested_by_user_id = auth.uid()
    and exists (
      select 1 from public.billing_cycles bc
      where bc.id = requirements.billing_cycle_id
        and public.is_work_user_of(bc.client_id)
    )
  );

commit;
