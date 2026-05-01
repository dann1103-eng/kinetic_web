'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { nextCycleDates } from '@/lib/domain/cycles'
import { today as todayString } from '@/lib/domain/dates'
import { CONTENT_TYPES, CONTENT_TO_PLAN_KEY, effectiveLimits } from '@/lib/domain/plans'
import { computeTotals } from '@/lib/domain/requirement'
import { migrateOpenPipelineItems, PIPELINE_CONTENT_TYPES } from '@/lib/domain/pipeline'
import type { Phase } from '@/types/db'
import { cleanupCycleStorage } from '@/lib/supabase/cleanup-cycle-storage'
import { assertNotImpersonating } from './impersonation'
import type {
  BillingPeriod, CambiosPackage, ContentType, ExtraContentItem, PlanLimits, PaymentStatus,
} from '@/types/db'

interface RenewArgs {
  cycleId: string
  clientId: string
  planId: string
  billingPeriod: BillingPeriod
  rolloverChecked: Partial<Record<ContentType, boolean>>
  cambiosPackages: CambiosPackage[]
  extraContent: ExtraContentItem[]
  withChanges: boolean
  /** Si true, archiva el ciclo actual y promueve el nuevo a 'current' inmediatamente.
   *  Por defecto false: el nuevo ciclo se crea en 'scheduled' y el cron lo promueve
   *  cuando termina el ciclo actual. */
  immediate?: boolean
}

