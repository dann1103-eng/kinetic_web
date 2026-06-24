-- ═══════════════════════════════════════════════════════════════════════════
-- Diagnóstico completo: qué therapist_id tiene el plan vs las citas
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Buscar el child_id y el plan de Matías
SELECT
  c.id                          AS child_id,
  c.full_name                   AS nino,
  tp.id                         AS plan_id,
  u_p.full_name                 AS terapista_principal,
  tp.therapies_json             -- VER EL JSON CRUDO
FROM public.children c
JOIN public.treatment_plans tp ON tp.child_id = c.id AND tp.active = true
JOIN public.users u_p ON u_p.id = tp.primary_therapist_id
WHERE c.full_name ILIKE '%matias%'
   OR c.full_name ILIKE '%ledezma%';

-- 2) Todas las citas de Matías (reemplaza el child_id con el del resultado de arriba)
SELECT
  a.service_type,
  a.status,
  a.starts_at::date  AS fecha,
  u.full_name        AS terapista_en_cita,
  a.therapist_id
FROM public.appointments a
JOIN public.users u ON u.id = a.therapist_id
WHERE a.child_id = 'PONER_CHILD_ID_AQUI'
  AND a.event_type = 'terapia'
ORDER BY a.service_type, a.starts_at DESC
LIMIT 30;

-- 3) Buscar el user_id de Paola
SELECT id, full_name, role FROM public.users
WHERE full_name ILIKE '%paola%' OR full_name ILIKE '%vidal%';
