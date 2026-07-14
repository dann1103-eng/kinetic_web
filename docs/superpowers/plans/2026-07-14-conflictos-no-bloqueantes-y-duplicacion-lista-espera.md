# Conflictos de horario no bloqueantes + fix duplicación niño/familia — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Los conflictos de horario dejan de bloquear la generación/edición de ciclos (solo avisan, distinguiendo si chocan con la propia niña o con otro paciente), y avanzar de fase en lista de espera deja de duplicar niño+familia cuando la entrada ya fue convertida antes.

**Architecture:** Dos cambios de backend independientes. (1) Relajar el guard SQL compartido por 3 RPCs de ciclo (`CREATE OR REPLACE`, misma firma) + quitar el bloqueo equivalente en los 2 modales de React que consumen esas RPCs, agregando una distinción self/otro-paciente en el mensaje vía una función pura nueva. (2) Agregar un guard de idempotencia en la Server Action `advanceWaitlistPhase`, replicando el patrón que ya existe en su función hermana. Un script SQL de solo lectura cierra el lote, para diagnosticar cuántas familias huérfanas dejó el bug hasta ahora (sin borrar nada).

**Tech Stack:** Next.js Server Actions, Supabase Postgres (plpgsql RPCs), React ('use client' modals), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-14-conflictos-no-bloqueantes-y-duplicacion-lista-espera-design.md`

---

## Antes de empezar

Verificar el número de migración libre (puede haber cambiado desde que se escribió este plan):

```bash
ls supabase/migrations | sort | tail -3
```

Este plan asume que el siguiente número libre es **0181**. Si ya existe, usar el siguiente disponible y ajustar el nombre de archivo en la Tarea 4.

---

### Tarea 1: Función pura para describir un conflicto (self vs. otro paciente)

**Files:**
- Modify: `src/lib/domain/appointment.ts`
- Test: `src/lib/domain/appointment.test.ts` (nuevo)

- [ ] **Paso 1: Escribir el test que falla**

Crear `src/lib/domain/appointment.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { describeMonthlyConflict } from './appointment'

describe('describeMonthlyConflict', () => {
  it('distingue un conflicto con otra terapia de la MISMA niña/niño', () => {
    const msg = describeMonthlyConflict(
      { conflict_child_id: 'child-1' },
      'child-1',
      'lun. 15 jul, 9:30 a.m.',
    )
    expect(msg).toContain('misma niña/niño')
    expect(msg).not.toContain('otro paciente')
    expect(msg).toContain('lun. 15 jul, 9:30 a.m.')
  })

  it('distingue un conflicto con la cita de OTRO paciente', () => {
    const msg = describeMonthlyConflict(
      { conflict_child_id: 'child-2' },
      'child-1',
      'lun. 15 jul, 9:30 a.m.',
    )
    expect(msg).toContain('otro paciente')
    expect(msg).not.toContain('misma niña/niño')
  })
})
```

- [ ] **Paso 2: Correr el test y confirmar que falla**

Run: `npm test -- appointment.test.ts`
Expected: FAIL — `describeMonthlyConflict` no existe todavía (`SyntaxError` o `TypeError` al importar).

- [ ] **Paso 3: Implementación mínima**

Agregar al final de `src/lib/domain/appointment.ts` (después de `isJoinable`, línea 130):

```ts
/**
 * Describe un conflicto de horario devuelto por `compute_monthly_appointment_candidates`,
 * distinguiendo si choca con OTRA terapia del mismo niño (`conflict_child_id === childId`)
 * o con la cita de otro paciente. No incluye nombres — el RPC no los devuelve.
 */
export function describeMonthlyConflict(
  conflict: { conflict_child_id: string },
  childId: string,
  formattedConflictDate: string,
): string {
  const origin =
    conflict.conflict_child_id === childId
      ? 'Choca con otra terapia de la misma niña/niño'
      : 'Choca con la cita de otro paciente con este terapeuta'
  return `⚠ ${origin} el ${formattedConflictDate}. Podés moverla a otro día/hora o quitarla si querés evitarlo.`
}
```

- [ ] **Paso 4: Correr el test y confirmar que pasa**

Run: `npm test -- appointment.test.ts`
Expected: PASS (2 tests)

- [ ] **Paso 5: Commit**

```bash
git add src/lib/domain/appointment.ts src/lib/domain/appointment.test.ts
git commit -m "feat: describeMonthlyConflict — distingue conflicto propio vs. otro paciente"
```

---

### Tarea 2: `NewMonthlyCycleModal.tsx` — conflictos ya no bloquean

**Files:**
- Modify: `src/components/families/NewMonthlyCycleModal.tsx`

- [ ] **Paso 1: Importar el helper nuevo**

En el bloque de imports (cerca de la línea 23, junto a `applyDiscount`):

```ts
import { describeMonthlyConflict } from '@/lib/domain/appointment'
```

- [ ] **Paso 2: Usar el helper en `conflictLabelBySig` (líneas 236-245)**

Reemplazar:
```ts
  const conflictLabelBySig = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of dryRun?.conflicts ?? []) {
      m.set(
        candidateSignature(c.candidate),
        `⚠ Choca con otra cita del mismo terapista el ${formatDateTime(c.conflict_starts_at)}. Movela a otro día/hora o quitala.`,
      )
    }
    return m
  }, [dryRun])
```
por:
```ts
  const conflictLabelBySig = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of dryRun?.conflicts ?? []) {
      m.set(
        candidateSignature(c.candidate),
        describeMonthlyConflict(c, childId, formatDateTime(c.conflict_starts_at)),
      )
    }
    return m
  }, [dryRun, childId])
