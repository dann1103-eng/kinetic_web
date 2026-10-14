/**
 * group-membership-sync.ts — la membresía de un grupo matutino sigue al ciclo
 * del MES EN CURSO.
 *
 * `program_group_members` es una bandera sin fecha ("el niño está activo en este
 * grupo"), pero el grupo de un niño se decide POR MES, en su ciclo. Cuando el
 * ciclo del mes siguiente se genera por adelantado (lo normal: se generan a mitad
 * de mes) y el niño cambia de grupo, las RPC de ciclo movían la membresía de
 * inmediato — semanas antes de que ese mes empezara. Resultado (oct 2026): dos
 * niños con ciclo de octubre en BK2 y de noviembre en BK1 aparecían en la lista
 * de BK1 desde el 12-oct y desaparecían de la de BK2.
 *
 * Invariante que impone este módulo:
 *
 *     membresía activa del niño = grupo de su ciclo del mes en curso (SV)
 *
 * - Un salto prematuro se revierte (el ciclo de octubre manda en octubre).
 * - El cambio de grupo de noviembre se aplica cuando noviembre llega.
 * - Solo corrige una membresía ACTIVA con el grupo equivocado. No resucita a un
 *   niño que alguien quitó a mano ("Quitar" en /operacion/grupos) ni toca a uno
 *   sin ciclo ese mes.
 * - Los `attendance_days` de la membresía solo se tocan cuando cambia el grupo:
 *   si ya está en el grupo correcto, los días que alguien ajustó a mano quedan.
 *
 * La parte pura (`planMembershipMoves`, `isCycleMonthInFuture`) no sabe de
 * Supabase; el glue (`syncGroupMembershipsToCurrentMonth`) la aplica.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/db'
import { fetchAllPaged } from '@/lib/supabase/paged'
import { periodMonthOfSV } from './billing/agenda-charge-sync'

export interface ActiveMembershipLite {
  child_id: string
  group_id: string
}

export interface CurrentCycleGroupLite {
  child_id: string
  program_group_id: string | null
  /** Días del niño en el grupo según el ciclo. null = el ciclo no los trae. */
  attendance_days: string[] | null
}

export interface MembershipMove {
  child_id: string
  from_group_id: string
  to_group_id: string
  /** null = conservar los días que ya tenga la membresía destino. */
  attendance_days: string[] | null
}

/**
 * Qué membresías hay que mover para que cada niño esté en el grupo de su ciclo
 * del mes en curso. Función pura.
 */
export function planMembershipMoves(
  activeMemberships: ActiveMembershipLite[],
  currentCycles: CurrentCycleGroupLite[],
): MembershipMove[] {
  const targetByChild = new Map<string, CurrentCycleGroupLite>()
  for (const c of currentCycles) {
    if (c.program_group_id) targetByChild.set(c.child_id, c)
  }

  const groupsByChild = new Map<string, string[]>()
  for (const m of activeMemberships) {
    const arr = groupsByChild.get(m.child_id) ?? []
    arr.push(m.group_id)
    groupsByChild.set(m.child_id, arr)
  }

  const moves: MembershipMove[] = []
  for (const [childId, groups] of groupsByChild) {
    const target = targetByChild.get(childId)
    if (!target || !target.program_group_id) continue
    // Si alguna membresía activa ya es la correcta no se mueve nada: el estado
    // con dos activas no debería existir (índice único) y no hay que empeorarlo.
    if (groups.includes(target.program_group_id)) continue
    moves.push({
      child_id: childId,
      from_group_id: groups[0],
      to_group_id: target.program_group_id,
      attendance_days: target.attendance_days,
    })
  }
  return moves
}

/**
 * ¿El mes del ciclo es posterior al mes en curso en San Salvador? Se mide en SV,
 * no en UTC: Vercel corre en UTC y la noche del 31 ya es "mes siguiente" allá.
 * Acepta 'YYYY-MM' o 'YYYY-MM-DD'.
 */
export function isCycleMonthInFuture(periodMonth: string, nowIso: string): boolean {
  return periodMonth.slice(0, 7) > periodMonthOfSV(nowIso).slice(0, 7)
}

// ── Glue con la BD (cliente admin: el rol ya se validó en quien llama) ─────────

type AdminClient = SupabaseClient<Database>

/**
 * Deja al niño activo en `groupId` y en ningún otro. Idempotente (mig 0152):
 * desactiva TODA membresía activa del niño y luego reactiva/crea la del destino,
 * así nunca choca con el índice único (child_id) WHERE active.
 *
 * `attendanceDays` null = conservar los días de la membresía destino si ya existe
 * (o dejarla vacía = todos los días del grupo si es nueva).
 */
export async function applyGroupMembership(
  admin: AdminClient,
  childId: string,
  groupId: string,
  attendanceDays: string[] | null,
): Promise<void> {
  await admin
    .from('program_group_members')
    .update({ active: false })
    .eq('child_id', childId)
    .eq('active', true)

  const { data: existing } = await admin
    .from('program_group_members')
    .select('id')
    .eq('child_id', childId)
    .eq('group_id', groupId)
    .maybeSingle()

  if (existing) {
    await admin
      .from('program_group_members')
      .update({ active: true, ...(attendanceDays ? { attendance_days: attendanceDays } : {}) })
      .eq('child_id', childId)
      .eq('group_id', groupId)
  } else {
    await admin.from('program_group_members').insert({
      group_id: groupId,
      child_id: childId,
      attendance_days: attendanceDays ?? [],
      active: true,
    })
  }
}

/**
 * Aplica `planMembershipMoves` sobre la BD. `childIds` limita el alcance (p. ej.
 * justo después de generar el ciclo de un niño); sin él revisa a todos.
 *
 * Es barata (dos lecturas chicas) e idempotente, por eso se llama sin miedo tras
 * generar/editar ciclos y al abrir la lista de asistencia. Nunca lanza: un fallo
 * acá no debe tumbar quien la llama; se registra y se devuelve 0.
 */
export async function syncGroupMembershipsToCurrentMonth(
  admin: AdminClient,
  opts: { childIds?: string[]; now?: Date } = {},
): Promise<{ moved: number }> {
  try {
    if (opts.childIds && opts.childIds.length === 0) return { moved: 0 }
    const month = periodMonthOfSV((opts.now ?? new Date()).toISOString())

    const cycles = await fetchAllPaged<CurrentCycleGroupLite>(() => {
      let q = admin
        .from('monthly_session_cycles')
        .select('child_id, program_group_id, attendance_days')
        .eq('period_month', month)
        .neq('status', 'cancelled')
        .not('program_group_id', 'is', null)
        .order('id')
      if (opts.childIds) q = q.in('child_id', opts.childIds)
      return q
    }, 'monthly_session_cycles (sync membresías)')
    if (cycles.length === 0) return { moved: 0 }

    const childIds = Array.from(new Set(cycles.map((c) => c.child_id)))
    const memberships = await fetchAllPaged<ActiveMembershipLite>(
      () =>
        admin
          .from('program_group_members')
          .select('child_id, group_id')
          .eq('active', true)
          .in('child_id', childIds)
          .order('id'),
      'program_group_members (sync membresías)',
    )

    const moves = planMembershipMoves(memberships, cycles)
    for (const m of moves) {
      await applyGroupMembership(admin, m.child_id, m.to_group_id, m.attendance_days)
    }
    return { moved: moves.length }
  } catch (err) {
    console.error('[syncGroupMembershipsToCurrentMonth]', err)
    return { moved: 0 }
  }
}
