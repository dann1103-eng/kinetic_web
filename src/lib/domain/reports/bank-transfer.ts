/**
 * Builder puro del documento de transferencias bancarias (planilla de números de
 * cuenta). Consolida, por persona, el neto de la planilla normal (SALARIO) + el
 * neto de la planilla de servicios profesionales (HONORARIOS) + OTROS (manual)
 * en una sola fila, con la fila de totales.
 *
 * Es puro y testeable sin Supabase: el server le pasa los netos por usuario y los
 * datos bancarios; este módulo arma filas + totales.
 */

export interface BankTransferUser {
  id: string
  full_name: string
  dui: string | null
  nit: string | null
  bank_name: string | null
  account_type: string | null
  account_number: string | null
}

export interface BankTransferRow {
  userId: string
  nombre: string
  /** DUI y/o NIT combinados ("dui / nit"). */
  duiNit: string
  banco: string
  tipoCuenta: string
  numeroCuenta: string
  salario: number
  honorarios: number
  otros: number
  total: number
  /** Tiene monto pero le faltan banco o número de cuenta. */
  missingBank: boolean
}

export interface BankTransferTotals {
  salario: number
  honorarios: number
  otros: number
  total: number
}

export interface BuildBankTransferInput {
  users: BankTransferUser[]
  /** Neto de la planilla normal del mes, por user_id. */
  normalNetByUser: Map<string, number>
  /** Neto de la planilla de servicios profesionales del mes, por user_id. */
  spNetByUser: Map<string, number>
  /** Monto manual de "OTROS" por user_id (viáticos, reintegros, etc.). */
  otrosByUser: Map<string, number>
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function duiNitOf(u: BankTransferUser): string {
  return [u.dui, u.nit].filter((x): x is string => !!x && x.trim() !== '').join(' / ')
}

export function buildBankTransferRows(
  input: BuildBankTransferInput,
): { rows: BankTransferRow[]; totals: BankTransferTotals } {
  const rows: BankTransferRow[] = []
  for (const u of input.users) {
    const salario = round2(input.normalNetByUser.get(u.id) ?? 0)
    const honorarios = round2(input.spNetByUser.get(u.id) ?? 0)
    const otros = round2(input.otrosByUser.get(u.id) ?? 0)
    // Excluir a quien no tiene ningún monto a depositar.
    if (salario === 0 && honorarios === 0 && otros === 0) continue
    const total = round2(salario + honorarios + otros)
    const banco = u.bank_name ?? ''
    const numeroCuenta = u.account_number ?? ''
    rows.push({
      userId: u.id,
      nombre: u.full_name,
      duiNit: duiNitOf(u),
      banco,
      tipoCuenta: u.account_type ?? '',
      numeroCuenta,
      salario,
      honorarios,
      otros,
      total,
      missingBank: banco.trim() === '' || numeroCuenta.trim() === '',
    })
  }

  rows.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  const totals: BankTransferTotals = {
    salario: round2(rows.reduce((s, r) => s + r.salario, 0)),
    honorarios: round2(rows.reduce((s, r) => s + r.honorarios, 0)),
    otros: round2(rows.reduce((s, r) => s + r.otros, 0)),
    total: round2(rows.reduce((s, r) => s + r.total, 0)),
  }

  return { rows, totals }
}