```

- [ ] **Paso 3: Quitar el bloqueo de `handleConfirm` (líneas 424-427)**

Eliminar por completo este bloque (el resto de `handleConfirm` queda igual):
```ts
    if (liveConflicts.length > 0) {
      setConfirmError('Todavía hay citas en conflicto (en rojo). Movelas o quitalas antes de generar.')
      return
    }
```

- [ ] **Paso 4: Quitar el bloqueo de `canConfirm` (líneas 473-477)**

Reemplazar:
```ts
  const canConfirm =
    !!dryRun &&
    !periodAlreadyUsed &&
    liveConflicts.length === 0 &&
    !isConfirming
```
por:
```ts
  const canConfirm =
    !!dryRun &&
    !periodAlreadyUsed &&
    !isConfirming
```

- [ ] **Paso 5: Reescribir el banner de conflictos como advertencia no bloqueante (líneas 775-786)**

Reemplazar:
```tsx
                {liveConflicts.length > 0 && (
                  <div className="rounded-lg border border-red-300 bg-red-50/70 px-3 py-2 text-xs text-red-900">
                    <p className="font-semibold">
                      {liveConflicts.length} cita(s) en conflicto — en rojo en el calendario.
                    </p>
                    <p className="mt-0.5">
                      Cada una choca con otra cita del mismo terapista (pasá el mouse por encima
                      para ver con cuál). Movela a otro día arrastrándola, cambiale la hora con el
                      reloj, o quitala con ✕. Cuando no queden citas rojas vas a poder generar el ciclo.
                    </p>
                  </div>
                )}
```
por:
```tsx
                {liveConflicts.length > 0 && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
                    <p className="font-semibold">
                      {liveConflicts.length} cita(s) con conflicto de horario — en rojo en el calendario.
                    </p>
                    <p className="mt-0.5">
                      Pasá el mouse por encima de una celda roja para ver el detalle. Se pueden
                      generar igual — revisalas cuando puedas, o movelas/quitalas ahora si preferís
                      resolverlas antes.
                    </p>
                  </div>
                )}
```

- [ ] **Paso 6: Verificar tipos y lint**

Run: `npm run lint`
Expected: 0 errores nuevos.

- [ ] **Paso 7: Commit**

```bash
git add src/components/families/NewMonthlyCycleModal.tsx
git commit -m "fix: generar ciclo nuevo ya no bloquea por conflictos de horario"
```

---

### Tarea 3: `EditMonthlyCycleModal.tsx` — mismo fix para editar/regenerar

**Files:**
- Modify: `src/components/families/EditMonthlyCycleModal.tsx`

- [ ] **Paso 1: Importar el helper nuevo**

Junto a `applyDiscount` (cerca de línea 20):

```ts
import { describeMonthlyConflict } from '@/lib/domain/appointment'
```

- [ ] **Paso 2: Usar el helper en `conflictLabelBySig` (líneas 177-186)**

Reemplazar:
```ts
  const conflictLabelBySig = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of dryRun?.conflicts ?? []) {
      m.set(
        candidateSignature(c.candidate),
        `⚠ Choca con otra cita del mismo terapista el ${formatDateTime(c.conflict_starts_at)}. Movela a otro día/hora o quitala.`,
      )
    }
    return m
  }, [dryRun])
```
por:
```ts
  const conflictLabelBySig = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of dryRun?.conflicts ?? []) {
      m.set(
        candidateSignature(c.candidate),
        describeMonthlyConflict(c, childId, formatDateTime(c.conflict_starts_at)),
      )
    }
    return m
  }, [dryRun, childId])
```

- [ ] **Paso 3: Quitar el bloqueo de `handleSave` (líneas 324-327)**

Eliminar por completo:
```ts
    if (regenConflicts) {
      setError('Todavía hay citas en conflicto (en rojo). Movelas o quitalas antes de regenerar.')
      return
    }
```

`regenConflicts` (línea 308) queda declarado pero ya sin usarse en `handleSave` — se sigue usando en el `disabled` del botón (Paso 4), así que la variable no queda huérfana.

- [ ] **Paso 4: Quitar el bloqueo del botón de submit (línea 719)**

Reemplazar:
```tsx
            disabled={isSaving || (regenerate && (isLoadingDry || regenConflicts))}
```
por:
```tsx
            disabled={isSaving || (regenerate && isLoadingDry)}
```

Con este cambio, `regenConflicts` (línea 308) queda sin ningún consumidor — eliminar su declaración también:
```ts
  const regenConflicts = regenerate && !!dryRun && liveConflicts.length > 0
```

- [ ] **Paso 5: Reescribir el banner de conflictos (líneas 629-640)**

Reemplazar:
```tsx
                    {liveConflicts.length > 0 && (
                      <div className="rounded-lg border border-red-300 bg-red-50/70 px-3 py-2 text-xs text-red-900">
                        <p className="font-semibold">
                          {liveConflicts.length} cita(s) en conflicto — en rojo en el calendario.
                        </p>
                        <p className="mt-0.5">
                          Cada una choca con otra cita del mismo terapista (pasá el mouse por
                          encima para ver con cuál). Movela a otro día, cambiale la hora con el
                          reloj, o quitala con ✕. Cuando no queden rojas vas a poder regenerar.
                        </p>
                      </div>
                    )}
```
por:
```tsx
                    {liveConflicts.length > 0 && (
                      <div className="rounded-lg border border-amber-300 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
                        <p className="font-semibold">
                          {liveConflicts.length} cita(s) con conflicto de horario — en rojo en el calendario.
                        </p>
                        <p className="mt-0.5">
                          Pasá el mouse por encima de una celda roja para ver el detalle. Se puede
                          regenerar igual — revisalas cuando puedas, o movelas/quitalas ahora si
                          preferís resolverlas antes.
                        </p>
                      </div>
                    )}
