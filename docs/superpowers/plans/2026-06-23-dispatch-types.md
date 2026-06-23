# Tres Tipos de Despacho — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single "Despachar niño/a" button with three typed delivery paths (internal handoff, to reception with timer, direct to parent), and give reception a floating real-time queue card instead of the current blocking popup.

**Architecture:** One new migration adds two columns to `appointments`. Server actions are modified/added in `dispatch.ts`. `BigSessionCard` gets three buttons. `DispatchWatcher` bifurcates by role: reception sees stacked floating cards with inline charge/waive; therapists keep the existing popup as a safety net filtered to exclude children already at reception.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + Realtime), TypeScript, Tailwind CSS, `@supabase/supabase-js` v2, `createAdminClient` for privileged writes gated by role in code.

**Spec:** `docs/superpowers/specs/2026-06-23-dispatch-types-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/migrations/0150_dispatch_type.sql` | Create | `dispatch_type` + `handed_to_reception_at` columns + index |
| `src/types/db.ts` | Modify | `Appointment` interface + `Database` Insert type |
| `src/app/actions/dispatch.ts` | Modify | New actions; modify existing `dispatchChild` + `listPendingDispatches` |
| `src/components/mi-dia/BigSessionCard.tsx` | Modify | Replace single button with 3 dispatch buttons + per-type status chips |
| `src/components/dispatch/DispatchWatcher.tsx` | Modify | Bifurcate by role: reception queue cards vs therapist safety-net popup |

---

## Task 1: Migración 0150 — columnas `dispatch_type` y `handed_to_reception_at`

**Files:**
- Create: `supabase/migrations/0150_dispatch_type.sql`

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- supabase/migrations/0150_dispatch_type.sql
-- =============================================================================
-- 0150 — Tres tipos de despacho: internal | to_reception | to_parent
-- =============================================================================
-- dispatch_type: cómo fue despachado el niño (null = legacy sin tipo).
-- handed_to_reception_at: cuando la terapista entregó el niño a recepción;
--   el timer de gracia corre desde aquí (no desde completed_at).
-- =============================================================================

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS dispatch_type text
    CHECK (dispatch_type IN ('internal', 'to_reception', 'to_parent')),
  ADD COLUMN IF NOT EXISTS handed_to_reception_at timestamptz;

-- Índice para la cola de recepción.
CREATE INDEX IF NOT EXISTS appointments_reception_queue_idx
  ON public.appointments (handed_to_reception_at)
  WHERE dispatch_type = 'to_reception'
    AND dispatched_at IS NULL
    AND handed_to_reception_at IS NOT NULL;

-- ── Fin de migración 0150 ──────────────────────────────────────────────────
```

- [ ] **Step 2: Aplicar en Supabase Dashboard**

Pegar el contenido en SQL Editor de Supabase y ejecutar. Verificar en Table Editor que `appointments` tiene las dos columnas nuevas.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0150_dispatch_type.sql
git commit -m "feat: migración 0150 — dispatch_type y handed_to_reception_at en appointments"
```

---

## Task 2: Tipos TypeScript

**Files:**
- Modify: `src/types/db.ts`

- [ ] **Step 1: Agregar campos a `interface Appointment`**

Buscar la línea con `dispatched_at: string | null` en `interface Appointment` y agregar debajo:

```typescript
  dispatch_type: 'internal' | 'to_reception' | 'to_parent' | null
  handed_to_reception_at: string | null
```

- [ ] **Step 2: Agregar campos al `Insert` de `appointments` en `Database`**

Buscar el bloque `appointments: { ... Insert: { ... } }` dentro del tipo `Database` (cerca de la línea 2375 histórica). Agregar al `Insert`:

```typescript
          dispatch_type?: 'internal' | 'to_reception' | 'to_parent' | null
          handed_to_reception_at?: string | null
```

- [ ] **Step 3: Verificar tipos**

```bash
npx tsc --noEmit
```

Esperado: sin errores nuevos.

- [ ] **Step 4: Commit**

```bash
git add src/types/db.ts
git commit -m "feat: tipos TS para dispatch_type y handed_to_reception_at"
```

---

## Task 3: Server actions — `dispatch.ts`

**Files:**
- Modify: `src/app/actions/dispatch.ts`

### 3a — Nueva action `handToReception`

- [ ] **Step 1: Agregar `handToReception` después de `listPendingDispatches`**

