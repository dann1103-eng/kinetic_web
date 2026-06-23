-- ═══════════════════════════════════════════════════════════════════════════
-- Fix: reasignar therapist_id en citas según el plan de tratamiento activo
-- ═══════════════════════════════════════════════════════════════════════════
-- PROBLEMA: algunas citas se generaron con therapist_id = primary_therapist_id
-- aunque el plan de tratamiento tiene un therapist_id distinto por service_type
-- (feature F2 / mig 0134). Como resultado la terapista principal ve citas de
-- otras terapistas y éstas no ven las suyas.
--
-- SOLUCIÓN: Para cada cita 'scheduled' con event_type='terapia', si el plan
-- activo del niño define un therapist_id específico para ese service_type,
-- actualizar la cita con ese terapista correcto.
--
-- ALCANCE: solo citas con status='scheduled' (no tocar las completadas ni las
-- del pasado que ya tienen sesiones/reportes).
--
-- PASO 1 — Previsualizar qué citas cambiarían (seguro, solo lectura).
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  a.id                                  AS appointment_id,
  a.service_type,
  a.starts_at,
  ch.full_name                          AS nino,
  a.therapist_id                        AS therapist_actual,
  u_actual.full_name                    AS nombre_actual,
  (t_entry->>'therapist_id')::uuid      AS therapist_correcto,
  u_correcto.full_name                  AS nombre_correcto
FROM public.appointments a
JOIN public.children ch ON ch.id = a.child_id
JOIN public.treatment_plans tp
  ON tp.child_id = a.child_id AND tp.active = true
JOIN LATERAL jsonb_array_elements(
  COALESCE(tp.therapies_json, '[]'::jsonb)
) AS t_entry ON
  t_entry->>'service' = a.service_type
  AND (t_entry->>'therapist_id') IS NOT NULL
  AND (t_entry->>'therapist_id') <> ''
LEFT JOIN public.users u_actual    ON u_actual.id    = a.therapist_id
LEFT JOIN public.users u_correcto  ON u_correcto.id  = (t_entry->>'therapist_id')::uuid
WHERE
  a.event_type = 'terapia'
  AND a.status = 'scheduled'
  AND a.therapist_id <> (t_entry->>'therapist_id')::uuid
ORDER BY ch.full_name, a.starts_at;


-- ═══════════════════════════════════════════════════════════════════════════
-- PASO 2 — Aplicar el fix. Correr DESPUÉS de revisar el PASO 1.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE public.appointments a
SET    therapist_id = (t_entry->>'therapist_id')::uuid
FROM   public.treatment_plans tp
JOIN LATERAL jsonb_array_elements(
  COALESCE(tp.therapies_json, '[]'::jsonb)
) AS t_entry ON
  t_entry->>'service' = a.service_type
  AND (t_entry->>'therapist_id') IS NOT NULL
  AND (t_entry->>'therapist_id') <> ''
WHERE
  tp.child_id = a.child_id
  AND tp.active = true
  AND a.event_type = 'terapia'
  AND a.status = 'scheduled'
  AND a.therapist_id <> (t_entry->>'therapist_id')::uuid;

-- Ver cuántas filas se actualizaron.
-- Si el resultado es 0, no había inconsistencias pendientes.
