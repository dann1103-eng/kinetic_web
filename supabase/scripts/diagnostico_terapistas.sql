-- ═══════════════════════════════════════════════════════════════════════════
-- Diagnóstico: terapistas vs citas — qué niños ve cada terapista
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Buscar el niño (ajustar el ILIKE si el nombre no aparece)
SELECT id, full_name FROM public.children
WHERE full_name ILIKE '%matias%'
   OR full_name ILIKE '%ledezma%';

-- 2) Con el id que devuelva la query anterior, poner aquí:
--    (cambia '00000000-0000-0000-0000-000000000000' por el id real)
--
-- 2a) Ver el plan activo del niño
SELECT
  tp.id                     AS plan_id,
  u_p.full_name             AS terapista_principal,
  (t->>'service')           AS servicio,
  (t->>'therapist_id')      AS therapist_id_plan,
  u_t.full_name             AS terapista_por_servicio,
  (t->>'active')::boolean   AS activa
FROM public.treatment_plans tp
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(tp.therapies_json,'[]'::jsonb)) t
JOIN public.users u_p ON u_p.id = tp.primary_therapist_id
LEFT JOIN public.users u_t ON u_t.id = (t->>'therapist_id')::uuid
WHERE tp.child_id = '00000000-0000-0000-0000-000000000000'   -- ← poner child_id
  AND tp.active = true;

-- 2b) Ver las citas scheduled del niño y con qué therapist_id
SELECT
  a.service_type,
  a.status,
  a.starts_at::date  AS fecha,
  u.full_name        AS terapista_en_cita,
  a.therapist_id
FROM public.appointments a
LEFT JOIN public.users u ON u.id = a.therapist_id
WHERE a.child_id = '00000000-0000-0000-0000-000000000000'   -- ← poner child_id
  AND a.event_type = 'terapia'
ORDER BY a.starts_at DESC
LIMIT 20;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) Vista general: TODOS los casos donde una cita scheduled tiene un
--    therapist_id distinto al de su servicio en el plan activo (ya sea
--    que el plan tenga therapist_id explícito o use la principal).
--    Muestra el problema completo independientemente de nombres.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  c.full_name                           AS nino,
  a.service_type                        AS servicio,
  a.starts_at::date                     AS fecha,
  u_cita.full_name                      AS terapista_en_cita,
  -- Terapista que DEBERÍA tener según el plan:
  COALESCE(
    u_plan.full_name,
    u_principal.full_name
  )                                     AS terapista_correcto,
  a.id                                  AS appointment_id
FROM public.appointments a
JOIN public.children c ON c.id = a.child_id
JOIN public.users u_cita ON u_cita.id = a.therapist_id
JOIN public.treatment_plans tp ON tp.child_id = a.child_id AND tp.active = true
JOIN public.users u_principal ON u_principal.id = tp.primary_therapist_id
LEFT JOIN LATERAL (
  SELECT (t->>'therapist_id')::uuid AS tid
  FROM jsonb_array_elements(COALESCE(tp.therapies_json,'[]'::jsonb)) t
  WHERE t->>'service' = a.service_type
    AND (t->>'active')::boolean = true
  LIMIT 1
) t_match ON true
LEFT JOIN public.users u_plan ON u_plan.id = t_match.tid
WHERE a.event_type = 'terapia'
  AND a.status IN ('scheduled', 'completed')
  -- La cita tiene therapist diferente al correcto para ese servicio:
  AND a.therapist_id <> COALESCE(t_match.tid, tp.primary_therapist_id)
ORDER BY c.full_name, a.starts_at DESC
LIMIT 100;