export async function renewCycle(args: RenewArgs) {
  const supabase = await createClient()
  const immediate = args.immediate === true

  const [{ data: cycleRow }, { data: clientRow }, { data: planRow }, { data: reqs }] = await Promise.all([
    supabase.from('billing_cycles').select('*').eq('id', args.cycleId).single(),
    supabase.from('clients').select('*, plan:plans!clients_current_plan_id_fkey(*)').eq('id', args.clientId).single(),
    supabase.from('plans').select('*').eq('id', args.planId).single(),
    supabase.from('requirements').select('*').eq('billing_cycle_id', args.cycleId),
  ])

  if (!cycleRow || !clientRow || !planRow) {
    return { error: 'No se pudo cargar el ciclo actual.' }
  }

  const totals = computeTotals(reqs ?? [])
  const limits = effectiveLimits(cycleRow.limits_snapshot_json, cycleRow.rollover_from_previous_json)

  const planLimits: PlanLimits = planRow.unified_content_limit != null
    ? { ...planRow.limits_json, unified_content_limit: planRow.unified_content_limit }
    : planRow.limits_json

  const rolloverJson: Partial<PlanLimits> = {}
  let hasRollover = false
  for (const type of CONTENT_TYPES) {
    if (args.rolloverChecked[type]) {
      const unused = limits[type] - totals[type]
      if (unused > 0) {
        rolloverJson[CONTENT_TO_PLAN_KEY[type]] = unused
        hasRollover = true
      }
    }
  }

  const { periodStart, periodEnd } = nextCycleDates(cycleRow.period_end, {
    billingPeriod: args.billingPeriod,
  })

  // Si NO es inmediata: solo crear/actualizar scheduled, sin tocar el current ni el cliente.
  // El cron promoverá scheduled→current cuando period_end del current expire, y en ese
  // momento actualizará clients.current_plan_id si el plan cambió.
  if (!immediate) {
    // ¿Ya hay un scheduled? Lo actualizamos. Si no, creamos uno.
    const { data: existingScheduled } = await supabase
      .from('billing_cycles')
      .select('id')
      .eq('client_id', args.clientId)
      .eq('status', 'scheduled')
      .maybeSingle()

    const scheduledPayload = {
      client_id: args.clientId,
      plan_id_snapshot: args.planId,
      limits_snapshot_json: planLimits,
      rollover_from_previous_json: hasRollover ? rolloverJson : null,
      period_start: periodStart,
      period_end: periodEnd,
      status: 'scheduled' as const,
      payment_status: 'unpaid' as const,
      cambios_budget:
        planRow.cambios_included +
        (args.withChanges ? args.cambiosPackages.reduce((s, p) => s + p.qty, 0) : 0),
      cambios_packages_json: args.withChanges ? args.cambiosPackages : [],
      extra_content_json: args.withChanges ? args.extraContent : [],
    }

    if (existingScheduled) {
      const { error: updErr } = await supabase
        .from('billing_cycles')
        .update(scheduledPayload)
        .eq('id', existingScheduled.id)
      if (updErr) return { error: 'Error al actualizar el ciclo programado.' }
    } else {
      const { error: insErr } = await supabase
        .from('billing_cycles')
        .insert(scheduledPayload)
      if (insErr) return { error: 'Error al crear el ciclo programado.' }
    }

    revalidatePath('/renewals')
    revalidatePath(`/clients/${args.clientId}`)
    revalidatePath('/dashboard')
    return { ok: true, mode: 'scheduled' as const }
  }

  // ── Modo inmediato (legacy, conservado para casos especiales): archivar+crear current ──
  const [{ error: archiveErr }, { error: clientErr }] = await Promise.all([
    supabase.from('billing_cycles').update({ status: 'archived' }).eq('id', args.cycleId),
    supabase.from('clients').update({
      status: 'active',
      ...(args.withChanges && args.planId !== clientRow.current_plan_id ? { current_plan_id: args.planId } : {}),
      ...(args.withChanges && args.billingPeriod !== clientRow.billing_period ? { billing_period: args.billingPeriod } : {}),
    }).eq('id', args.clientId),
  ])

  if (archiveErr || clientErr) return { error: 'Error al archivar el ciclo anterior.' }

  const { data: newCycle, error: insertErr } = await supabase
    .from('billing_cycles')
    .insert({
      client_id: args.clientId,
      plan_id_snapshot: args.planId,
      limits_snapshot_json: planLimits,
      rollover_from_previous_json: hasRollover ? rolloverJson : null,
      period_start: periodStart,
      period_end: periodEnd,
      status: 'current',
      payment_status: 'unpaid',
      cambios_budget: planRow.cambios_included + (args.withChanges ? args.cambiosPackages.reduce((s, p) => s + p.qty, 0) : 0),
      cambios_packages_json: args.withChanges ? args.cambiosPackages : [],
      extra_content_json: args.withChanges ? args.extraContent : [],
    })
    .select('id')
    .single()

  if (insertErr || !newCycle?.id) return { error: 'Error al crear el nuevo ciclo.' }

  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    await migrateOpenPipelineItems(supabase, {
      previousCycleId: args.cycleId,
      newCycleId: newCycle.id,
      movedBy: user.id,
    })
  }

  const { data: remainingReqs } = await supabase
    .from('requirements')
    .select('id')
    .eq('billing_cycle_id', args.cycleId)
  const remainingIds = (remainingReqs ?? []).map((r) => r.id)
  if (remainingIds.length > 0) {
    await cleanupCycleStorage(remainingIds)
  }

  revalidatePath('/renewals')
  revalidatePath(`/clients/${args.clientId}`)
  revalidatePath('/dashboard')

  return { ok: true, mode: 'immediate' as const }
}

export async function markCyclePaid(cycleId: string, clientId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('billing_cycles')
    .update({ payment_status: 'paid', payment_date: todayString() })
    .eq('id', cycleId)

  if (error) return { error: 'Error al marcar el ciclo como pagado.' }

  revalidatePath('/renewals')
  revalidatePath(`/clients/${clientId}`)
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function pauseClient(clientId: string, cycleId: string) {
  const supabase = await createClient()
  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    supabase.from('clients').update({ status: 'paused' }).eq('id', clientId),
    supabase.from('billing_cycles').update({ status: 'archived' }).eq('id', cycleId),
  ])

  if (e1 || e2) return { error: 'Error al pausar al cliente.' }

  // Limpiar todos los archivos del ciclo pausado (no hay migración, todo queda archivado)
  const { data: pausedReqs } = await supabase
    .from('requirements')
    .select('id')
    .eq('billing_cycle_id', cycleId)
  const pausedIds = (pausedReqs ?? []).map((r) => r.id)
  if (pausedIds.length > 0) {
    await cleanupCycleStorage(pausedIds)
  }

  revalidatePath('/renewals')
  revalidatePath(`/clients/${clientId}`)
  revalidatePath('/clients')
  revalidatePath('/dashboard')
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────
// Actualizar fechas, estado de pago y estado del ciclo (solo admin)
// ─────────────────────────────────────────────────────────────────
export interface UpdateCycleDatesArgs {
  cycleId: string
  clientId: string
  periodStart: string          // YYYY-MM-DD
  periodEnd: string            // YYYY-MM-DD
  paymentStatus: PaymentStatus
  paymentDate: string | null   // YYYY-MM-DD o null
  paymentStatus2?: PaymentStatus | null
  paymentDate2?: string | null
}

