-- Migración 0063: Créditos del cliente sin caducidad
-- Reemplaza el modelo de "paquetes atados al ciclo" por un saldo persistente.
-- Los créditos se generan al pagar facturas con `extras_metadata` poblado y se consumen
-- al aprobar cambios extras o al crear requerimientos por encima del límite del ciclo.
--
-- Reusa la función public.update_updated_at() (creada en 0001_init.sql) para
-- mantener `updated_at` sincronizado automáticamente.

-- 1. Tipos de crédito disponibles
create type credit_kind as enum (
  'cambios',
  'content_estatico',
  'content_video_corto',
  'content_reel',
  'content_short'
);

-- 2. Tabla principal
create table public.client_credits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  kind credit_kind not null,
  qty_initial integer not null check (qty_initial > 0),
  qty_remaining integer not null check (qty_remaining >= 0),
  unit_price_usd numeric(12,2) not null default 0,
  source_invoice_id uuid references public.invoices(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Una factura solo puede generar créditos una vez (idempotencia para webhooks).
create unique index idx_client_credits_unique_source
  on public.client_credits(source_invoice_id, kind)
  where source_invoice_id is not null;

-- Búsquedas rápidas de saldo disponible.
create index idx_client_credits_available
  on public.client_credits(client_id, kind)
  where qty_remaining > 0;

-- updated_at trigger usando la función existente public.update_updated_at()
create trigger trg_client_credits_updated_at
  before update on public.client_credits
  for each row execute function public.update_updated_at();

-- 3. Metadata de paquete extra en facturas
alter table public.invoices
  add column if not exists extras_metadata jsonb;

comment on column public.invoices.extras_metadata is
  'Si la factura corresponde a un paquete extra: { kind: "cambios"|"content", content_type?: ContentType, qty: number }. Al pagar, se materializa como crédito en client_credits.';

-- 4. Tracking de qué crédito pagó qué consumo (para reverso al anular)
alter table public.requirements
  add column if not exists paid_from_credit_id uuid references public.client_credits(id);

alter table public.requirement_cambio_logs
  add column if not exists paid_from_credit_id uuid references public.client_credits(id);

-- 5. RLS
alter table public.client_credits enable row level security;

-- Personal interno (admin, supervisor, operator) puede leer todos los créditos.
create policy "credits_select_internal" on public.client_credits
  for select using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role <> 'client'
    )
  );

-- Cliente solo lee los créditos de sus marcas.
create policy "credits_select_client" on public.client_credits
  for select using (public.is_client_of(client_id));

-- Sin policies INSERT/UPDATE/DELETE — solo desde server actions con admin client (service_role).
