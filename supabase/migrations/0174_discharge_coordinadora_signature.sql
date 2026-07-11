-- 0174 — Firma de coordinadora de terapias en altas/retiros
--
-- Requisito operativo: la ÚNICA firma requerida para dar de alta / retirar a un
-- niño es la de la coordinadora de terapias ("autorización Diana"). El flujo
-- `finalizeDischarge` ya le permitía cerrar la baja sola (jul 2026), pero no
-- estampaba ninguna firma: el registro y el PDF quedaban con "Sin firma" en las
-- dos casillas (terapista/directora), sin constancia de quién autorizó.
--
-- Este cambio agrega columnas de firma propias de coordinadora. Las columnas
-- signed_by_therapist_* y signed_by_directora_* se conservan para registros
-- históricos y para la vía opcional de doble firma.

alter table public.child_discharge_records
  add column if not exists signed_by_coordinadora_id   uuid references public.users(id),
  add column if not exists signed_by_coordinadora_name text,
  add column if not exists signed_by_coordinadora_at   timestamptz;

notify pgrst, 'reload schema';