```

- [ ] **Paso 6: Verificar tipos y lint**

Run: `npm run lint`
Expected: 0 errores nuevos (confirmar que no queda ninguna referencia suelta a `regenConflicts`).

- [ ] **Paso 7: Commit**

```bash
git add src/components/families/EditMonthlyCycleModal.tsx
git commit -m "fix: editar/regenerar ciclo ya no bloquea por conflictos de horario"
```

---

### Tarea 4: Migración SQL — relajar el guard de conflictos en las 3 RPCs

**Files:**
- Create: `supabase/migrations/0181_conflicts_non_blocking.sql` (ajustar número si ya no está libre)

- [ ] **Paso 1: Escribir la migración**

`CREATE OR REPLACE` verbatim de las 3 funciones tal como están en `supabase/migrations/0180_fix_morning_only_plan_blocks_cycle.sql`, quitando únicamente los bloques `RAISE EXCEPTION 'has_conflicts...'`. `compute_monthly_appointment_candidates` NO se toca (nunca tuvo el guard — solo calcula y devuelve `conflicts[]`).

```sql
-- =============================================================================
-- 0181 — Los conflictos de horario dejan de bloquear la generación/edición de ciclo
-- =============================================================================
-- BUG REPORTADO: un niño con dos terapias propias asignadas al mismo terapeuta
-- en el mismo bloque horario se marca a sí mismo como "en conflicto" (el check
-- de solape no excluye al propio niño) y el guard `has_conflicts` aborta la
-- generación completa de su ciclo. El mismo guard, al vivir también en
-- `regenerate_cycle_appointments`, puede abortar en silencio la sincronización
-- de la agenda cuando se edita un plan de tratamiento.
--
-- FIX: los conflictos se siguen calculando y devolviendo (`conflicts[]` /
-- `summary.conflict_count`) para que la UI los muestre como advertencia no
-- bloqueante — pero ya no abortan la transacción. Se quita el bloque
-- `RAISE EXCEPTION 'has_conflicts...'` de las 3 funciones que lo tenían.
-- `compute_monthly_appointment_candidates` no se toca (nunca bloqueó, solo
-- calcula/devuelve conflictos).
--
-- Las 3 funciones se redefinen VERBATIM (mismas firmas, sin DROP FUNCTION
-- necesario) respecto a 0180, salvo la eliminación del guard.
-- =============================================================================

-- ── 1. confirm_monthly_payment_and_generate (verbatim de 0180, sin el guard) ──
CREATE OR REPLACE FUNCTION public.confirm_monthly_payment_and_generate(
  p_child_id          uuid,
  p_period_month      date,
  p_payment_amount    numeric,
  p_payment_method    text DEFAULT 'cash',
  p_payment_reference text DEFAULT null,
  p_paid_at           timestamptz DEFAULT now(),
  p_notes             text DEFAULT null,
  p_appointments_override jsonb DEFAULT null,
  p_due_date          date DEFAULT null,
  p_rollover_sessions jsonb DEFAULT null,
  p_rollover_mode     text DEFAULT 'none',
  p_rollover_discount numeric DEFAULT 0,
  p_program_group_id  uuid DEFAULT null,
  p_attendance_days   text[] DEFAULT null
) RETURNS public.monthly_session_cycles
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_plan        public.treatment_plans;
  v_period      date := date_trunc('month', p_period_month)::date;
  v_compute     jsonb;
  v_summary     jsonb;
  v_candidate   jsonb;
  v_appointments_to_create jsonb;
  v_invoice_id  uuid;
  v_invoice_no  text;
  v_subtotal    numeric(12,2) := 0;
  v_therapy     jsonb;
  v_line_total  numeric(12,2);
  v_appt_count  int := 0;
  v_cycle       public.monthly_session_cycles;
  v_emitter     jsonb;
  v_client_snap jsonb;
  v_period_start_iso timestamptz;
  v_period_end_iso   timestamptz;
  v_therapist_map jsonb := '{}';
  v_flat_map      jsonb := '{}';
  v_cand_therapist uuid;
  v_due         date;
  v_rollover_for_compute jsonb := null;
