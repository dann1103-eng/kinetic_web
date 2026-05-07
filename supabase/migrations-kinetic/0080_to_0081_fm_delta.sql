-- ============================================================================
-- Kinetic — Delta FM 0080→0081 (catch-up merge desde master)
-- ============================================================================
-- Migraciones nuevas que master agregó después del primer pull de Kinetic.
-- Aplicar DESPUÉS de 0002_to_0079_merged.sql y ANTES de 0090_kinetic_init.sql.
--
-- Contenido:
--   1) 0080_message_reply_to.sql      — reply_to en mensajes inbox
--   2) 0081_invoice_terms_snapshot.sql — T&C snapshot por factura/cotización
-- ============================================================================


-- ============================================================================
-- ╔══ 0080_message_reply_to.sql
-- ============================================================================
-- Soporte para responder mensajes en el inbox (reply-to thread).
-- reply_to_message_id apunta al mensaje original; SET NULL si el original se borra.
alter table public.messages
  add column if not exists reply_to_message_id uuid
    references public.messages(id) on delete set null;

create index if not exists messages_reply_to_idx
  on public.messages(reply_to_message_id)
  where reply_to_message_id is not null;


-- ============================================================================
-- ╔══ 0081_invoice_terms_snapshot.sql
-- ============================================================================
-- Añade el snapshot de términos y condiciones a las facturas.
-- Las cotizaciones ya tenían esta columna (migración 0048).
alter table public.invoices
  add column if not exists terms_snapshot_json jsonb;

