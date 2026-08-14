'use server'

/**
 * child-suspensions.ts — suspensión avisada (mig 0184).
 *
 * La familia avisa que el niño/a no vendrá entre dos fechas y volverá. Se le
 * sacan las citas de ese período de la agenda y no se le cobran, sin tocar su
 * fase clínica.
 *
 * Por qué no se usa la pausa (`4_1_pausa_temporal`): esa es una fase CLÍNICA —
 * dice que el proceso terapéutico está detenido, cancela las citas futuras sin
 * fecha de regreso y hay que acordarse de revertirla. Un viaje de dos semanas no
 * es eso. Además, al pausar quedaban citas marcadas como inasistencia que
 * sobrevivían y salían en el detalle de pago.
 */

import { revalidatePath } from 'next/cache'
import { fromZonedTime } from 'date-fns-tz'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { monthsInRange, validateSuspensionRange } from '@/lib/domain/suspensions'
import { syncCycleChargeToAgenda } from './cycle-charge-sync'
import type { ChildSuspension, SuspensionReason } from '@/types/db'

const TZ = 'America/El_Salvador'

/** Roles que pueden registrar y revertir suspensiones (los que gestionan agenda). */
const CAN_MANAGE = [
  'admin',
  'directora',
  'coordinadora_familias',
  'coordinadora_terapias',
  'recepcion',
]

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

/** Suspensiones del niño, la más reciente primero. */
export async function listChildSuspensions(childId: string): Promise<ChildSuspension[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('child_suspensions')
    .select('*')
    .eq('child_id', childId)
    .order('starts_on', { ascending: false })
  return (data ?? []) as ChildSuspension[]
}

export interface CreateSuspensionInput {
  childId: string
  startsOn: string // 'YYYY-MM-DD'
  endsOn: string // 'YYYY-MM-DD' (inclusive)
  reason: SuspensionReason
  notes?: string | null
}

/**
 * Registra la suspensión y saca de la agenda las citas del período.
 *
 * Las citas NO se borran: se cancelan atadas a la suspensión, para poder
 * revertirlas en bloque y para que quede rastro de por qué desaparecieron. Las
 * sesiones ya dadas (`completed`, `in_progress`) no se tocan — pasaron de
 * verdad.
 */
export async function createChildSuspension(
  input: CreateSuspensionInput,
): Promise<Result<{ suspension: ChildSuspension; cancelled: number }>> {
  const ctx = await getEffectiveUser()
  if (!ctx) return { ok: false, error: 'No autenticado.' }
  if (!CAN_MANAGE.includes(ctx.appUser.role)) {
    return { ok: false, error: 'Sin permisos para registrar suspensiones.' }
  }

  const existing = await listChildSuspensions(input.childId)
  const invalid = validateSuspensionRange(input.startsOn, input.endsOn, existing)
  if (invalid) return { ok: false, error: invalid.message }

  const admin = createAdminClient()

  const { data: created, error: insErr } = await admin
    .from('child_suspensions')
    .insert({
      child_id: input.childId,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      reason: input.reason,
      notes: input.notes?.trim() || null,
      created_by_user_id: ctx.appUser.id,
    })
    .select('*')
    .single()
  if (insErr || !created) {
    return { ok: false, error: insErr?.message ?? 'No se pudo registrar la suspensión.' }
  }
  const suspension = created as ChildSuspension

  // Rango en instantes: desde las 00:00 del primer día hasta las 00:00 del día
  // SIGUIENTE al último (el rango de la suspensión es inclusivo).
  const startISO = fromZonedTime(`${input.startsOn} 00:00:00`, TZ).toISOString()
  const dayAfterEnd = new Date(`${input.endsOn}T12:00:00`)
  dayAfterEnd.setDate(dayAfterEnd.getDate() + 1)
  const endISO = fromZonedTime(
    `${dayAfterEnd.toISOString().slice(0, 10)} 00:00:00`,
    TZ,
  ).toISOString()

  const { data: cancelledRows } = await admin
    .from('appointments')
    .update({
      status: 'cancelled',
      suspension_id: suspension.id,
    })
    .eq('child_id', input.childId)
    .gte('starts_at', startISO)
    .lt('starts_at', endISO)
    // Lo ya ocurrido no se toca: una sesión dada, dada está. Las inasistencias
    // sí se absorben — es justo el caso que dejaba fechas huérfanas marcadas en
    // el calendario y pendientes de reposición.
    .in('status', ['scheduled', 'replacement', 'no_show', 'late_cancel'])
    .select('id')

  const cancelled = cancelledRows?.length ?? 0
  await admin
    .from('child_suspensions')
    .update({ cancelled_appointments_count: cancelled })
    .eq('id', suspension.id)

  // El cobro sigue a la agenda: los meses tocados se recalculan solos.
  await syncCycleChargeToAgenda(input.childId, monthsInRange(input.startsOn, input.endsOn))

  revalidatePath('/agenda')
  revalidatePath('/mi-dia')
  revalidatePath('/aprobaciones')
  const { data: child } = await admin
    .from('children')
    .select('family_id')
    .eq('id', input.childId)
    .maybeSingle()
  if (child?.family_id) {
    revalidatePath(`/familias/${child.family_id}`)
    revalidatePath(`/familias/${child.family_id}/children/${input.childId}`)
  }

  return {
    ok: true,
    data: { suspension: { ...suspension, cancelled_appointments_count: cancelled }, cancelled },
  }
}

/**
 * Revierte una suspensión (el viaje se cayó): devuelve las citas del lote a
 * `scheduled` y las suelta de la suspensión. Las que se hayan reagendado a mano
 * en el ínterin ya no llevan `suspension_id`, así que no se tocan.
 */
export async function revertChildSuspension(
  suspensionId: string,
): Promise<Result<{ restored: number }>> {
  const ctx = await getEffectiveUser()
  if (!ctx) return { ok: false, error: 'No autenticado.' }
  if (!CAN_MANAGE.includes(ctx.appUser.role)) {
    return { ok: false, error: 'Sin permisos para revertir suspensiones.' }
  }

  const admin = createAdminClient()
  const { data: raw } = await admin
    .from('child_suspensions')
    .select('*')
    .eq('id', suspensionId)
    .maybeSingle()
  if (!raw) return { ok: false, error: 'Suspensión no encontrada.' }
  const suspension = raw as ChildSuspension
  if (suspension.status === 'reverted') {
    return { ok: false, error: 'Esta suspensión ya fue revertida.' }
  }

  const { data: restoredRows } = await admin
    .from('appointments')
    .update({ status: 'scheduled', suspension_id: null })
    .eq('suspension_id', suspensionId)
    .select('id')
  const restored = restoredRows?.length ?? 0

  await admin
    .from('child_suspensions')
    .update({
      status: 'reverted',
      reverted_by_user_id: ctx.appUser.id,
      reverted_at: new Date().toISOString(),
    })
    .eq('id', suspensionId)

  await syncCycleChargeToAgenda(
    suspension.child_id,
    monthsInRange(suspension.starts_on, suspension.ends_on),
  )

  revalidatePath('/agenda')
  revalidatePath('/mi-dia')
  const { data: child } = await admin
    .from('children')
    .select('family_id')
    .eq('id', suspension.child_id)
    .maybeSingle()
  if (child?.family_id) {
    revalidatePath(`/familias/${child.family_id}`)
    revalidatePath(`/familias/${child.family_id}/children/${suspension.child_id}`)
  }

  return { ok: true, data: { restored } }
}