BEGIN
  IF NOT public.kn_can_manage_cycles() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_plan
    FROM public.treatment_plans
   WHERE child_id = p_child_id AND active
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'no_active_treatment_plan'; END IF;

  IF v_plan.primary_therapist_id IS NULL AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb)) t
     WHERE (t->>'active')::boolean
       AND NOT public._kn_is_monthly_flat(t)
       AND coalesce(t->>'therapist_id','') = ''
  ) THEN
    RAISE EXCEPTION 'plan_has_no_primary_therapist';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.monthly_session_cycles
    WHERE child_id = p_child_id
      AND period_month = v_period
      AND status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'cycle_already_exists_for_period';
  END IF;

  v_due := coalesce(p_due_date, (v_period + 4));

  IF p_rollover_mode = 'accumulate' THEN
    v_rollover_for_compute := p_rollover_sessions;
  END IF;

  FOR v_therapy IN SELECT * FROM jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb))
  LOOP
    IF (v_therapy->>'active')::boolean AND coalesce(v_therapy->>'therapist_id','') <> '' THEN
      v_therapist_map := v_therapist_map || jsonb_build_object(
        v_therapy->>'service', v_therapy->>'therapist_id'
      );
    END IF;
    IF (v_therapy->>'active')::boolean AND public._kn_is_monthly_flat(v_therapy) THEN
      v_flat_map := v_flat_map || jsonb_build_object(v_therapy->>'service', true);
    END IF;
  END LOOP;

  IF p_appointments_override IS NOT NULL AND jsonb_typeof(p_appointments_override) = 'array' THEN
    v_appointments_to_create := p_appointments_override;

    v_period_start_iso := (v_period::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/El_Salvador';
    v_period_end_iso   := ((v_period + interval '1 month')::date::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/El_Salvador';

    FOR v_candidate IN SELECT * FROM jsonb_array_elements(v_appointments_to_create)
    LOOP
      IF (v_candidate->>'starts_at')::timestamptz < v_period_start_iso
         OR (v_candidate->>'starts_at')::timestamptz >= v_period_end_iso THEN
        RAISE EXCEPTION 'override_date_out_of_period';
      END IF;
    END LOOP;
  ELSE
    v_compute := public.compute_monthly_appointment_candidates(p_child_id, v_period, v_rollover_for_compute);
    v_summary := v_compute->'summary';
    v_appointments_to_create := v_compute->'candidates';
  END IF;

  SELECT jsonb_build_object(
    'child_id', c.id,
    'child_full_name', c.full_name,
    'child_code', c.code,
    'family_id', c.family_id
  )
    INTO v_client_snap
    FROM public.children c
   WHERE c.id = p_child_id;

  v_emitter := jsonb_build_object(
    'name', 'BEGINNINGS, S.A. de C.V.',
    'note', 'placeholder hasta que se carguen datos fiscales reales'
  );

  v_invoice_no := public._kn_next_invoice_number(v_period);
  INSERT INTO public.invoices (
    invoice_number, client_id, child_id, issue_date, due_date,
    currency, subtotal, discount_amount, tax_rate, tax_amount, total, total_a_pagar,
    status, payment_date, payment_method, payment_reference, notes,
    client_snapshot_json, emitter_snapshot_json, created_by
  ) VALUES (
    v_invoice_no, null, p_child_id, current_date, v_due,
    'USD', 0, 0, 0, 0, 0, 0,
    'issued', null, null, null,
    coalesce(p_notes, 'Ciclo mensual ' || to_char(v_period,'YYYY-MM'))
      || '. Fecha límite de pago: ' || to_char(v_due,'DD/MM/YYYY')
      || ' (pasada esa fecha se cobra 5% de recargo por cada 5 días de atraso).',
    v_client_snap, v_emitter, auth.uid()
  )
  RETURNING id INTO v_invoice_id;

  FOR v_therapy IN SELECT * FROM jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb))
  LOOP
    IF (v_therapy->>'active')::boolean THEN
      IF public._kn_is_monthly_flat(v_therapy) THEN
        v_line_total := round((v_therapy->>'unit_cost_usd')::numeric, 2);
        v_subtotal := v_subtotal + v_line_total;
        INSERT INTO public.invoice_items (invoice_id, description, quantity, unit_price, line_total, sort_order)
        VALUES (v_invoice_id, 'mensualidad ' || (v_therapy->>'service'), 1, (v_therapy->>'unit_cost_usd')::numeric, v_line_total, 0);
      ELSE
        v_line_total := round((v_therapy->>'sessions_per_month')::numeric * (v_therapy->>'unit_cost_usd')::numeric, 2);
        v_subtotal := v_subtotal + v_line_total;
        INSERT INTO public.invoice_items (invoice_id, description, quantity, unit_price, line_total, sort_order)
        VALUES (v_invoice_id, v_therapy->>'service', (v_therapy->>'sessions_per_month')::numeric, (v_therapy->>'unit_cost_usd')::numeric, v_line_total, 0);
      END IF;
    END IF;
  END LOOP;

  UPDATE public.invoices
     SET subtotal = v_subtotal, total = v_subtotal, total_a_pagar = v_subtotal
   WHERE id = v_invoice_id;

  FOR v_candidate IN SELECT * FROM jsonb_array_elements(v_appointments_to_create)
  LOOP
    IF coalesce((v_flat_map->>(v_candidate->>'service'))::boolean, false) THEN
      CONTINUE;
    END IF;
    v_cand_therapist := coalesce(
      (v_candidate->>'therapist_id')::uuid,
      (v_therapist_map->>(v_candidate->>'service'))::uuid,
      v_plan.primary_therapist_id
    );
    INSERT INTO public.appointments (
      child_id, therapist_id, event_type, service_type, modality,
      starts_at, ends_at, status, created_by_user_id, notes
    ) VALUES (
      p_child_id, v_cand_therapist, 'terapia', v_candidate->>'service', 'presencial',
      (v_candidate->>'starts_at')::timestamptz, (v_candidate->>'ends_at')::timestamptz,
      'scheduled', auth.uid(), 'Auto-generado del ciclo ' || to_char(v_period,'YYYY-MM')
    );
    v_appt_count := v_appt_count + 1;
  END LOOP;

  IF p_program_group_id IS NOT NULL THEN
    UPDATE public.program_group_members
       SET active = false, updated_at = now()
     WHERE child_id = p_child_id AND active;

    INSERT INTO public.program_group_members (group_id, child_id, attendance_days, active)
    VALUES (p_program_group_id, p_child_id, coalesce(p_attendance_days, '{}'), true)
    ON CONFLICT (child_id, group_id)
    DO UPDATE SET
      active          = true,
      attendance_days = coalesce(p_attendance_days, program_group_members.attendance_days),
      updated_at      = now();
  END IF;

  INSERT INTO public.monthly_session_cycles (
    child_id, period_month, treatment_plan_snapshot,
    paid_at, paid_by_user_id, payment_method, payment_reference, payment_amount_usd,
    invoice_id, appointments_generated_at, appointments_generated_count,
    status, payment_status, due_date, notes,
    rollover_mode, rollover_sessions_json, rollover_discount_usd,
    program_group_id, attendance_days
  ) VALUES (
    p_child_id, v_period, to_jsonb(v_plan),
    null, null, null, null, v_subtotal,
    v_invoice_id, now(), v_appt_count,
    'generated', 'pending', v_due, p_notes,
    coalesce(p_rollover_mode, 'none'),
    p_rollover_sessions,
    coalesce(p_rollover_discount, 0),
    p_program_group_id, p_attendance_days
  )
  RETURNING * INTO v_cycle;

  RETURN v_cycle;
