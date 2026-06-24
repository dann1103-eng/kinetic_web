-- =============================================================================
-- 0157 — Eliminar la dependencia de "terapista principal"
-- =============================================================================
-- Decisión operativa: ya NO hay terapista principal. La asignación vive solo en
-- treatment_plans.therapies_json[].therapist_id (terapista por tipo de terapia).
-- Eso es lo único que habilita al niño/a en "mis niños" y asigna sus citas. Los
-- programas matutinos los cubre el grupo (sin terapista individual).
--
-- La columna treatment_plans.primary_therapist_id SE CONSERVA (historial + es el
-- fallback del RPC del ciclo) pero la app deja de usarla como concepto: a partir
-- de ahora se deriva como la primera terapista asignada del plan.
--
-- Esta migración es DATA-ONLY e idempotente:
--   1. Backfill: copia primary_therapist_id a las terapias NO matutinas cuyo
--      therapist_id está vacío (antes dependían de "↳ Usar principal"). Sin esto,
--      al quitar la principal esos niños desaparecerían de "mis niños".
--   2. Re-sincroniza las citas FUTURAS (scheduled) para que cada cita quede con
--      la terapista del servicio según el plan (no la principal heredada). Así
--      las terapistas ven en su agenda las citas que realmente les tocan.
--      (No toca completed: el historial de quién dio la sesión se respeta.)
-- =============================================================================

-- ── 1. Backfill therapist_id por terapia desde primary (solo no matutinas) ────
UPDATE public.treatment_plans tp
SET therapies_json = sub.new_json
FROM (
  SELECT
    tp2.id,
    jsonb_agg(
      CASE
        WHEN ((elem->>'therapist_id') IS NULL OR (elem->>'therapist_id') = '')
             AND COALESCE(elem->>'service','') NOT IN ('blue_kids','learning_kids','aula_educativa')
             AND tp2.primary_therapist_id IS NOT NULL
        THEN jsonb_set(elem, '{therapist_id}', to_jsonb(tp2.primary_therapist_id::text), true)
        ELSE elem
      END
      ORDER BY ord
    ) AS new_json
  FROM public.treatment_plans tp2
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(tp2.therapies_json, '[]'::jsonb))
    WITH ORDINALITY AS e(elem, ord)
  WHERE tp2.active = true
    AND tp2.primary_therapist_id IS NOT NULL
  GROUP BY tp2.id
) sub
WHERE tp.id = sub.id
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(tp.therapies_json, '[]'::jsonb)) ee
    WHERE ((ee->>'therapist_id') IS NULL OR (ee->>'therapist_id') = '')
      AND COALESCE(ee->>'service','') NOT IN ('blue_kids','learning_kids','aula_educativa')
  );

-- ── 2. Re-sincronizar citas FUTURAS con la terapista del servicio del plan ────
WITH plan_per_service AS (
  SELECT
    tp.child_id,
    (t->>'service')            AS service_type,
    (t->>'therapist_id')::uuid AS plan_therapist_id
  FROM public.treatment_plans tp
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(tp.therapies_json, '[]'::jsonb)) AS t
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
  AND  a.therapist_id IS DISTINCT FROM ps.plan_therapist_id;

-- ── Fin de migración 0157 ───────────────────────────────────────────────────
