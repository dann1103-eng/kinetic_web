/**
 * Lectura del servidor para el documento de transferencias: junta las planillas
 * SELLADAS/PAGADAS (normal + servicios profesionales) de un mes y arma, por
 * usuario, el neto de cada una + sus datos bancarios. La columna OTROS es manual
 * (no sale de aquí). Reusable por la página y por las rutas de exportación.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/db'
import { buildBankTransferRows, type BankTransferUser } from './bank-transfer'

export interface BankTransferData {
  users: BankTransferUser[]
  /** Neto de la planilla normal del mes, por user_id (serializable). */
  normalNet: Record<string, number>
  /** Neto de la planilla de servicios profesionales del mes, por user_id. */
  spNet: Record<string, number>
  hasNormalRun: boolean
  hasSpRun: boolean
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export async function getBankTransferData(
  supabase: SupabaseClient<Database>,
  year: number,
  month: number,
): Promise<BankTransferData> {
  const { data: runsRaw } = await supabase
    .from('payroll_runs')
    .select('id, payroll_type, status')
    .eq('period_year', year)
    .eq('period_month', month)
    .in('status', ['sealed', 'paid'])
  const runs = runsRaw ?? []

  const spRunIds = new Set(
    runs.filter((r) => r.payroll_type === 'servicios_profesionales').map((r) => r.id),
  )
  const normalRunIds = new Set(
    runs.filter((r) => r.payroll_type !== 'servicios_profesionales').map((r) => r.id),
  )
  const allRunIds = runs.map((r) => r.id)

  const normalNet: Record<string, number> = {}
  const spNet: Record<string, number> = {}
  const userIds = new Set<string>()

  if (allRunIds.length > 0) {
    const { data: itemsRaw } = await supabase
      .from('payroll_items')
      .select('payroll_run_id, user_id, net_pay_usd')
      .in('payroll_run_id', allRunIds)
    for (const it of itemsRaw ?? []) {
      if (!it.user_id) continue
      userIds.add(it.user_id)
      const net = Number(it.net_pay_usd ?? 0)
      if (spRunIds.has(it.payroll_run_id)) {
        spNet[it.user_id] = round2((spNet[it.user_id] ?? 0) + net)
      } else if (normalRunIds.has(it.payroll_run_id)) {
        normalNet[it.user_id] = round2((normalNet[it.user_id] ?? 0) + net)
      }
    }
  }

  let users: BankTransferUser[] = []
  if (userIds.size > 0) {
    const { data: usersRaw } = await supabase
      .from('users')
      .select('id, full_name, dui, nit, bank_name, account_type, account_number')
      .in('id', Array.from(userIds))
    users = (usersRaw ?? []) as BankTransferUser[]
  }

  return {
    users,
    normalNet,
    spNet,
    hasNormalRun: normalRunIds.size > 0,
    hasSpRun: spRunIds.size > 0,
  }
}

/** Parsea el querystring `otros` (JSON `{ userId: monto }`) a un Map. */
export function parseOtrosParam(s: string | null): Map<string, number> {
  const map = new Map<string, number>()
  if (!s) return map
  try {
    const obj = JSON.parse(s) as Record<string, unknown>
    for (const [k, v] of Object.entries(obj)) {
      const n = Number(v)
      if (Number.isFinite(n) && n !== 0) map.set(k, n)
    }
  } catch {
    // JSON inválido → sin otros
  }
  return map
}

/** Junta datos del mes + OTROS y arma las filas/totales del documento (rutas de export). */
export async function resolveBankTransferDoc(
  supabase: SupabaseClient<Database>,
  year: number,
  month: number,
  otros: Map<string, number>,
): Promise<ReturnType<typeof buildBankTransferRows>> {
  const data = await getBankTransferData(supabase, year, month)
  return buildBankTransferRows({
    users: data.users,
    normalNetByUser: new Map(Object.entries(data.normalNet)),
    spNetByUser: new Map(Object.entries(data.spNet)),
    otrosByUser: otros,
  })
}