END;
$$;

-- ── 2. generate_cycle_agenda (verbatim de 0180, sin el guard) ────────────────
CREATE OR REPLACE FUNCTION public.generate_cycle_agenda(
  p_child_id          uuid,
  p_period_month      date,
  p_notes             text DEFAULT null,
  p_appointments_override jsonb DEFAULT null,
  p_due_date          date DEFAULT null,
  p_rollover_sessions jsonb DEFAULT null,
  p_rollover_mode     text DEFAULT 'none',
  p_rollover_discount numeric DEFAULT 0,
  p_program_group_id  uuid DEFAULT null,
  p_attendance_days   text[] DEFAULT null
) RETURNS public.monthly_session_cycles
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_plan        public.treatment_plans;
  v_period      date := date_trunc('month', p_period_month)::date;
  v_compute     jsonb;
  v_summary     jsonb;
  v_candidate   jsonb;
  v_appointments_to_create jsonb;
  v_subtotal    numeric(12,2) := 0;
  v_therapy     jsonb;
  v_appt_count  int := 0;
  v_cycle       public.monthly_session_cycles;
  v_period_start_iso timestamptz;
  v_period_end_iso   timestamptz;
  v_therapist_map jsonb := '{}';
  v_flat_map      jsonb := '{}';
  v_cand_therapist uuid;
  v_due         date;
  v_rollover_for_compute jsonb := null;
BEGIN
  IF NOT public.kn_can_manage_cycles() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_plan
    FROM public.treatment_plans
   WHERE child_id = p_child_id AND active
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'no_active_treatment_plan'; END IF;

  IF v_plan.primary_therapist_id IS NULL AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb)) t
     WHERE (t->>'active')::boolean
       AND NOT public._kn_is_monthly_flat(t)
       AND coalesce(t->>'therapist_id','') = ''
  ) THEN
    RAISE EXCEPTION 'plan_has_no_primary_therapist';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.monthly_session_cycles
    WHERE child_id = p_child_id
      AND period_month = v_period
      AND status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'cycle_already_exists_for_period';
  END IF;

  v_due := coalesce(p_due_date, (v_period + 4));

  IF p_rollover_mode = 'accumulate' THEN
    v_rollover_for_compute := p_rollover_sessions;
  END IF;

  FOR v_therapy IN SELECT * FROM jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb))
  LOOP
    IF (v_therapy->>'active')::boolean AND coalesce(v_therapy->>'therapist_id','') <> '' THEN
      v_therapist_map := v_therapist_map || jsonb_build_object(
        v_therapy->>'service', v_therapy->>'therapist_id'
      );
    END IF;
    IF (v_therapy->>'active')::boolean AND public._kn_is_monthly_flat(v_therapy) THEN
      v_flat_map := v_flat_map || jsonb_build_object(v_therapy->>'service', true);
    END IF;
  END LOOP;

  IF p_appointments_override IS NOT NULL AND jsonb_typeof(p_appointments_override) = 'array' THEN
    v_appointments_to_create := p_appointments_override;

    v_period_start_iso := (v_period::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/El_Salvador';
    v_period_end_iso   := ((v_period + interval '1 month')::date::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/El_Salvador';

    FOR v_candidate IN SELECT * FROM jsonb_array_elements(v_appointments_to_create)
    LOOP
      IF (v_candidate->>'starts_at')::timestamptz < v_period_start_iso
         OR (v_candidate->>'starts_at')::timestamptz >= v_period_end_iso THEN
        RAISE EXCEPTION 'override_date_out_of_period';
      END IF;
    END LOOP;
  ELSE
    v_compute := public.compute_monthly_appointment_candidates(p_child_id, v_period, v_rollover_for_compute);
    v_summary := v_compute->'summary';
    v_appointments_to_create := v_compute->'candidates';
  END IF;

  FOR v_therapy IN SELECT * FROM jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb))
  LOOP
    IF (v_therapy->>'active')::boolean THEN
      IF public._kn_is_monthly_flat(v_therapy) THEN
        v_subtotal := v_subtotal + round((v_therapy->>'unit_cost_usd')::numeric, 2);
      ELSE
        v_subtotal := v_subtotal + round((v_therapy->>'sessions_per_month')::numeric * (v_therapy->>'unit_cost_usd')::numeric, 2);
      END IF;
    END IF;
  END LOOP;

  FOR v_candidate IN SELECT * FROM jsonb_array_elements(v_appointments_to_create)
  LOOP
    IF coalesce((v_flat_map->>(v_candidate->>'service'))::boolean, false) THEN
      CONTINUE;
    END IF;
    v_cand_therapist := coalesce(
      (v_candidate->>'therapist_id')::uuid,
      (v_therapist_map->>(v_candidate->>'service'))::uuid,
      v_plan.primary_therapist_id
    );
    INSERT INTO public.appointments (
      child_id, therapist_id, event_type, service_type, modality,
      starts_at, ends_at, status, created_by_user_id, notes
    ) VALUES (
      p_child_id, v_cand_therapist, 'terapia', v_candidate->>'service', 'presencial',
      (v_candidate->>'starts_at')::timestamptz, (v_candidate->>'ends_at')::timestamptz,
      'scheduled', auth.uid(), 'Auto-generado del ciclo ' || to_char(v_period,'YYYY-MM')
    );
    v_appt_count := v_appt_count + 1;
  END LOOP;

  IF p_program_group_id IS NOT NULL THEN
    UPDATE public.program_group_members
       SET active = false, updated_at = now()
     WHERE child_id = p_child_id AND active;

    INSERT INTO public.program_group_members (group_id, child_id, attendance_days, active)
    VALUES (p_program_group_id, p_child_id, coalesce(p_attendance_days, '{}'), true)
    ON CONFLICT (child_id, group_id)
    DO UPDATE SET
      active          = true,
      attendance_days = coalesce(p_attendance_days, program_group_members.attendance_days),
      updated_at      = now();
  END IF;

  INSERT INTO public.monthly_session_cycles (
    child_id, period_month, treatment_plan_snapshot,
    paid_at, paid_by_user_id, payment_method, payment_reference, payment_amount_usd,
    invoice_id, appointments_generated_at, appointments_generated_count,
    status, payment_status, due_date, notes,
    rollover_mode, rollover_sessions_json, rollover_discount_usd,
    program_group_id, attendance_days
  ) VALUES (
    p_child_id, v_period, to_jsonb(v_plan),
    null, null, null, null, v_subtotal,
    null, now(), v_appt_count,
    'generated', 'pending', v_due, p_notes,
    coalesce(p_rollover_mode, 'none'),
    p_rollover_sessions,
    coalesce(p_rollover_discount, 0),
    p_program_group_id, p_attendance_days
  )
  RETURNING * INTO v_cycle;

  RETURN v_cycle;