```typescript
/**
 * Terapista entrega el niño a recepción. Inicia el timer de gracia de 15 min.
 * Idempotente: si already handed, retorna ok sin escribir.
 */
export async function handToReception(
  appointmentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'No autenticado.' }

  const admin = createAdminClient()
  const { data: appt } = await admin
    .from('appointments')
    .select('id, status, dispatched_at, handed_to_reception_at')
    .eq('id', appointmentId)
    .maybeSingle()
  if (!appt) return { ok: false, error: 'Cita no encontrada.' }
  if (appt.status !== 'completed') return { ok: false, error: 'La terapia aún no se ha finalizado.' }
  if (appt.dispatched_at) return { ok: true }
  // Guard idempotente: ya en recepción.
  if (appt.handed_to_reception_at) return { ok: true }

  const { error } = await admin
    .from('appointments')
    .update({
      dispatch_type: 'to_reception',
      handed_to_reception_at: new Date().toISOString(),
    })
    .eq('id', appointmentId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/mi-dia')
  revalidatePath('/agenda')
  return { ok: true }
}
```

### 3b — Nueva action `listReceptionQueue`

- [ ] **Step 2: Agregar `listReceptionQueue` después de `listSuggestedLateFees`**

```typescript
export interface ReceptionQueueItem {
  id: string
  child_id: string
  child_name: string
  service_type: string | null
  handed_to_reception_at: string
}

/** Niños esperando en recepción a que los papás los recojan. */
export async function listReceptionQueue(): Promise<ReceptionQueueItem[]> {
  const actor = await getActor()
  if (!actor) return []
  const supabase = await createClient()

  const { data } = await supabase
    .from('appointments')
    .select('id, child_id, service_type, handed_to_reception_at')
    .eq('dispatch_type', 'to_reception')
    .is('dispatched_at', null)
    .not('handed_to_reception_at', 'is', null)
    .order('handed_to_reception_at', { ascending: true })

  const rows = (data ?? []) as {
    id: string
    child_id: string
    service_type: string | null
    handed_to_reception_at: string
  }[]
  if (rows.length === 0) return []

  const childIds = Array.from(new Set(rows.map((r) => r.child_id)))
  const { data: childrenRaw } = await supabase
    .from('children')
    .select('id, full_name')
    .in('id', childIds)
  const nameById = new Map((childrenRaw ?? []).map((c) => [c.id, c.full_name]))

  return rows.map((r) => ({
    id: r.id,
    child_id: r.child_id,
    child_name: nameById.get(r.child_id) ?? 'Niño/a',
    service_type: r.service_type,
    handed_to_reception_at: r.handed_to_reception_at,
  }))
}
```

### 3c — Modificar `dispatchChild` para los tres tipos

- [ ] **Step 3: Reemplazar la función `dispatchChild` completa**

La firma cambia de `(appointmentId)` a `(appointmentId, dispatchType, waiveReason?)`.
La lógica de notificación se guarda solo para el path legacy (null dispatch_type).

```typescript
/** Marca al niño como despachado. Para 'to_reception': llamado por recepción. */
export async function dispatchChild(
  appointmentId: string,
  dispatchType: 'internal' | 'to_parent' | 'to_reception' = 'to_parent',
  waiveReason?: string,
): Promise<{ ok: true; feeUsd: number; minutes: number } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'No autenticado.' }

  const admin = createAdminClient()
  const { data: appt } = await admin
    .from('appointments')
    .select('id, child_id, therapist_id, status, completed_at, dispatched_at, handed_to_reception_at')
    .eq('id', appointmentId)
    .maybeSingle()
  if (!appt) return { ok: false, error: 'Cita no encontrada.' }
  if (appt.status !== 'completed') return { ok: false, error: 'La terapia aún no se ha finalizado.' }
  if (appt.dispatched_at) return { ok: true, feeUsd: 0, minutes: 0 }

  const nowISO = new Date().toISOString()

  // Tipos sin cargo (internal, to_parent, o to_reception sin fee).
  if (dispatchType === 'internal' || dispatchType === 'to_parent') {
    const { error } = await admin
      .from('appointments')
      .update({
        dispatched_at: nowISO,
        dispatched_by_user_id: actor.id,
        dispatch_type: dispatchType,
        late_fee_minutes: 0,
        late_fee_usd: 0,
        late_fee_status: 'none',
        dispatch_snoozed_until: null,
      })
      .eq('id', appointmentId)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/mi-dia')
    revalidatePath('/agenda')
    revalidatePath('/aprobaciones')
    return { ok: true, feeUsd: 0, minutes: 0 }
  }

  // to_reception: timer desde handed_to_reception_at.
  const timerOrigin = appt.handed_to_reception_at ?? nowISO
  const { minutes, feeUsd } = computeLatePickup(timerOrigin, nowISO)

  let late_fee_status: 'none' | 'waived'
  let late_fee_waive_reason: string | null = null

  if (feeUsd > 0 && waiveReason && waiveReason.trim().length >= 3) {
    late_fee_status = 'waived'
    late_fee_waive_reason = waiveReason.trim()
  } else {
    // Sin cargo o sin motivo de perdón válido → sin cargo (ningún fee queda sugerido).
    late_fee_status = 'none'
  }

  const { error } = await admin
    .from('appointments')
    .update({
      dispatched_at: nowISO,
      dispatched_by_user_id: actor.id,
      dispatch_type: 'to_reception',
      late_fee_minutes: minutes,
      late_fee_usd: feeUsd,
      late_fee_status,
      late_fee_waive_reason,
      dispatch_snoozed_until: null,
    })
    .eq('id', appointmentId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/mi-dia')
  revalidatePath('/agenda')
  revalidatePath('/aprobaciones')
  return { ok: true, feeUsd, minutes }
}
```

