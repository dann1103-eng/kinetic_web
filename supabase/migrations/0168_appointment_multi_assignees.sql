-- =============================================================================
-- 0168 — Asignación MÚLTIPLE de eventos (reuniones, entrega de avances, etc.)
-- =============================================================================
-- Algunos eventos particulares (entrega de avances, reunión con colegio/padres,
-- entrevistas, "otro") los atiende MÁS DE UNA persona del equipo, y cada una
-- debe verlo en su agenda y en su "mi día". Se agrega una lista de asignados.
--
-- `therapist_id` se conserva como el asignado PRINCIPAL (primero de la lista)
-- para compatibilidad (display, notificaciones). `assignee_ids` incluye a todos
-- los asignados (incluido el principal). Terapias y evaluaciones siguen con un
-- solo `therapist_id` y `assignee_ids` NULL.
--
-- No cambia RLS: is_agency_user() ya deja LEER todas las citas a todo el staff;
-- `assignee_ids` solo alimenta el filtro "mis citas" del cliente y de /mi-dia.
-- =============================================================================

alter table public.appointments
  add column if not exists assignee_ids uuid[];

comment on column public.appointments.assignee_ids is
  'Mig 0168: usuarios asignados a un evento multi-persona (reuniones, entrega de '
  'avances, entrevistas, otro). Incluye al principal (therapist_id). NULL en '
  'terapias/evaluaciones.';

-- Índice GIN para consultas de contención (assignee_ids @> ARRAY[user_id]).
create index if not exists appointments_assignee_ids_idx
  on public.appointments using gin (assignee_ids);

-- ── Fin de migración 0168_appointment_multi_assignees ────────────────────────