END;
$$;

-- ── 3. regenerate_cycle_appointments (verbatim de 0180, sin el guard) ───────
create or replace function public.regenerate_cycle_appointments(
  p_cycle_id              uuid,
  p_appointments_override jsonb default null,
  p_only_future           boolean default false
) returns public.monthly_session_cycles
language plpgsql security definer as $$
declare
  v_cycle        public.monthly_session_cycles;
  v_plan         public.treatment_plans;
  v_period       date;
  v_first_day    date;
  v_last_day     date;
  v_compute      jsonb;
  v_summary      jsonb;
  v_candidate    jsonb;
  v_appointments_to_create jsonb;
  v_therapist_map jsonb := '{}';
  v_therapy      jsonb;
  v_cand_therapist uuid;
  v_appt_count   int := 0;
  v_period_start_iso timestamptz;
  v_period_end_iso   timestamptz;
begin
  if not public.kn_can_manage_cycles() then
    raise exception 'not_authorized';
  end if;

  select * into v_cycle
    from public.monthly_session_cycles
   where id = p_cycle_id
   for update;

  if not found then raise exception 'cycle_not_found'; end if;
  if v_cycle.status <> 'generated' then
    raise exception 'cycle_not_editable';
  end if;

  v_period    := v_cycle.period_month;
  v_first_day := date_trunc('month', v_period)::date;
  v_last_day  := (v_first_day + interval '1 month' - interval '1 day')::date;

  select * into v_plan
    from public.treatment_plans
   where child_id = v_cycle.child_id
     and active
   for update;

  if not found then raise exception 'no_active_treatment_plan'; end if;

  if v_plan.primary_therapist_id is null and exists (
    select 1 from jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb)) t
     where (t->>'active')::boolean
       and not public._kn_is_monthly_flat(t)
       and coalesce(t->>'therapist_id','') = ''
  ) then
    raise exception 'plan_has_no_primary_therapist';
  end if;

  for v_therapy in select * from jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb))
  loop
    if (v_therapy->>'active')::boolean and coalesce(v_therapy->>'therapist_id','') <> '' then
      v_therapist_map := v_therapist_map || jsonb_build_object(
        v_therapy->>'service', v_therapy->>'therapist_id'
      );
    end if;
  end loop;

  update public.appointments
     set status = 'rescheduled',
         notes = coalesce(notes,'') || E'\nCiclo regenerado'
   where child_id = v_cycle.child_id
     and starts_at >= v_first_day
     and starts_at <  (v_last_day + interval '1 day')
     and status = 'scheduled'
     and notes like '%Auto-generado del ciclo%'
     and (not p_only_future or starts_at >= now());

  if p_appointments_override is not null and jsonb_typeof(p_appointments_override) = 'array' then
    v_appointments_to_create := p_appointments_override;

    v_period_start_iso := (v_first_day::text || ' 00:00:00')::timestamp at time zone 'America/El_Salvador';
    v_period_end_iso   := ((v_first_day + interval '1 month')::date::text || ' 00:00:00')::timestamp at time zone 'America/El_Salvador';

    for v_candidate in select * from jsonb_array_elements(v_appointments_to_create)
    loop
      if (v_candidate->>'starts_at')::timestamptz < v_period_start_iso
         or (v_candidate->>'starts_at')::timestamptz >= v_period_end_iso then
        raise exception 'override_date_out_of_period';
      end if;
    end loop;
  else
    v_compute := public.compute_monthly_appointment_candidates(v_cycle.child_id, v_period, null);
    v_summary := v_compute->'summary';
    v_appointments_to_create := v_compute->'candidates';
  end if;

  for v_candidate in select * from jsonb_array_elements(v_appointments_to_create)
  loop
    if p_only_future and (v_candidate->>'starts_at')::timestamptz < now() then
      continue;
    end if;
    v_cand_therapist := coalesce(
      (v_candidate->>'therapist_id')::uuid,
      (v_therapist_map->>(v_candidate->>'service'))::uuid,
      v_plan.primary_therapist_id
    );
    insert into public.appointments (
      child_id, therapist_id, event_type, service_type, modality,
      starts_at, ends_at, status, created_by_user_id, notes
    ) values (
      v_cycle.child_id, v_cand_therapist, 'terapia', v_candidate->>'service', 'presencial',
      (v_candidate->>'starts_at')::timestamptz, (v_candidate->>'ends_at')::timestamptz,
      'scheduled', auth.uid(), 'Auto-generado del ciclo ' || to_char(v_period,'YYYY-MM')
    );
    v_appt_count := v_appt_count + 1;
  end loop;

  update public.monthly_session_cycles
     set appointments_generated_count = v_appt_count,
         appointments_generated_at = now()
   where id = p_cycle_id
   returning * into v_cycle;

  return v_cycle;