### 3d — Nueva action `dispatchAndCharge`

- [ ] **Step 4: Agregar `dispatchAndCharge` después de `dispatchChild`**

```typescript
/**
 * Recepción despacha al niño Y cobra el cargo tardío en un solo paso.
 * El cargo queda en 'charged' directamente, sin pasar por /aprobaciones.
 */
export async function dispatchAndCharge(
  appointmentId: string,
): Promise<{ ok: true; feeUsd: number } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'No autenticado.' }
  if (!MGMT_ROLES.includes(actor.role)) return { ok: false, error: 'No autorizado.' }

  const admin = createAdminClient()
  const { data: appt } = await admin
    .from('appointments')
    .select('id, child_id, starts_at, dispatched_at, handed_to_reception_at')
    .eq('id', appointmentId)
    .maybeSingle()
  if (!appt) return { ok: false, error: 'Cita no encontrada.' }
  if (appt.dispatched_at) return { ok: true, feeUsd: 0 }

  const nowISO = new Date().toISOString()
  const timerOrigin = appt.handed_to_reception_at ?? nowISO
  const { minutes, feeUsd } = computeLatePickup(timerOrigin, nowISO)

  // Guard: solo llamar cuando hay cargo real (race condition entre UI y action).
  if (feeUsd <= 0) return { ok: false, error: 'Sin cargo tardío para cobrar.' }

  const { error } = await admin
    .from('appointments')
    .update({
      dispatched_at: nowISO,
      dispatched_by_user_id: actor.id,
      dispatch_type: 'to_reception',
      late_fee_minutes: minutes,
      late_fee_usd: feeUsd,
      late_fee_status: 'charged',
      dispatch_snoozed_until: null,
    })
    .eq('id', appointmentId)
  if (error) return { ok: false, error: error.message }

  // Acumular línea en la factura del ciclo del mes (igual que confirmLateFee).
  const period = `${appt.starts_at.slice(0, 7)}-01`
  const { data: cycle } = await admin
    .from('monthly_session_cycles')
    .select('id, invoice_id')
    .eq('child_id', appt.child_id)
    .eq('period_month', period)
    .neq('status', 'cancelled')
    .maybeSingle()

  if (cycle?.invoice_id) {
    const dateLabel = new Date(appt.starts_at).toLocaleDateString('es-SV')
    await admin.from('invoice_items').insert({
      invoice_id: cycle.invoice_id,
      description: `Recogida tardía (${dateLabel})`,
      quantity: 1,
      unit_price: feeUsd,
      line_total: feeUsd,
      sort_order: 98,
    })
    const { data: inv } = await admin
      .from('invoices')
      .select('total, total_a_pagar')
      .eq('id', cycle.invoice_id)
      .maybeSingle()
    if (inv) {
      await admin
        .from('invoices')
        .update({
          total: Number(inv.total ?? 0) + feeUsd,
          total_a_pagar: Number(inv.total_a_pagar ?? 0) + feeUsd,
        })
        .eq('id', cycle.invoice_id)
    }
  }

  revalidatePath('/mi-dia')
  revalidatePath('/agenda')
  revalidatePath('/aprobaciones')
  return { ok: true, feeUsd }
}
```