export async function updateCycleDates(args: UpdateCycleDatesArgs) {
  // Auth check — solo admin o supervisor
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }
  const { data: appUser } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (appUser?.role !== 'admin' && appUser?.role !== 'supervisor') {
    return { error: 'Solo admin o supervisor puede modificar el ciclo' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('billing_cycles')
    .update({
      period_start:     args.periodStart,
      period_end:       args.periodEnd,
      payment_status:   args.paymentStatus,
      payment_date:     args.paymentStatus === 'paid' ? (args.paymentDate || todayString()) : null,
      payment_status_2: args.paymentStatus2 ?? null,
      payment_date_2:   args.paymentStatus2 === 'paid' ? (args.paymentDate2 || null) : null,
    })
    .eq('id', args.cycleId)

  if (error) return { error: 'Error al actualizar el ciclo.' }

  revalidatePath(`/clients/${args.clientId}`)
  revalidatePath(`/clients/${args.clientId}/edit`)
  revalidatePath('/renewals')
  revalidatePath('/dashboard')
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────
// Crear un ciclo 'current' desde cero (cliente sin ciclo activo)
// ─────────────────────────────────────────────────────────────────
export interface CreateCurrentCycleArgs {
  clientId: string
  periodStart: string          // YYYY-MM-DD
  periodEnd: string            // YYYY-MM-DD
  paymentStatus: PaymentStatus
  paymentDate: string | null
  paymentStatus2?: PaymentStatus | null
  paymentDate2?: string | null
}

export async function createCurrentCycle(args: CreateCurrentCycleArgs) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }
  const { data: appUser } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (appUser?.role !== 'admin' && appUser?.role !== 'supervisor') {
    return { error: 'Solo admin o supervisor puede crear ciclos' }
  }

  if (!args.periodStart || !args.periodEnd) {
    return { error: 'Las fechas de inicio y fin son obligatorias.' }
  }

  const admin = createAdminClient()

  // Leer plan actual del cliente
  const { data: clientRow } = await admin
    .from('clients')
    .select('current_plan_id')
    .eq('id', args.clientId)
    .single()
  if (!clientRow) return { error: 'Cliente no encontrado.' }

  const { data: planRow } = await admin
    .from('plans')
    .select('*')
    .eq('id', clientRow.current_plan_id)
    .single()
  if (!planRow) return { error: 'Plan del cliente no encontrado.' }

  const planLimits: PlanLimits = planRow.unified_content_limit != null
    ? { ...planRow.limits_json, unified_content_limit: planRow.unified_content_limit }
    : planRow.limits_json

  const { error: insertErr } = await admin
    .from('billing_cycles')
    .insert({
      client_id:              args.clientId,
      plan_id_snapshot:       clientRow.current_plan_id,
      limits_snapshot_json:   planLimits,
      period_start:           args.periodStart,
      period_end:             args.periodEnd,
      status:                 'current',
      payment_status:         args.paymentStatus,
      payment_date:           args.paymentStatus === 'paid' ? (args.paymentDate || todayString()) : null,
      payment_status_2:       args.paymentStatus2 ?? null,
      payment_date_2:         args.paymentStatus2 === 'paid' ? (args.paymentDate2 || null) : null,
      cambios_budget:         planRow.cambios_included,
      cambios_packages_json:  [],
      extra_content_json:     [],
    })

  if (insertErr) return { error: 'Error al crear el ciclo.' }

  // Activar el cliente
  await admin.from('clients').update({ status: 'active' }).eq('id', args.clientId)

  revalidatePath(`/clients/${args.clientId}`)
  revalidatePath(`/clients/${args.clientId}/edit`)
  revalidatePath('/renewals')
  revalidatePath('/dashboard')
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────
// Rescatar requerimientos huérfanos: si en una renovación previa el
// cron NO trasladó los requerimientos en proceso del ciclo archivado al
// nuevo, este action busca esos requerimientos huérfanos y los traslada
// al ciclo current actual con `carried_over=true`.
//
// Idempotente: si un requerimiento ya tiene una "copia trasladada" en el
// ciclo current (mismo title + content_type + carried_over=true), se
// omite para evitar duplicados.
// ─────────────────────────────────────────────────────────────────
export async function rescueOrphanedRequirements(
  clientId: string
): Promise<{ ok: true; rescued: number } | { error: string }> {
  await assertNotImpersonating()
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }
  const { data: appUser } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (appUser?.role !== 'admin' && appUser?.role !== 'supervisor') {
    return { error: 'Solo admin o supervisor puede rescatar requerimientos.' }
  }

  // Ciclo current del cliente
  const { data: currentCycle } = await supabase
    .from('billing_cycles')
    .select('id')
    .eq('client_id', clientId)
    .eq('status', 'current')
    .maybeSingle()
  if (!currentCycle) {
    return { error: 'El cliente no tiene un ciclo current activo. Crea uno antes de rescatar.' }
  }

  // Ciclos archivados del cliente
  const { data: archivedCycles } = await supabase
    .from('billing_cycles')
    .select('id')
    .eq('client_id', clientId)
    .in('status', ['archived', 'pending_renewal'])
  const archivedIds = (archivedCycles ?? []).map((c) => c.id)
  if (archivedIds.length === 0) return { ok: true, rescued: 0 }

  // Requerimientos huérfanos (no anulados, no en publicado_entregado, tipos pipeline)
  const { data: orphans } = await supabase
    .from('requirements')
    .select('id, content_type, phase, title, review_started_at, assigned_to, includes_story, deadline')
    .in('billing_cycle_id', archivedIds)
    .eq('voided', false)
    .neq('phase', 'publicado_entregado')
    .in('content_type', PIPELINE_CONTENT_TYPES)

  if (!orphans || orphans.length === 0) return { ok: true, rescued: 0 }

  // Traslados ya existentes en el ciclo current (para evitar duplicados): match por title + content_type
  const { data: existingCarried } = await supabase
    .from('requirements')
    .select('title, content_type')
    .eq('billing_cycle_id', currentCycle.id)
    .eq('carried_over', true)
  const existingKeys = new Set(
    (existingCarried ?? []).map((r) => `${r.content_type}::${(r.title ?? '').trim().toLowerCase()}`)
  )

  let rescued = 0
  for (const item of orphans) {
    const key = `${item.content_type}::${(item.title ?? '').trim().toLowerCase()}`
    if (existingKeys.has(key)) continue

    const { data: newReq, error: insErr } = await supabase
      .from('requirements')
      .insert({
        billing_cycle_id: currentCycle.id,
        content_type: item.content_type,
        phase: item.phase as Phase,
        carried_over: true,
        registered_by_user_id: user.id,
        over_limit: false,
        voided: false,
        title: item.title ?? '',
        review_started_at: item.review_started_at ?? null,
        assigned_to: (item.assigned_to as string[] | null) ?? null,
        includes_story: item.includes_story ?? false,
        deadline: item.deadline ?? null,
      })
      .select('id')
      .single()

    if (insErr || !newReq) {
      console.error('[rescueOrphanedRequirements]', insErr)
      continue
    }

    // Copiar logs históricos
    const { data: oldLogs } = await supabase
      .from('requirement_phase_logs')
      .select('from_phase, to_phase, moved_by, notes, created_at')
      .eq('requirement_id', item.id)
      .order('created_at', { ascending: true })

    for (const log of oldLogs ?? []) {
      await supabase.from('requirement_phase_logs').insert({
        requirement_id: newReq.id,
        from_phase: log.from_phase as Phase | null,
        to_phase: log.to_phase as Phase,
        moved_by: log.moved_by,
        notes: log.notes,
        created_at: log.created_at,
      })
    }

    // Log de rescate
    await supabase.from('requirement_phase_logs').insert({
      requirement_id: newReq.id,
      from_phase: null,
      to_phase: item.phase as Phase,
      moved_by: user.id,
      notes: 'Rescatado del ciclo anterior (traslado manual)',
    })

    rescued++
  }

  revalidatePath(`/clients/${clientId}`)
  revalidatePath('/pipeline')
  revalidatePath('/dashboard')
  return { ok: true, rescued }
}
