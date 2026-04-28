-- ============================================================
-- FM CRM — Migration 0060: Integración con n1co business
-- ============================================================
-- Añade:
--   1. Campos n1co en `plans` (id de plan en n1co + links estáticos por plan).
--   2. Campos n1co en `clients` (suscripción + customer + payment method).
--   3. Campos n1co + DTE en `invoices` (link de pago + datos del DTE emitido).
--   4. Campos de configuración en `company_settings` (ambiente, location).
--   5. Tabla `n1co_payment_events` (auditoría completa de webhooks).
-- ============================================================

-- ── 1. plans: links estáticos + sync con n1co ───────────────
alter table public.plans
  add column if not exists n1co_plan_id                     text,
  add column if not exists n1co_payment_link_static_sandbox text,
  add column if not exists n1co_payment_link_static_prod    text,
  add column if not exists n1co_synced_at                   timestamptz;

-- Seed de los 3 links sandbox que el usuario ya creó manualmente.
update public.plans set n1co_payment_link_static_sandbox = 'https://pay-sandbox.n1co.shop/pl/2PGRcv1q'
  where lower(name) similar to '%(b[áa]sico)%' and n1co_payment_link_static_sandbox is null;
update public.plans set n1co_payment_link_static_sandbox = 'https://pay-sandbox.n1co.shop/pl/KEj9c0YV'
  where lower(name) like '%pro%' and lower(name) not like '%premium%' and n1co_payment_link_static_sandbox is null;
update public.plans set n1co_payment_link_static_sandbox = 'https://pay-sandbox.n1co.shop/pl/Q2O5Fdkw'
  where lower(name) like '%premium%' and n1co_payment_link_static_sandbox is null;


-- ── 2. clients: datos de suscripción n1co ───────────────────
alter table public.clients
  add column if not exists n1co_customer_id              text,
  add column if not exists n1co_subscription_id          text,
  add column if not exists n1co_payment_method_id        text,
  add column if not exists n1co_subscription_status      text,
  add column if not exists n1co_subscription_started_at  timestamptz,
  add column if not exists n1co_subscription_cancelled_at timestamptz;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'clients_n1co_subscription_status_check'
  ) then
    alter table public.clients
      add constraint clients_n1co_subscription_status_check
      check (n1co_subscription_status is null or n1co_subscription_status in ('Pending','Active','Inactive','Blocked','Error','Cancelled'));
  end if;
end $$;

create unique index if not exists clients_n1co_subscription_id_uq
  on public.clients(n1co_subscription_id)
  where n1co_subscription_id is not null;


-- ── 3. invoices: payment provider + datos n1co + datos DTE ──
alter table public.invoices
  add column if not exists payment_provider        text not null default 'manual',
  add column if not exists n1co_payment_link_id    text,
  add column if not exists n1co_payment_link_url   text,
  add column if not exists n1co_order_reference    text,
  add column if not exists n1co_order_id           text,
  add column if not exists n1co_buyer_email        text,
  add column if not exists n1co_buyer_name         text,
  add column if not exists n1co_paid_at            timestamptz,
  -- Datos del DTE generado (input manual del admin post-emisión, o auto-poblado si n1co lo expone)
  add column if not exists dte_codigo_generacion   uuid,
  add column if not exists dte_numero_control      text,
  add column if not exists dte_sello_recepcion     text,
  add column if not exists dte_tipo                text,
  add column if not exists dte_pdf_url             text,
  add column if not exists dte_received_at         timestamptz;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'invoices_payment_provider_check'
  ) then
    alter table public.invoices
      add constraint invoices_payment_provider_check
      check (payment_provider in ('manual','n1co_subscription','n1co_link','n1co_link_oneoff','n1co_static'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'invoices_dte_tipo_check'
  ) then
    alter table public.invoices
      add constraint invoices_dte_tipo_check
      check (dte_tipo is null or dte_tipo in ('01','03','05','06','14'));
  end if;
end $$;

create unique index if not exists invoices_n1co_order_id_uq
  on public.invoices(n1co_order_id) where n1co_order_id is not null;

create unique index if not exists invoices_n1co_order_reference_uq
  on public.invoices(n1co_order_reference) where n1co_order_reference is not null;

create index if not exists invoices_payment_provider_status_idx
  on public.invoices(payment_provider, status);


-- ── 4. company_settings: configuración n1co ─────────────────
alter table public.company_settings
  add column if not exists n1co_environment        text not null default 'sandbox',
  add column if not exists n1co_location_code      text,
  add column if not exists n1co_location_id        integer,
  add column if not exists n1co_webhook_secret_hint text;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'company_settings_n1co_environment_check'
  ) then
    alter table public.company_settings
      add constraint company_settings_n1co_environment_check
      check (n1co_environment in ('sandbox','production'));
  end if;
