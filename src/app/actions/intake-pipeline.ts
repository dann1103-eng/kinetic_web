'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import {
  validateTransition,
  getSideEffectsForTransition,
} from '@/lib/domain/intake-pipeline'
import type {
  Child,
  ChildPhaseHistoryEntry,
  IntakePhaseCatalogEntry,
  UserRole,
  WaitlistEntry,
} from '@/types/db'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

async function getActor() {
  const supabase = await createClient()
  const ctx = await getEffectiveUser()
  if (!ctx) throw new Error('No autenticado')
  return {
    supabase,
    user: { id: ctx.appUser.id, role: ctx.appUser.role as UserRole },
  }
}

async function fetchCatalog(): Promise<IntakePhaseCatalogEntry[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('intake_phase_catalog')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true })
  return (data ?? []) as IntakePhaseCatalogEntry[]
}

export async function listPhaseCatalog(): Promise<IntakePhaseCatalogEntry[]> {
  return fetchCatalog()
}

// ──────────────────────────────────────────────────────────────────────────
// Avanzar fase en waitlist (entradas pre-child)
// ──────────────────────────────────────────────────────────────────────────

export async function advanceWaitlistPhase(
  entryId: string,
  toCode: string,
  notes?: string,
): Promise<
  Result<{
    entry: WaitlistEntry
    /** Si la transición disparó la creación de un child, devuelve sus ids. */
    transformedChild?: { childId: string; familyId: string; childCode: string | null }
  }>
