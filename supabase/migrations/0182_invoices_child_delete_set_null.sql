-- =============================================================================
-- 0182 — Fix: no se podía eliminar un niño con facturas (drift de esquema)
-- =============================================================================
-- BUG REPORTADO: al eliminar un niño con facturas Kinetic asociadas, Postgres
-- rechazaba el borrado con "update or delete on table children violates
-- foreign key constraint invoices_child_id_fkey".
--
-- CAUSA RAÍZ: drift de esquema. La migración 0110_kinetic_invoices.sql define
-- `invoices.child_id ... ON DELETE SET NULL`, pero en la base de datos real el
-- FK vigente es `ON DELETE RESTRICT` — nunca quedó sincronizado (o se corrigió
-- por fuera de una migración en algún momento). Es la ÚNICA FK hacia `children`
-- en todo el esquema que bloquea el borrado; el resto de tablas (appointments,
-- treatment_plans, progress_reports, session_reports, etc.) ya cascadean
-- correctamente.
--
-- Además, aunque el FK fuera SET NULL, el CHECK `invoices_client_or_child_check`
-- exige que EXACTAMENTE uno de client_id/child_id esté no-nulo — las facturas
-- Kinetic siempre tienen client_id=NULL (usan child_id en su lugar,
-- kinetic-invoices.ts), así que anular child_id dejaría ambas columnas NULL y
-- ese CHECK igual rechazaría el UPDATE en cascada. Se ajusta para permitir el
-- estado "huérfana" (ambas NULL, tras eliminar al dueño) sin dejar de prohibir
-- el estado inválido "ambas asignadas a la vez".
--
-- El registro de la factura sobrevive intacto (monto, fecha, notas, snapshot
-- de la familia en client_snapshot_json, nombre del niño ya embebido en notes
-- e invoice_items.description) — mismo patrón "eliminar SIEMPRE, conservando
-- el registro contable" ya usado para usuarios (migraciones 0169/0170).
-- =============================================================================

-- 1. FK: RESTRICT → SET NULL (alinea la BD real con lo que 0110 ya pretendía).
ALTER TABLE public.invoices DROP CONSTRAINT invoices_child_id_fkey;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_child_id_fkey
  FOREIGN KEY (child_id) REFERENCES public.children(id) ON DELETE SET NULL;

-- 2. CHECK: permitir "ambas NULL" (huérfana, tras borrar al dueño) además de
--    "exactamente una asignada" — sigue prohibiendo "ambas asignadas a la vez".
ALTER TABLE public.invoices DROP CONSTRAINT invoices_client_or_child_check;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_client_or_child_check
  CHECK (
    (client_id IS NOT NULL AND child_id IS NULL)
    OR (client_id IS NULL AND child_id IS NOT NULL)
    OR (client_id IS NULL AND child_id IS NULL)
  );

-- 3. invoices_requires_owner (exige que al menos una esté no-nula) queda
--    redundante y en conflicto directo con el punto 2 — se elimina.
ALTER TABLE public.invoices DROP CONSTRAINT invoices_requires_owner;

-- ── Fin de migración 0182 ────────────────────────────────────────────────────
