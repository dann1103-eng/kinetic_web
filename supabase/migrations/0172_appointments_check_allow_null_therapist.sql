-- =============================================================================
-- 0172 — Relaja el CHECK de appointments para poder eliminar terapeutas
-- =============================================================================
-- Causa REAL del "Database error deleting user" (confirmada con el error de
-- Postgres al reordenar el borrado en deleteUser):
--
--   new row for relation "appointments" violates check constraint
--   "appointments_terapia_requires_service_and_therapist"
--
-- El CHECK (mig 0092) exigía que TODA cita `terapia` tenga service_type Y
-- therapist_id no nulos. Al eliminar un terapeuta, la FK therapist_id pone el
-- valor en NULL (ON DELETE SET NULL, mig 0170) y ese UPDATE en cascada violaba
-- el CHECK → abortaba el borrado del usuario.
--
-- La regla "una terapia necesita terapeuta" ya se valida a nivel de APP al
-- crear/editar (createAppointment). El CHECK solo debe impedir CREAR una terapia
-- sin datos, no impedir que therapist_id quede NULL cuando su terapeuta fue
-- eliminado. Se relaja: para `terapia` se exige solo service_type. Las citas de
-- un terapeuta eliminado quedan SIN ASIGNAR (therapist_id NULL) — visibles para
-- reasignar, pero ya no bloquean el borrado.
--
-- Recomendación operativa: antes de eliminar un terapeuta, usar "Sustituir /
-- redirigir terapias" para pasar sus citas a otra persona; así no quedan citas
-- sin terapeuta.
-- =============================================================================

alter table public.appointments
  drop constraint if exists appointments_terapia_requires_service_and_therapist;

alter table public.appointments
  add constraint appointments_terapia_requires_service check (
    event_type <> 'terapia' or service_type is not null
  );

-- ── Fin de migración 0172_appointments_check_allow_null_therapist ─────────────
