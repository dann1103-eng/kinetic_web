-- 0073_client_user_permissions.sql
-- Permisos granulares dentro del portal del cliente:
--   * can_billing → ve facturación (invoices, quotes, invoice_items, quote_items)
--   * can_work    → gestiona trabajo (requirements, requirement_messages, review_*)
--
-- is_client_of() sigue existiendo y se mantiene para data compartida
-- (clients, client_users, plans, billing_cycles).
-- Las policies específicas de cada sección se actualizan para usar
-- is_billing_user_of() o is_work_user_of() según corresponda.

begin;

-- 1) Flags granulares en client_users
alter table public.client_users
  add column if not exists can_billing boolean not null default false,
  add column if not exists can_work boolean not null default false;

-- 2) Backfill: usuarios existentes mantienen acceso (compatibilidad).
--    'owner' → ambos permisos (era admin de la cuenta del cliente)
--    'viewer' → solo can_work (era observador del trabajo)
update public.client_users set can_billing = true, can_work = true
  where role = 'owner' and can_billing = false and can_work = false;
update public.client_users set can_work = true
  where role = 'viewer' and can_work = false;

-- 3) Helpers RLS por capacidad
create or replace function public.is_billing_user_of(target_client_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.client_users
    where user_id = auth.uid()
      and client_id = target_client_id
      and can_billing = true
  );
$$;

create or replace function public.is_work_user_of(target_client_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.client_users
    where user_id = auth.uid()
      and client_id = target_client_id
      and can_work = true
  );
$$;

-- ─────────────────────────────────────────────────────────────────────
-- Reemplazar policies de FACTURACIÓN (is_client_of → is_billing_user_of)
-- ─────────────────────────────────────────────────────────────────────

-- invoices
drop policy if exists "Client can view own invoices" on public.invoices;
create policy "Billing users can view own invoices" on public.invoices
  for select using (public.is_billing_user_of(client_id));

-- quotes (la policy aplica solo cuando client_id no es null; quotes con
-- client_id null son cotizaciones a prospectos y solo las ve el staff)
drop policy if exists "Client can view own quotes" on public.quotes;
create policy "Billing users can view own quotes" on public.quotes
  for select using (
    client_id is not null and public.is_billing_user_of(client_id)
  );

-- invoice_items (vía invoice)
drop policy if exists "invoice_items_select_client" on public.invoice_items;
create policy "invoice_items_select_billing" on public.invoice_items
  for select using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id
        and public.is_billing_user_of(i.client_id)
    )
  );