> {
  const { supabase, user } = await getActor()
  const admin = createAdminClient()
  const catalog = await fetchCatalog()

  const { data: entryRow, error: entryErr } = await supabase
    .from('waitlist_entries')
    .select('*')
    .eq('id', entryId)
    .maybeSingle()
  if (entryErr) return { ok: false, error: entryErr.message }
  if (!entryRow) return { ok: false, error: 'Entrada no encontrada.' }
  const entry = entryRow as WaitlistEntry

  const validation = validateTransition(
    entry.current_phase_code,
    toCode,
    catalog,
    user.role,
  )
  if (!validation.allowed) {
    return { ok: false, error: validation.reason ?? 'Transición no permitida.' }
  }

  const targetPhase = catalog.find((c) => c.code === toCode)
  if (!targetPhase) return { ok: false, error: 'Fase destino desconocida.' }

  // Side effect crítico: si la fase destino crea child, transformamos la
  // entrada en family+child y avanzamos al child al siguiente código.
  let transformed:
    | { childId: string; familyId: string; childCode: string | null }
    | undefined

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

  // Actualizar la entrada con la nueva fase.
  const now = new Date().toISOString()
  const updatePatch: Partial<Omit<WaitlistEntry, 'id' | 'added_at'>> = {
    current_phase_code: toCode,
  }
  // Timestamps de auditoría (audit-only, ya no manejan status)
  if (toCode === '1_2_informacion_enviada' || toCode === '1_3_entrevista_agendada') {
    updatePatch.contacted_at = now
    updatePatch.contacted_by_user_id = user.id
  }
  if (toCode === '5_2_retirado') {
    updatePatch.dropped_at = now
  }
  if (transformed) {
    updatePatch.scheduled_child_id = transformed.childId
  }

  const { data: updated, error: updErr } = await admin
    .from('waitlist_entries')
    .update(updatePatch)
    .eq('id', entryId)
    .select('*')
    .single()

  if (updErr || !updated) {
    return {
      ok: false,
      error: updErr?.message ?? 'No se pudo actualizar la entrada.',
    }
  }

  await admin.from('child_phase_history').insert({
    waitlist_entry_id: entryId,
    from_phase_code: entry.current_phase_code,
    to_phase_code: toCode,
    notes: notes?.trim() || validation.warning || null,
    changed_by_user_id: user.id,
  })

  revalidatePath('/operacion/lista-de-espera')
  revalidatePath('/dashboard')
  if (transformed) {
    revalidatePath('/familias')
    revalidatePath(`/familias/${transformed.familyId}`)
    revalidatePath('/ninos')
  }

  return {
    ok: true,
    data: { entry: updated as WaitlistEntry, transformedChild: transformed },
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Avanzar fase en children (post-inscripción)
// ──────────────────────────────────────────────────────────────────────────

export interface AdvanceChildOptions {
  /** Confirmar cancelación de citas futuras cuando la fase destino lo requiera. */
  confirmCancelAppointments?: boolean
}

export async function advanceChildPhase(
  childId: string,
  toCode: string,
  notes: string | null,
  options: AdvanceChildOptions = {},
): Promise<
  Result<{
    child: Child
    cancelled_appointments: number
    alert_created: boolean
  }>
> {
  const { user } = await getActor()
  const admin = createAdminClient()
  const catalog = await fetchCatalog()

  const { data: childRow } = await admin
    .from('children')
    .select('*')
    .eq('id', childId)
    .maybeSingle()
  if (!childRow) return { ok: false, error: 'Niño no encontrado.' }
  const child = childRow as Child

  const validation = validateTransition(
    child.current_phase_code,
    toCode,
    catalog,
    user.role,
  )
  if (!validation.allowed) {
    return { ok: false, error: validation.reason ?? 'Transición no permitida.' }
  }

  const targetPhase = catalog.find((c) => c.code === toCode)
  if (!targetPhase) return { ok: false, error: 'Fase destino desconocida.' }
  const fromPhase = child.current_phase_code
    ? catalog.find((c) => c.code === child.current_phase_code) ?? null
    : null

  const sideEffects = getSideEffectsForTransition(targetPhase, fromPhase)
  const needsCancelConfirm = sideEffects.some(
    (s) => s.type === 'cancel_future_appointments',
  )
  if (needsCancelConfirm && !options.confirmCancelAppointments) {
    return {
      ok: false,
      error:
        'Esta fase implica cancelar citas futuras. Marca la confirmación para continuar.',
    }
  }

  // 1. Cancelar citas futuras si corresponde
  let cancelled = 0
  if (needsCancelConfirm && options.confirmCancelAppointments) {
    const { data: cancelledRows } = await admin
      .from('appointments')
      .update({
        status: 'cancelled',
        notes: `Cancelada automáticamente por cambio de fase a ${targetPhase.label}.`,
      })
      .eq('child_id', childId)
      .gte('starts_at', new Date().toISOString())
      .in('status', ['scheduled', 'in_progress', 'replacement'])
      .select('id')
    cancelled = cancelledRows?.length ?? 0
  }

  // 2. Actualizar fase del niño
  const { data: updated, error: updErr } = await admin
    .from('children')
    .update({ current_phase_code: toCode })
    .eq('id', childId)
    .select('*')
    .single()
  if (updErr || !updated) {
    return {
      ok: false,
      error: updErr?.message ?? 'No se pudo actualizar al niño.',
    }
  }

  // 3. Audit log
  await admin.from('child_phase_history').insert({
    child_id: childId,
    from_phase_code: child.current_phase_code,
    to_phase_code: toCode,
    notes: notes?.trim() || validation.warning || null,
    changed_by_user_id: user.id,
  })

  // 4. Dashboard alert si fase terminal
  let alertCreated = false
  if (targetPhase.is_terminal) {
    const expires = new Date()
    expires.setDate(expires.getDate() + 7)
    const alertType = toCode === '5_1_alta_terapeutica' ? 'discharge' : 'dropout'
    const childName = updated.preferred_name ?? updated.full_name
    const message =
      alertType === 'discharge'
        ? `${childName} ha sido dado de alta. Genera la carta de alta.`
        : `${childName} fue marcado como retirado.`
    await admin.from('dashboard_alerts').insert({
      alert_type: alertType,
      child_id: childId,
      message,
      expires_at: expires.toISOString(),
      created_by_user_id: user.id,
    })
    alertCreated = true

    // Notificaciones en /inbox para coords + admin + directora
    await createDischargeNotifications(childId, childName, alertType, admin)
  }

  revalidatePath(`/familias/${updated.family_id}`)
  revalidatePath(`/familias/${updated.family_id}/children/${childId}`)
  revalidatePath('/ninos')
  revalidatePath('/dashboard')

  return {
    ok: true,
    data: {
      child: updated as Child,
      cancelled_appointments: cancelled,
      alert_created: alertCreated,
    },
  }
}

export async function revertChildPhase(
  childId: string,
  toCode: string,
  reason: string,
): Promise<Result<{ child: Child }>> {
  const { user } = await getActor()
  if (!['admin', 'directora'].includes(user.role)) {
    return { ok: false, error: 'Solo admin/directora puede revertir fases.' }
  }
  if (reason.trim().length < 5) {
    return { ok: false, error: 'El motivo debe tener al menos 5 caracteres.' }
  }

  // Reusar advanceChildPhase con confirmación, pero forzar log con razón
  const result = await advanceChildPhase(childId, toCode, `Reversión: ${reason.trim()}`, {
    confirmCancelAppointments: false,
  })
  if (!result.ok) return result
  return { ok: true, data: { child: result.data.child } }
}

export async function getChildPhaseHistory(
  childId: string,
): Promise<ChildPhaseHistoryEntry[]> {
  const { supabase } = await getActor()
  const { data } = await supabase
    .from('child_phase_history')
    .select('*')
    .eq('child_id', childId)
    .order('changed_at', { ascending: false })
  return (data ?? []) as ChildPhaseHistoryEntry[]
}

export async function getWaitlistPhaseHistory(
  entryId: string,
): Promise<ChildPhaseHistoryEntry[]> {
  const { supabase } = await getActor()
  const { data } = await supabase
    .from('child_phase_history')
    .select('*')
    .eq('waitlist_entry_id', entryId)
    .order('changed_at', { ascending: false })
  return (data ?? []) as ChildPhaseHistoryEntry[]
}

export async function getFutureAppointmentsCount(
  childId: string,
): Promise<number> {
  const { supabase } = await getActor()
  const { count } = await supabase
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('child_id', childId)
    .gte('starts_at', new Date().toISOString())
    .in('status', ['scheduled', 'in_progress', 'replacement'])
  return count ?? 0
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers privados
// ──────────────────────────────────────────────────────────────────────────

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Versión interna de transformWaitlistEntryToFamily — llamada desde
 * advanceWaitlistPhase cuando la fase destino tiene creates_child=true.
 * No expuesta como server action.
 */
async function internalTransformWaitlistEntryToFamily(
  entry: WaitlistEntry,
  userId: string,
  admin: AdminClient,
): Promise<
  Result<{ childId: string; familyId: string; childCode: string | null }>
> {
  const familyName = entry.parent_full_name.trim()
  const childName = entry.child_full_name.trim()
  if (!familyName || !childName) {
    return { ok: false, error: 'La entrada no tiene nombre de familia o niño.' }
  }

  const { data: createdFamily, error: familyErr } = await admin
    .from('families')
    .insert({
      primary_contact_name: familyName,
      primary_contact_phone: entry.parent_phone?.trim() || null,
      primary_contact_email: entry.parent_email?.trim() || null,
      notes: entry.notes?.trim() || null,
      created_by_user_id: userId,
    })
    .select('id')
    .single()

  if (familyErr || !createdFamily) {
    return { ok: false, error: familyErr?.message ?? 'No se pudo crear la familia.' }
  }
  const familyId = (createdFamily as { id: string }).id

  const { data: createdChild, error: childErr } = await admin
    .from('children')
    .insert({
      family_id: familyId,
      full_name: childName,
      birth_date: entry.child_birthdate ?? null,
      diagnoses_display_text: entry.child_diagnosis?.trim() || null,
      referral_source_id: entry.referral_source_id ?? null,
      created_by_user_id: userId,
    })
    .select('id, code')
    .single()

  if (childErr || !createdChild) {
    await admin.from('families').delete().eq('id', familyId)
    return { ok: false, error: childErr?.message ?? 'No se pudo crear el niño.' }
  }

  return {
    ok: true,
    data: { childId: createdChild.id, familyId, childCode: createdChild.code },
  }
}

async function createDischargeNotifications(
  childId: string,
  childName: string,
  alertType: 'discharge' | 'dropout',
  admin: AdminClient,
): Promise<void> {
  const { data: targets } = await admin
    .from('users')
    .select('id')
    .in('role', ['admin', 'directora', 'coordinadora_familias', 'coordinadora_terapias'])

  if (!targets || targets.length === 0) return

  const message =
    alertType === 'discharge'
      ? `${childName} ha sido dado de alta.`
      : `${childName} fue marcado como retirado.`

  // La tabla `notifications` (mig 0058) tiene un schema flexible; se inserta
  // vía un cast porque los Types Generic aún no incluyen el shape exacto.
  const rows = targets.map((t) => ({
    recipient_user_id: t.id,
    kind: alertType === 'discharge' ? 'child_discharge' : 'child_dropout',
    title: alertType === 'discharge' ? 'Alta terapéutica' : 'Niño retirado',
    body: message,
    payload_json: { child_id: childId },
  }))

  await (admin.from('notifications') as unknown as {
    insert: (v: unknown) => Promise<unknown>
  }).insert(rows)
}