### 3e — Corregir `listPendingDispatches` para excluir niños ya en recepción

- [ ] **Step 5: Agregar filtro en `listPendingDispatches`**

Después de `.is('dispatched_at', null)` en la query de `listPendingDispatches`, agregar:

```typescript
    // Excluir niños ya entregados a recepción (tienen su propio flujo de tarjeta flotante).
    .or('dispatch_type.is.null,dispatch_type.in.(internal,to_parent)')
```

- [ ] **Step 6: Lint y type-check**

```bash
npx eslint src/app/actions/dispatch.ts
npx tsc --noEmit
```

Esperado: 0 errores.

- [ ] **Step 7: Commit**

```bash
git add src/app/actions/dispatch.ts
git commit -m "feat: handToReception, listReceptionQueue, dispatchAndCharge; dispatchChild tipado; listPendingDispatches filtra to_reception"
```

---

## Task 4: Tres botones en `BigSessionCard`

**Files:**
- Modify: `src/components/mi-dia/BigSessionCard.tsx`

- [ ] **Step 1: Agregar imports de nuevas actions**

Al inicio del archivo, en el import de `dispatch`, agregar las acciones nuevas:

```typescript
import {
  dispatchChild,
  handToReception,
  // handToReception y snoozeDispatch viven en dispatch.ts
} from '@/app/actions/dispatch'
```

Reemplazar el import actual de `dispatchChild` para incluir también `handToReception`:
```typescript
import { dispatchChild, handToReception } from '@/app/actions/dispatch'
```

- [ ] **Step 2: Reemplazar el bloque de despacho**

Encontrar el bloque que empieza en `{!appointment.dispatched_at ? (` (línea ~234).

Reemplazarlo con la siguiente lógica:

```tsx
{/* ── Despacho ─────────────────────────────────────────────── */}
{appointment.status === 'completed' && session?.ended_at && (
  <div className="ml-auto flex items-center gap-2 flex-wrap">
    {/* Estado: ya despachado */}
    {appointment.dispatched_at ? (
      <span className="text-[10px] text-emerald-700 inline-flex items-center gap-1">
        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>check</span>
        {(appointment as { dispatch_type?: string | null }).dispatch_type === 'internal'
          ? 'Entregado internamente'
          : (appointment as { dispatch_type?: string | null }).dispatch_type === 'to_reception'
            ? 'Despachado a papá'
            : 'Entregado a papá'}
      </span>
    ) : (appointment as { handed_to_reception_at?: string | null }).handed_to_reception_at ? (
      /* Estado: en recepción esperando */
      <span className="text-[10px] text-amber-700 inline-flex items-center gap-1">
        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>notifications</span>
        En recepción desde{' '}
        {new Date((appointment as { handed_to_reception_at: string }).handed_to_reception_at)
          .toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })}
      </span>
    ) : (
      /* Estado: pendiente — mostrar 3 botones */
      <>
        <span className="text-[10px] text-fm-on-surface-variant mr-1">Entregar:</span>
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(async () => {
            const res = await dispatchChild(appointment.id, 'internal')
            if (!res.ok) alert(res.error)
            else router.refresh()
          })}
          className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-sky-100 text-sky-800 hover:bg-sky-200 disabled:opacity-60"
          title="Pase a otra terapista — sin cargo"
        >
          ↪ Interna
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(async () => {
            const res = await handToReception(appointment.id)
            if (!res.ok) alert(res.error)
            else router.refresh()
          })}
          className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-60"
          title="Recepción espera al papá — inicia timer de 15 min"
        >
          🔔 Recepción
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(async () => {
            const res = await dispatchChild(appointment.id, 'to_parent')
            if (!res.ok) alert(res.error)
            else router.refresh()
          })}
          className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 hover:bg-emerald-200 disabled:opacity-60"
          title="El papá ya está — despacho inmediato sin cargo"
        >
          ✓ A papá
        </button>
      </>
    )}

    {onReportClick && session && (
      <ReportButton report={report ?? null} sessionId={session.id} onClick={onReportClick} />
    )}
    {onNoteClick && (
      <button
        onClick={() => onNoteClick(appointment.id)}
        className={`text-xs font-semibold underline-offset-2 hover:underline ${subtleClass}`}
      >
        Dejar nota
      </button>
    )}
  </div>
)}
```