end;
$$;

notify pgrst, 'reload schema';

-- ── Fin de migración 0181 ────────────────────────────────────────────────────
```

Nota: en `regenerate_cycle_appointments`, al quitar el chequeo de conflicto del primer loop (override), ya no hace falta calcular `v_cand_therapist` ahí — se quitó junto con el guard (se sigue calculando en el segundo loop, el que realmente inserta). Igual en las otras dos funciones: se quitó el `SELECT count(*)... has_conflicts` de dentro del loop de override, dejando solo el chequeo de fecha-fuera-de-mes.

- [ ] **Paso 2: Aplicar la migración en el proyecto real de Supabase**

Usar el mismo patrón ya establecido en sesiones anteriores (Management API + token del CLI leído de Windows Credential Manager, target `Supabase CLI:supabase`, `CredRead`/`CredFree` de `advapi32.dll` vía PowerShell — ver notas de sesión jul-2026 en `CLAUDE.md`). **Confirmar con el usuario antes de aplicar** — es un cambio a producción.

- [ ] **Paso 3: Verificar contra datos reales**

Ejecutar (vía Management API, `POST /database/query`) un `select` sobre el plan de tratamiento real que reportó el bug (dos terapias propias, mismo terapeuta, mismo bloque horario) y confirmar:
1. `compute_monthly_appointment_candidates` sigue devolviendo el conflicto en `conflicts[]` (no cambió).
2. Generar el ciclo para ese niño (vía la app, después de la Tarea 2/3) ya NO lanza `has_conflicts` y crea las citas.

- [ ] **Paso 4: Commit**

```bash
git add supabase/migrations/0181_conflicts_non_blocking.sql
git commit -m "fix: conflictos de horario ya no bloquean generar/editar ciclo (migración 0181)"
```

---

### Tarea 5: Quitar el mapeo de error `has_conflicts` (ya inalcanzable)

**Files:**
- Modify: `src/app/actions/monthly-cycles.ts:514-520,703-709,1017-1023`

Tras la Tarea 4, el RPC nunca vuelve a lanzar `has_conflicts` — estos 3 bloques quedan inalcanzables (dead code) y deben eliminarse para no confundir a quien lea el código después.

- [ ] **Paso 1: Eliminar el bloque en el wrapper de `confirm_monthly_payment_and_generate` (~línea 514)**

Eliminar:
```ts
    if (msg.includes('has_conflicts')) {
      return {
        ok: false,
        error:
          'Hay conflictos de horario con otros appointments del terapista. Verificá la previsualización y resolvé antes de confirmar.',
      }
    }
```

- [ ] **Paso 2: Eliminar el bloque equivalente en el wrapper de `generate_cycle_agenda` (~línea 703)**

Mismo bloque, eliminar.

- [ ] **Paso 3: Eliminar el bloque equivalente en el wrapper de `regenerate_cycle_appointments` (~línea 1017)**

Eliminar:
```ts
      if (msg.includes('has_conflicts')) {
        return {
          ok: false,
          error:
            'Hay conflictos de horario con otras citas del terapista. Resolvé en /agenda y reintentá.',
        }
      }
```

- [ ] **Paso 4: Verificar tipos y lint**

Run: `npm run lint`
Expected: 0 errores nuevos.

- [ ] **Paso 5: Commit**

```bash
git add src/app/actions/monthly-cycles.ts
git commit -m "chore: quitar mapeo de error has_conflicts (ya inalcanzable tras 0181)"
```

---

### Tarea 6: Guard de idempotencia en `advanceWaitlistPhase`

**Files:**
- Modify: `src/app/actions/intake-pipeline.ts:92-113`

- [ ] **Paso 1: Reemplazar el bloque de creación incondicional**

Reemplazar (líneas 92-113):
```ts
  if (targetPhase.creates_child) {
    const t = await internalTransformWaitlistEntryToFamily(entry, user.id, admin)
    if (!t.ok) return { ok: false, error: t.error }
    transformed = t.data

    // Avanzar el child recién creado a 3_3_activo_en_terapias
    const nextPhase = catalog.find((c) => c.code === '3_3_activo_en_terapias')
    if (nextPhase) {
      await admin
        .from('children')
        .update({ current_phase_code: nextPhase.code })
        .eq('id', transformed.childId)

      await admin.from('child_phase_history').insert({
        child_id: transformed.childId,
        from_phase_code: null,
        to_phase_code: nextPhase.code,
        notes: 'Niño activado automáticamente tras inscripción.',
        changed_by_user_id: user.id,
      })
    }
  }
