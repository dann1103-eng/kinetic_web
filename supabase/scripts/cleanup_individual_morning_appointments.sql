-- ═══════════════════════════════════════════════════════════════════════════
-- Limpieza: citas individuales de programas matutinos
-- ═══════════════════════════════════════════════════════════════════════════
-- Desde la mig 0149 los servicios matutinos (blue_kids/learning_kids/
-- aula_educativa) NO generan citas individuales: su asistencia se maneja por
-- sesiones de grupo (program_group_sessions). Este script borra las citas
-- individuales matutinas que quedaron de antes (pruebas / ciclos viejos) y que
-- siguen 'scheduled'. Las ya iniciadas/completadas se respetan.
--
-- PASO 1 — Revisar qué se borraría.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT a.id, ch.full_name, a.event_type, a.service_type, a.starts_at, a.status
  FROM public.appointments a
  JOIN public.children ch ON ch.id = a.child_id
 WHERE a.status = 'scheduled'
   AND (
        a.event_type = 'programa_matutino'
     OR a.service_type IN ('blue_kids','learning_kids','aula_educativa')
   )
 ORDER BY a.starts_at;

-- ═══════════════════════════════════════════════════════════════════════════
-- PASO 2 — Borrar. (Corré después de revisar el PASO 1.)
-- ═══════════════════════════════════════════════════════════════════════════

DELETE FROM public.appointments a
 WHERE a.status = 'scheduled'
   AND (
        a.event_type = 'programa_matutino'
     OR a.service_type IN ('blue_kids','learning_kids','aula_educativa')
   );