- [ ] **Step 3: Lint y type-check**

```bash
npx eslint src/components/mi-dia/BigSessionCard.tsx
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/mi-dia/BigSessionCard.tsx
git commit -m "feat: tres botones de despacho en BigSessionCard (interna / recepción / papá)"
```

---

## Task 5: `DispatchWatcher` bifurcado por rol

**Files:**
- Modify: `src/components/dispatch/DispatchWatcher.tsx`

El componente actual es ~115 líneas. Lo reemplazamos completamente con una versión
que bifurca por rol: `ReceptionDispatchQueue` (tarjetas flotantes) vs el popup
existente como safety-net para terapistas.

- [ ] **Step 1: Reemplazar `DispatchWatcher.tsx` completo**

```tsx
'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  listPendingDispatches,
  listReceptionQueue,
  dispatchChild,
  dispatchAndCharge,
  snoozeDispatch,
  type PendingDispatch,
  type ReceptionQueueItem,
} from '@/app/actions/dispatch'
import {
  PICKUP_GRACE_MINUTES,
  computeLatePickup,
} from '@/lib/domain/billing/late-pickup'

// ── Componente selector por rol ───────────────────────────────────────────────
interface DispatchWatcherProps {
  currentUserRole: string
}

export function DispatchWatcher({ currentUserRole }: DispatchWatcherProps) {
  if (currentUserRole === 'recepcion') return <ReceptionDispatchQueue />
  // Safety-net para terapistas/maestras y gestión.
  return <TherapistDispatchPopup />
}

// ── Cola de recepción — tarjetas flotantes ────────────────────────────────────
function ReceptionDispatchQueue() {
  const [queue, setQueue] = useState<ReceptionQueueItem[]>([])
  const [nowMs, setNowMs] = useState(() => Date.now())
  // Snooze client-side: oculta la tarjeta localmente sin escribir a DB.
  const [snoozedUntil, setSnoozedUntil] = useState<Record<string, number>>({})

  const refresh = useCallback(() => {
    listReceptionQueue().then(setQueue).catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
    const supabase = createClient()
    const ch = supabase
      .channel('reception-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, refresh)
      .subscribe()
    const tick = setInterval(() => setNowMs(Date.now()), 5_000)
    const poll = setInterval(refresh, 60_000)
    return () => { supabase.removeChannel(ch); clearInterval(tick); clearInterval(poll) }
  }, [refresh])

  const visible = queue.filter((item) => {
    const until = snoozedUntil[item.id]
    return !until || until < nowMs
  })

  if (visible.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col-reverse gap-2 max-w-sm w-full">
      {visible.map((item) => (
        <ReceptionCard
          key={item.id}
          item={item}
          nowMs={nowMs}
          onSnooze={(id) => setSnoozedUntil((prev) => ({
            ...prev,
            [id]: Date.now() + 10 * 60_000,
          }))}
          onDispatched={refresh}
        />
      ))}
    </div>
  )
}

// ── Tarjeta individual de recepción ───────────────────────────────────────────
function ReceptionCard({
  item,
  nowMs,
  onSnooze,
  onDispatched,
}: {
  item: ReceptionQueueItem
  nowMs: number
  onSnooze: (id: string) => void
  onDispatched: () => void
}) {
  const [showModal, setShowModal] = useState(false)
  const [waiveReason, setWaiveReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isActing, startAct] = useTransition()

  const elapsed = useMemo(
    () => computeLatePickup(item.handed_to_reception_at, new Date(nowMs).toISOString()),
    [item.handed_to_reception_at, nowMs],
  )
  const isOverdue = elapsed.minutes >= PICKUP_GRACE_MINUTES
  const timerLabel = `${String(Math.floor(elapsed.minutes)).padStart(2, '0')}:${String(
    Math.floor(((nowMs - new Date(item.handed_to_reception_at).getTime()) % 60_000) / 1_000)
  ).padStart(2, '0')}`

  function handleConfirm(action: 'charge' | 'waive' | 'none') {
    setError(null)
    startAct(async () => {
      let res: { ok: boolean; error?: string }
      if (action === 'charge') {
        res = await dispatchAndCharge(item.id)
      } else if (action === 'waive') {
        if (!waiveReason.trim() || waiveReason.trim().length < 3) {
          setError('Escribí un motivo (mín. 3 caracteres).')
          return
        }
        res = await dispatchChild(item.id, 'to_reception', waiveReason)
      } else {
        // Sin cargo
        res = await dispatchChild(item.id, 'to_reception')
      }
      if (!res.ok) { setError(res.error ?? 'Error'); return }
      setShowModal(false)
      onDispatched()
    })
  }

  return (
    <>
      <div className={`bg-white rounded-2xl shadow-xl flex items-center gap-3 px-4 py-3 border-l-4 ${isOverdue ? 'border-l-[#b31b25]' : 'border-l-[#00675c]'}`}>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-zinc-900 truncate">{item.child_name}</p>
          <p className="text-[11px] text-zinc-500">
            En recepción
            {item.service_type && ` · ${item.service_type}`}
            {isOverdue && (
              <span className="ml-1.5 text-[10px] font-bold text-red-700 bg-red-50 px-1.5 py-0.5 rounded-full">
                +${elapsed.feeUsd.toFixed(2)}
              </span>
            )}
          </p>
        </div>
        <span className={`text-xl font-extrabold tabular-nums ${isOverdue ? 'text-[#b31b25]' : 'text-[#00675c]'}`}>
          {timerLabel}
        </span>
        <button
          type="button"
          onClick={() => { setShowModal(true); setError(null); setWaiveReason('') }}
          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-[#00675c] text-white hover:opacity-90"
        >
          Despachar a papá
        </button>
        <button
          type="button"
          onClick={() => onSnooze(item.id)}
          className="text-xs text-zinc-400 hover:text-zinc-600 px-1"
          title="Posponer 10 min"
        >
          ···
        </button>
      </div>

      {showModal && (
        <div
          className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <p className="text-base font-bold text-zinc-900">Despachar a papá</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {item.child_name} · {elapsed.minutes} min en recepción
              </p>
            </div>

            {isOverdue ? (
              <>
                <div className="bg-amber-50 rounded-xl px-4 py-3 flex justify-between items-center">
                  <div>
                    <p className="text-xs font-semibold text-amber-800">Cargo por recogida tardía</p>
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      {elapsed.minutes} min (+{elapsed.minutes - PICKUP_GRACE_MINUTES} min sobre gracia)
                    </p>
                  </div>
                  <p className="text-xl font-extrabold text-amber-700">${elapsed.feeUsd.toFixed(2)}</p>
                </div>
                {/* Campo de perdón */}
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    Motivo para perdonar (opcional)
                  </label>
                  <input
                    type="text"
                    value={waiveReason}
                    onChange={(e) => setWaiveReason(e.target.value)}
                    placeholder="Ej: acuerdo con la familia"
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </div>
                {error && <p className="text-xs text-red-700">{error}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isActing}
                    onClick={() => handleConfirm('charge')}
                    className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 disabled:opacity-60"
                  >
                    Cobrar ${elapsed.feeUsd.toFixed(2)}
                  </button>
                  <button
                    type="button"
                    disabled={isActing || waiveReason.trim().length < 3}
                    onClick={() => handleConfirm('waive')}
                    className="flex-1 py-2.5 rounded-xl bg-zinc-100 text-zinc-700 text-sm font-bold hover:bg-zinc-200 disabled:opacity-40"
                  >
                    Perdonar
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-emerald-50 rounded-xl px-4 py-3 text-sm font-semibold text-emerald-800">
                  ✓ Dentro del tiempo de gracia — sin cargo
                </div>
                {error && <p className="text-xs text-red-700">{error}</p>}
                <button
                  type="button"
                  disabled={isActing}
                  onClick={() => handleConfirm('none')}
                  className="w-full py-2.5 rounded-xl bg-[#00675c] text-white text-sm font-bold hover:opacity-90 disabled:opacity-60"
                >
                  {isActing ? 'Guardando…' : 'Confirmar despacho'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

// ── Safety-net popup para terapistas/maestras y gestión ───────────────────────
function TherapistDispatchPopup() {
  const [pending, setPending] = useState<PendingDispatch[]>([])
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [isActing, startAct] = useTransition()

  const refresh = useCallback(() => {
    listPendingDispatches().then(setPending).catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
    const supabase = createClient()
    const ch = supabase
      .channel('dispatch-watcher')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, refresh)
      .subscribe()
    const tick = setInterval(() => setNowMs(Date.now()), 30_000)
    const poll = setInterval(refresh, 120_000)
    return () => { supabase.removeChannel(ch); clearInterval(tick); clearInterval(poll) }
  }, [refresh])

  const overdue = pending.find((p) => {
    const elapsed = Math.floor((nowMs - new Date(p.completed_at).getTime()) / 60_000)
    if (elapsed < PICKUP_GRACE_MINUTES) return false
    if (p.snoozed_until && new Date(p.snoozed_until).getTime() > nowMs) return false
    return true
  })

  if (!overdue) return null
  const elapsedMin = Math.floor((nowMs - new Date(overdue.completed_at).getTime()) / 60_000)

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-fm-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
          <span className="material-symbols-outlined text-amber-700 text-2xl">schedule</span>
        </div>
        <div>
          <h3 className="text-base font-semibold text-fm-on-surface">
            ¿{overdue.child_name} sigue ahí?
          </h3>
          <p className="text-sm text-fm-on-surface-variant mt-1">
            La terapia finalizó hace <b>{elapsedMin} min</b>. Usá los botones de
            &ldquo;Entregar&rdquo; en tu tarjeta de sesión, o confirmá aquí si
            ya fue despachado.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => startAct(async () => {
              await dispatchChild(overdue.id, 'to_parent')
              refresh()
            })}
            disabled={isActing}
            className="w-full px-4 py-2.5 rounded-xl bg-fm-primary text-white font-medium hover:opacity-90 disabled:opacity-60"
          >
            Sí, ya fue despachado
          </button>
          <button
            type="button"
            onClick={() => startAct(async () => {
              await snoozeDispatch(overdue.id, 10)
              refresh()
            })}
            disabled={isActing}
            className="w-full px-4 py-2.5 rounded-xl border border-fm-outline-variant/40 text-fm-on-surface hover:bg-fm-surface-container disabled:opacity-60"
          >
            No lo han traído aún
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Actualizar el lugar donde se renderiza `DispatchWatcher`**

`DispatchWatcher` se monta en el layout principal. Buscar dónde se invoca (probablemente `src/app/(app)/layout.tsx` o similar) y pasar `currentUserRole`:

```tsx
// Ejemplo — encontrar el lugar real y agregar la prop:
<DispatchWatcher currentUserRole={appUser.role} />
```

- [ ] **Step 3: Lint y type-check**

```bash
npx eslint src/components/dispatch/DispatchWatcher.tsx
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/dispatch/DispatchWatcher.tsx
git commit -m "feat: DispatchWatcher bifurcado — tarjetas flotantes para recepción, popup safety-net para terapistas"
```

---

## Task 6: Verificación final y push

- [ ] **Step 1: Build completo**

```bash
npm run build
```

Esperado: compila sin errores.

- [ ] **Step 2: Push a master**

```bash
git push origin HEAD:master
```

- [ ] **Step 3: Verificación manual**

1. Terapista completa terapia → aparecen los 3 botones "↪ Interna / 🔔 Recepción / ✓ A papá"
2. Click "🔔 Recepción" → chip ámbar "En recepción desde HH:MM" en BigSessionCard; tarjeta flotante aparece inmediatamente en la pantalla de recepción
3. Timer llega a 15 min → tarjeta se vuelve roja, aparece badge "+$5"
4. Recepción → "Despachar a papá" → modal inline → "Cobrar $5.00" → cargo queda `'charged'`, NO aparece en `/aprobaciones`
5. Recepción → "Despachar a papá" → "Perdonar" con motivo → cargo `'waived'`, NO aparece en `/aprobaciones`
6. Tarjeta desaparece en realtime en todos los perfiles de recepción
7. Click "✓ A papá" → chip verde inmediato, sin tarjeta en recepción
8. Click "↪ Interna" → chip gris inmediato, sin tarjeta en recepción
9. Safety-net: terapista que no clickeó nada en 15 min → popup existente aparece
10. Snooze (···) en tarjeta de recepción → se oculta 10 min, reaparece sola

---

## Nota de implementación

El bloque de notificaciones en el `dispatchChild` original (líneas 163–186 que envían
notif a admin/directora cuando `feeUsd > 0`) queda presente en la nueva versión del
action pero **solo se dispara cuando `dispatchType` es `null`/legacy** (ya que la nueva
ruta `to_reception` llega con `late_fee_status = 'waived'` o `'none'`, nunca
`'suggested'`). En la práctica, el bloque de notif no se ejecuta para citas nuevas —
se puede limpiar en un refactor posterior sin urgencia.
