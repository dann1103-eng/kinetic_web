-- =============================================================================
-- 0184 — Suspensión avisada (la familia avisa que el niño/a no vendrá un período)
-- =============================================================================
-- CASO REAL que la motivó: una familia avisó que el niño se iba de viaje. Como no
-- existía una figura para eso, se le puso en `4_1_pausa_temporal` — que es una
-- fase CLÍNICA, no un permiso — y aun así quedaron citas marcadas como
-- inasistencia. Resultado: el detalle de pago marcaba un sábado al que el niño
-- nunca iba a venir, esa "falta" quedó pendiente de reposición para siempre en
-- /aprobaciones, y con el cobro automático corría el riesgo de cobrarse.
--
-- Una suspensión avisada NO es:
--   · una pausa clínica  → no cambia `children.current_phase_code`
--   · una inasistencia   → el niño no faltó, avisó con anticipación
--   · una baja           → tiene fecha de regreso conocida
--
-- MODELO: las citas del período NO se borran — se cancelan y se ATAN a la
-- suspensión (`appointments.suspension_id`). Eso permite tres cosas que un
-- estado suelto no daría:
--   1. Excluirlas del cobro sin tocar el significado de `status='cancelled'`
--      (que sigue queriendo decir "cancelación tardía de la familia, se cobra").
--      La regla vive en `billableSessionCounts`: lo que tiene suspensión no cuenta.
--   2. Revertir en bloque si el viaje se cae (`suspension_id` identifica el lote).
--   3. Dejar rastro de por qué esas fechas desaparecieron de la agenda.
-- =============================================================================

create table if not exists public.child_suspensions (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  -- Rango INCLUSIVO en fechas locales (SV). Se guarda como date, no timestamptz:
  -- "del 1 al 15 de agosto" es un rango de días, no de instantes.
  starts_on date not null,
  ends_on date not null,
  reason text not null default 'otro'
    check (reason in ('viaje', 'salud', 'economico', 'otro')),
  notes text,
  status text not null default 'active'
    check (status in ('active', 'reverted')),
  -- Cuántas citas se sacaron de la agenda al registrarla (para mostrarlo sin
  -- recontar, y para saber si hay algo que restaurar al revertir).
  cancelled_appointments_count int not null default 0,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  reverted_by_user_id uuid references public.users(id) on delete set null,
  reverted_at timestamptz,
  constraint child_suspensions_range_valid check (ends_on >= starts_on)
);

create index if not exists child_suspensions_child_idx
  on public.child_suspensions(child_id, starts_on);

-- Solo una suspensión ACTIVA por niño y rango: evita registrar dos veces el
-- mismo viaje. (Parcial: las revertidas no estorban.)
create index if not exists child_suspensions_active_idx
  on public.child_suspensions(child_id, starts_on, ends_on)
  where status = 'active';

-- ── Vínculo cita → suspensión ───────────────────────────────────────────────
-- ON DELETE SET NULL: borrar la suspensión no debe borrar el historial de citas.
alter table public.appointments
  add column if not exists suspension_id uuid
    references public.child_suspensions(id) on delete set null;

create index if not exists appointments_suspension_idx
  on public.appointments(suspension_id)
  where suspension_id is not null;

comment on column public.appointments.suspension_id is
  'Cita sacada de la agenda por una suspensión avisada (mig 0184). NO se cobra: '
  'ver billableSessionCounts. Distinto de una cancelación tardía de la familia, '
  'que sí se cobra y se acredita el mes siguiente por rollover.';

-- ── RLS — mismo set que gestiona agenda y ciclos ────────────────────────────
alter table public.child_suspensions enable row level security;

drop policy if exists "child_suspensions read staff" on public.child_suspensions;
create policy "child_suspensions read staff" on public.child_suspensions
  for select using (
    exists (
      select 1 from public.users
      where id = auth.uid()
      and role not in ('client', 'family')
    )
  );

drop policy if exists "child_suspensions write mgmt" on public.child_suspensions;
create policy "child_suspensions write mgmt" on public.child_suspensions
  for insert with check (
    public.is_directora_or_admin()
    or exists (
      select 1 from public.users
      where id = auth.uid()
      and role in ('coordinadora_familias', 'coordinadora_terapias', 'recepcion')
    )
  );

drop policy if exists "child_suspensions update mgmt" on public.child_suspensions;
create policy "child_suspensions update mgmt" on public.child_suspensions
  for update using (
    public.is_directora_or_admin()
    or exists (
      select 1 from public.users
      where id = auth.uid()
      and role in ('coordinadora_familias', 'coordinadora_terapias', 'recepcion')
    )
  );

drop policy if exists "child_suspensions delete admin" on public.child_suspensions;
create policy "child_suspensions delete admin" on public.child_suspensions
  for delete using (public.is_directora_or_admin());

grant all on public.child_suspensions to anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- ── Fin de migración 0184_child_suspensions ─────────────────────────────────
