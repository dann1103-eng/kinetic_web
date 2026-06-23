-- ═══════════════════════════════════════════════════════════════════════════
-- Fix: corregir therapist_id en citas según el plan de tratamiento activo
-- ═══════════════════════════════════════════════════════════════════════════
-- PROBLEMA: citas generadas con therapist_id = primary_therapist_id aunque
-- el plan tiene un therapist_id diferente por service_type en therapies_json.
-- Resultado: terapistas secundarias no ven las citas que les corresponden
-- y la principal ve de más.
--
-- PASO 1 — Previsualizar qué citas cambiarían (sin modificar nada).
-- ═══════════════════════════════════════════════════════════════════════════

WITH plan_per_service AS (
  -- Para cada plan activo, extraer el therapist_id explícito por servicio.
  -- Solo incluye entradas que tienen therapist_id no nulo/vacío.
  SELECT
    tp.child_id,
    (t->>'service')            AS service_type,
    (t->>'therapist_id')::uuid AS plan_therapist_id
  FROM public.treatment_plans tp
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(tp.therapies_json, '[]'::jsonb)
  ) AS t
  WHERE tp.active = true
    AND (t->>'therapist_id') IS NOT NULL
    AND (t->>'therapist_id') <> ''
)
SELECT
  c.full_name                             AS nino,
  a.service_type,
  a.starts_at::date                       AS fecha,
  a.status,
  u_actual.full_name                      AS terapista_actual,
  u_correcto.full_name                    AS terapista_correcto,
  a.id                                    AS appointment_id
FROM public.appointments a
JOIN plan_per_service ps
  ON ps.child_id = a.child_id
  AND ps.service_type = a.service_type
JOIN public.children c ON c.id = a.child_id
JOIN public.users u_actual   ON u_actual.id   = a.therapist_id
JOIN public.users u_correcto ON u_correcto.id = ps.plan_therapist_id
WHERE a.event_type = 'terapia'
  AND a.status IN ('scheduled', 'completed')  -- ambos tipos
  AND a.therapist_id <> ps.plan_therapist_id
ORDER BY c.full_name, a.starts_at DESC;


-- ═══════════════════════════════════════════════════════════════════════════
-- PASO 2A — Corregir solo citas FUTURAS (scheduled).
--           Más seguro: no toca el historial de sesiones completadas.
-- ═══════════════════════════════════════════════════════════════════════════

WITH plan_per_service AS (
  SELECT
    tp.child_id,
    (t->>'service')            AS service_type,
    (t->>'therapist_id')::uuid AS plan_therapist_id
  FROM public.treatment_plans tp
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(tp.therapies_json, '[]'::jsonb)
  ) AS t
  WHERE tp.active = true
    AND (t->>'therapist_id') IS NOT NULL
    AND (t->>'therapist_id') <> ''
)
UPDATE public.appointments a
SET    therapist_id = ps.plan_therapist_id
FROM   plan_per_service ps
WHERE  a.child_id     = ps.child_id
  AND  a.service_type = ps.service_type
  AND  a.event_type   = 'terapia'
  AND  a.status       = 'scheduled'
  AND  a.therapist_id <> ps.plan_therapist_id;


-- ═══════════════════════════════════════════════════════════════════════════
-- PASO 2B — Corregir TAMBIÉN citas completadas (historial).
--           Necesario para que la agenda y perfil de las terapistas
--           muestren el historial correcto.
--           (Correr después de 2A o en lugar de 2A si querés el historial.)
-- ═══════════════════════════════════════════════════════════════════════════

WITH plan_per_service AS (
  SELECT
    tp.child_id,
    (t->>'service')            AS service_type,
    (t->>'therapist_id')::uuid AS plan_therapist_id
  FROM public.treatment_plans tp
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(tp.therapies_json, '[]'::jsonb)
  ) AS t
  WHERE tp.active = true
    AND (t->>'therapist_id') IS NOT NULL
    AND (t->>'therapist_id') <> ''
)
UPDATE public.appointments a
SET    therapist_id = ps.plan_therapist_id
FROM   plan_per_service ps
WHERE  a.child_id     = ps.child_id
  AND  a.service_type = ps.service_type
  AND  a.event_type   = 'terapia'
  AND  a.status       IN ('scheduled', 'completed')
  AND  a.therapist_id <> ps.plan_therapist_id;
