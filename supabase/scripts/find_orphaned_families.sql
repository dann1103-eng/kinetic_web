-- Diagnóstico de solo lectura: familias sin ningún niño (huérfanas por el bug
-- de duplicación en advanceWaitlistPhase, fijo en esta misma migración/lote).
-- NO borra nada — solo lista, para que el usuario decida caso por caso.
SELECT f.id, f.primary_contact_name, f.created_at
FROM families f
WHERE NOT EXISTS (SELECT 1 FROM children c WHERE c.family_id = f.id)
ORDER BY f.created_at DESC;