```
por:
```ts
  if (targetPhase.creates_child) {
    if (entry.scheduled_child_id) {
      // Idempotencia: la entrada ya fue convertida antes (ej. se revirtió la
      // fase para corregir un error y se está re-avanzando). Reusar el niño
      // existente en vez de crear una familia/niño duplicados — mismo guard
      // que ya existe en transformWaitlistEntryToFamily (waitlist.ts:338-340),
      // portado acá.
      const { data: existingChild } = await admin
        .from('children')
        .select('id, family_id, code')
        .eq('id', entry.scheduled_child_id)
        .maybeSingle()
      if (existingChild) {
        transformed = {
          childId: existingChild.id,
          familyId: existingChild.family_id,
          childCode: existingChild.code,
        }
      }
    } else {
      const t = await internalTransformWaitlistEntryToFamily(entry, user.id, admin)
      if (!t.ok) return { ok: false, error: t.error }
      transformed = t.data
    }

    // Avanzar el child (nuevo o existente) a 3_3_activo_en_terapias
    if (transformed) {
      const nextPhase = catalog.find((c) => c.code === '3_3_activo_en_terapias')
      if (nextPhase) {
        await admin
          .from('children')
          .update({ current_phase_code: nextPhase.code })
          .eq('id', transformed.childId)

        await admin.from('child_phase_history').insert({
          child_id: transformed.childId,
          from_phase_code: null,
          to_phase_code: nextPhase.code,
          notes: 'Niño activado automáticamente tras inscripción.',
          changed_by_user_id: user.id,
        })
      }
    }
  }
```

- [ ] **Paso 2: Verificar tipos y lint**

Run: `npm run lint`
Expected: 0 errores nuevos.

- [ ] **Paso 3: Verificación manual contra el flujo real (no hay harness de test para Server Actions en este repo)**

En el navegador (preview), con un usuario admin/directora:
1. Crear o usar una entrada de prueba en `/operacion/lista-de-espera` (family/child ficticios, nunca nombres reales).
2. Avanzarla a `3_2_inscripcion_activa` (crea family+child, auto-avanza a `3_3_activo_en_terapias`). Anotar el `child_id`/`family_id` creados.
3. Revertirla manualmente a una fase anterior (ej. `3_1`).
4. Re-avanzarla a `3_2_inscripcion_activa` de nuevo.
5. Confirmar en `/ninos` y `/familias` que **no** aparece un segundo niño/familia — y que `waitlist_entries.scheduled_child_id` sigue apuntando al mismo `child_id` del paso 2.

- [ ] **Paso 4: Commit**

```bash
git add src/app/actions/intake-pipeline.ts
git commit -m "fix: advanceWaitlistPhase ya no duplica niño/familia al re-avanzar una entrada ya convertida"
```

---

### Tarea 7: Diagnóstico de familias huérfanas (solo lectura)

**Files:**
- Create: `supabase/scripts/find_orphaned_families.sql`

- [ ] **Paso 1: Escribir el script**

```sql
-- Diagnóstico de solo lectura: familias sin ningún niño (huérfanas por el bug
-- de duplicación en advanceWaitlistPhase, fijo en esta misma migración/lote).
-- NO borra nada — solo lista, para que el usuario decida caso por caso.
SELECT f.id, f.primary_contact_name, f.created_at
FROM families f
WHERE NOT EXISTS (SELECT 1 FROM children c WHERE c.family_id = f.id)
ORDER BY f.created_at DESC;
```

(Ajustar `primary_contact_name` al nombre real de columna de contacto en `families` si difiere — revisar `src/types/db.ts` antes de correr.)

- [ ] **Paso 2: Correr contra producción y reportar**

Ejecutar vía Management API (mismo patrón de la Tarea 4) y reportar al usuario: cuántas filas salieron, con fecha de creación de cada una (sin exponer datos sensibles en el commit — el script en sí no contiene resultados, solo la query).

- [ ] **Paso 3: Commit**

```bash
git add supabase/scripts/find_orphaned_families.sql
git commit -m "chore: script de diagnóstico de familias huérfanas (solo lectura)"
```

---

### Tarea 8: Verificación final

- [ ] **Paso 1: Suite completa de tests**

Run: `npm test`
Expected: todos los tests pasan, incluyendo los 2 nuevos de `appointment.test.ts`.

- [ ] **Paso 2: Build**

Run: `npm run build`
Expected: build exitoso, sin errores de tipos.

- [ ] **Paso 3: Lint**

Run: `npm run lint`
Expected: 0 errores nuevos.

- [ ] **Paso 4: Recorrido manual en el navegador (preview)**

1. Abrir el modal de generar ciclo nuevo para un niño con conflicto de horario real o sintético (dos terapias propias, mismo terapeuta, mismo bloque) — confirmar que el banner ámbar aparece, distingue "misma niña/niño" cuando corresponde, y el botón "Generar ciclo"/"Generar solo agenda" **no** está deshabilitado.
2. Repetir en el modal de editar ciclo (`EditMonthlyCycleModal`) con un caso que produzca conflicto al regenerar.
3. Confirmar que un caso SIN conflictos sigue funcionando igual que antes (regresión).

- [ ] **Paso 5: Push a master**

```bash
git push origin HEAD:master
```

(Si el harness trabaja en una rama distinta de `master`, usar `git push origin HEAD:master` igual, por la regla de git de este repo.)

- [ ] **Paso 6: Actualizar CLAUDE.md**

Agregar entrada a la tabla de migraciones (0181) y a la sección "Estado del proyecto" documentando este lote, siguiendo el estilo de entradas anteriores (0177-0180). Commit separado:

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md — conflictos no bloqueantes + fix duplicación (mig 0181)"
git push origin HEAD:master
```