-- quote_items (vía quote)
drop policy if exists "quote_items_select_client" on public.quote_items;
create policy "quote_items_select_billing" on public.quote_items
  for select using (
    exists (
      select 1 from public.quotes q
      where q.id = quote_items.quote_id
        and q.client_id is not null
        and public.is_billing_user_of(q.client_id)
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- Reemplazar policies de TRABAJO (is_client_of → is_work_user_of)
-- ─────────────────────────────────────────────────────────────────────

-- requirements (read)
drop policy if exists "Client can view own requirements" on public.requirements;
create policy "Work users can view own requirements" on public.requirements
  for select using (
    exists (
      select 1 from public.billing_cycles bc
      where bc.id = requirements.billing_cycle_id
        and public.is_work_user_of(bc.client_id)
    )
  );

-- requirement_messages (read + insert)
drop policy if exists "Client can view visible messages" on public.requirement_messages;
create policy "Work users can view visible messages" on public.requirement_messages
  for select using (
    visible_to_client = true
    and exists (
      select 1
      from public.requirements r
      join public.billing_cycles bc on bc.id = r.billing_cycle_id
      where r.id = requirement_messages.requirement_id
        and public.is_work_user_of(bc.client_id)
    )
  );

drop policy if exists "Client can insert visible messages" on public.requirement_messages;
create policy "Work users can insert visible messages" on public.requirement_messages
  for insert with check (
    visible_to_client = true
    and user_id = auth.uid()
    and exists (
      select 1
      from public.requirements r
      join public.billing_cycles bc on bc.id = r.billing_cycle_id
      where r.id = requirement_id
        and public.is_work_user_of(bc.client_id)
    )
  );

-- review_assets / versions / version_files / pins / comments
-- (todos por work_user_of, en fase revision_cliente)
drop policy if exists "review_assets_select_client" on public.review_assets;
create policy "review_assets_select_work" on public.review_assets
  for select using (
    exists (
      select 1 from public.requirements r
      join public.billing_cycles bc on bc.id = r.billing_cycle_id
      where r.id = review_assets.requirement_id
        and r.phase = 'revision_cliente'
        and public.is_work_user_of(bc.client_id)
    )
  );

drop policy if exists "review_versions_select_client" on public.review_versions;
create policy "review_versions_select_work" on public.review_versions
  for select using (
    exists (
      select 1 from public.review_assets a
      join public.requirements r on r.id = a.requirement_id
      join public.billing_cycles bc on bc.id = r.billing_cycle_id
      where a.id = review_versions.asset_id
        and r.phase = 'revision_cliente'
        and public.is_work_user_of(bc.client_id)
    )
  );

drop policy if exists "review_version_files_select_client" on public.review_version_files;
create policy "review_version_files_select_work" on public.review_version_files
  for select using (
    exists (
      select 1 from public.review_versions v
      join public.review_assets a on a.id = v.asset_id
      join public.requirements r on r.id = a.requirement_id
      join public.billing_cycles bc on bc.id = r.billing_cycle_id
      where v.id = review_version_files.version_id
        and r.phase = 'revision_cliente'
        and public.is_work_user_of(bc.client_id)
    )
  );

drop policy if exists "review_pins_select_client" on public.review_pins;
create policy "review_pins_select_work" on public.review_pins
  for select using (
    exists (
      select 1 from public.review_versions v
      join public.review_assets a on a.id = v.asset_id
      join public.requirements r on r.id = a.requirement_id
      join public.billing_cycles bc on bc.id = r.billing_cycle_id
      where v.id = review_pins.version_id
        and r.phase = 'revision_cliente'
        and public.is_work_user_of(bc.client_id)
    )
  );

drop policy if exists "review_pins_insert_client" on public.review_pins;
create policy "review_pins_insert_work" on public.review_pins
  for insert with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.review_versions v
      join public.review_assets a on a.id = v.asset_id
      join public.requirements r on r.id = a.requirement_id
      join public.billing_cycles bc on bc.id = r.billing_cycle_id
      where v.id = review_pins.version_id
        and r.phase = 'revision_cliente'
        and public.is_work_user_of(bc.client_id)
    )
  );

drop policy if exists "review_comments_select_client" on public.review_comments;
create policy "review_comments_select_work" on public.review_comments
  for select using (
    exists (
      select 1 from public.review_pins p
      join public.review_versions v on v.id = p.version_id
      join public.review_assets a on a.id = v.asset_id
      join public.requirements r on r.id = a.requirement_id
      join public.billing_cycles bc on bc.id = r.billing_cycle_id
      where p.id = review_comments.pin_id
        and r.phase = 'revision_cliente'
        and public.is_work_user_of(bc.client_id)
    )
  );

drop policy if exists "review_comments_insert_client" on public.review_comments;
create policy "review_comments_insert_work" on public.review_comments
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.review_pins p
      join public.review_versions v on v.id = p.version_id
      join public.review_assets a on a.id = v.asset_id
      join public.requirements r on r.id = a.requirement_id
      join public.billing_cycles bc on bc.id = r.billing_cycle_id
      where p.id = review_comments.pin_id
        and r.phase = 'revision_cliente'
        and public.is_work_user_of(bc.client_id)
    )
  );

-- Storage bucket review-files: limitar a work_user
drop policy if exists "client_select_review_files" on storage.objects;
create policy "work_select_review_files" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'review-files'
    and exists (
      select 1 from public.requirements r
      join public.billing_cycles bc on bc.id = r.billing_cycle_id
      where r.id::text = split_part(name, '/', 1)
        and r.phase = 'revision_cliente'
        and public.is_work_user_of(bc.client_id)
    )
  );

commit;