end $$;


-- ── 5. n1co_payment_events: auditoría completa de webhooks ──
create table if not exists public.n1co_payment_events (
  id                   uuid primary key default gen_random_uuid(),
  event_type           text not null,
  order_id             text,
  order_reference      text,
  payment_link_id      text,
  subscription_id      text,
  buyer_email          text,
  buyer_name           text,
  buyer_phone          text,
  buyer_external_id    text,
  metadata_json        jsonb,
  raw_payload_json     jsonb not null,
  hmac_signature       text,
  signature_valid      boolean,
  matched_invoice_id   uuid references public.invoices(id) on delete set null,
  matched_client_id    uuid references public.clients(id)  on delete set null,
  matching_strategy    text,
  processed            boolean not null default false,
  process_error        text,
  received_at          timestamptz not null default now()
);

create index if not exists n1co_payment_events_order_id_idx        on public.n1co_payment_events(order_id);
create index if not exists n1co_payment_events_subscription_id_idx on public.n1co_payment_events(subscription_id);
create index if not exists n1co_payment_events_buyer_email_idx     on public.n1co_payment_events(buyer_email);
create index if not exists n1co_payment_events_received_at_idx     on public.n1co_payment_events(received_at desc);

-- Idempotencia: un mismo (order_id, event_type) procesado no se aplica dos veces.
-- No es UNIQUE porque queremos guardar reintentos como auditoría — el handler
-- chequea si ya hay un row con processed=true antes de re-procesar.
create index if not exists n1co_payment_events_dedup_idx
  on public.n1co_payment_events(order_id, event_type, processed)
  where order_id is not null;

alter table public.n1co_payment_events enable row level security;

-- Solo admins pueden leer eventos (datos sensibles del comprador).
create policy "n1co_payment_events_select_admin"
  on public.n1co_payment_events for select
  using (public.is_admin());

-- INSERT/UPDATE: el webhook handler usa Service Role (bypassa RLS).
-- Los usuarios regulares no pueden insertar ni modificar eventos.


-- ── 6. Comentarios documentando el schema ───────────────────
comment on column public.invoices.payment_provider is
  'Origen del cobro: manual (efectivo/transferencia) | n1co_subscription | n1co_link (link dinámico por factura) | n1co_link_oneoff (paquete extra) | n1co_static (link estático fallback)';
comment on column public.invoices.n1co_order_reference is
  'Referencia externa que se mandó a n1co al crear el payment link (típicamente invoice.id). Permite matchear el webhook directamente.';
comment on column public.invoices.dte_codigo_generacion is
  'UUID v4 del DTE asignado por el Ministerio de Hacienda. Llenado manualmente por admin post-emisión, o auto-poblado si n1co lo expone vía webhook/API.';
comment on column public.invoices.dte_numero_control is
  'Número de control del DTE en formato DTE-XX-CCCCCCCC-NNNNNNNNNNNNNNN.';
comment on column public.invoices.dte_tipo is
  '01=Factura Consumidor Final, 03=Comprobante Crédito Fiscal, 05=Nota Crédito, 06=Nota Débito, 14=Sujeto Excluido';
comment on table public.n1co_payment_events is
  'Auditoría de todos los webhooks recibidos de n1co. Persistido siempre (firma válida o no) para debugging y conciliación.';
