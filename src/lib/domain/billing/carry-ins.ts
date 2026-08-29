/**
 * Qué se arrastra de meses anteriores al cobro de este mes.
 *
 * Son dos conceptos distintos que viajan igual:
 *
 * - **Recargo por mora** (mig 0175): la multa por pagar tarde un mes NO infla la
 *   factura de ese mes; se cobra en la siguiente. Una familia con
 *   `late_fee_exempt` no arrastra ninguno.
 * - **Ajuste de plan** (migs 0177/0178): un mes YA pagado que después cambió de
 *   monto arrastra la diferencia — positiva se cobra, negativa se acredita. La
 *   exoneración de mora **no** aplica acá: es plata que se cobró de más o de
 *   menos, no una multa.
 *
 * En los dos casos, si el ciclo ya tiene el arrastre registrado (`*_carried_in_usd`)
 * ese valor manda y NO se vuelven a mirar los meses anteriores: pasa al regenerar
 * una factura, y volver a sumarlos los cobraría dos veces.
 *
 * Esta función solo **decide**. Marcar los ciclos de origen como ya cobrados
 * (`*_carried_at`) es responsabilidad de quien crea la factura — por eso la
 * previsualización puede usar esto sin escribir nada.
 */

export interface CarryInLine {
  description: string
  /** Positivo = cargo; negativo = crédito a favor de la familia. */
  amount: number
}

export interface CarryInInput {
  cycle: {
    period_month: string
    surcharge_carried_in_usd?: number | null
    billing_adjustment_carried_in_usd?: number | null
  }
  familyLateFeeExempt: boolean
  /** Ciclos anteriores pagados con recargo sin arrastrar, de más viejo a más nuevo. */
  pendingSurchargeCycles: { id: string; period_month: string; surcharge_amount_usd: number }[]
  /** Ciclos anteriores pagados con ajuste sin arrastrar, de más viejo a más nuevo. */
  pendingAdjustmentCycles: { id: string; period_month: string; billing_adjustment_usd: number }[]
}

export interface CarryInResult {
  lines: CarryInLine[]
  surchargeTotal: number
  /** Ciclos de los que salió el recargo: hay que marcarlos al facturar. */
  surchargeFromCycleIds: string[]
  adjustmentTotal: number
  /** Ciclos de los que salió el ajuste: hay que marcarlos al facturar. */
  adjustmentFromCycleIds: string[]
}

/**
 * "agosto de 2026" a partir de 'YYYY-MM-01'.
 *
 * `period_month` es una columna de solo fecha, así que va SIN `timeZone`:
 * aplicarle una zona correría el día y, en un día 1, el mes. Es el caso que el
 * encabezado de `@/lib/format/datetime-sv` excluye expresamente.
 */
export function periodLabel(periodMonth: string): string {
  return new Date(`${periodMonth.slice(0, 10)}T00:00:00`).toLocaleDateString('es-SV', {
    month: 'long',
    year: 'numeric',
  })
}

export function computeCarryIns(input: CarryInInput): CarryInResult {
  const lines: CarryInLine[] = []
  let surchargeTotal = 0
  const surchargeFromCycleIds: string[] = []
  let adjustmentTotal = 0
  const adjustmentFromCycleIds: string[] = []

  const registeredSurcharge = Number(input.cycle.surcharge_carried_in_usd ?? 0)
  if (registeredSurcharge > 0) {
    surchargeTotal = registeredSurcharge
    lines.push({
      description: 'Recargo por mora de mensualidad anterior',
      amount: registeredSurcharge,
    })
  } else if (!input.familyLateFeeExempt) {
    for (const prev of input.pendingSurchargeCycles) {
      const amount = Number(prev.surcharge_amount_usd)
      surchargeTotal += amount
      surchargeFromCycleIds.push(prev.id)
      lines.push({
        description: `Recargo por mora — mensualidad de ${periodLabel(prev.period_month)} pagada tarde`,
        amount,
      })
    }
  }

  const registeredAdjustment = Number(input.cycle.billing_adjustment_carried_in_usd ?? 0)
  if (registeredAdjustment !== 0) {
    adjustmentTotal = registeredAdjustment
    lines.push({
      description:
        registeredAdjustment >= 0
          ? 'Ajuste de mensualidad anterior (cambio de plan)'
          : 'Crédito de mensualidad anterior (cambio de plan)',
      amount: registeredAdjustment,
    })
  } else {
    for (const prev of input.pendingAdjustmentCycles) {
      const amount = Number(prev.billing_adjustment_usd)
      adjustmentTotal += amount
      adjustmentFromCycleIds.push(prev.id)
      lines.push({
        description:
          amount >= 0
            ? `Ajuste — mensualidad de ${periodLabel(prev.period_month)} (cambio de plan tras el pago)`
            : `Crédito — mensualidad de ${periodLabel(prev.period_month)} (cambio de plan tras el pago)`,
        amount,
      })
    }
  }

  return {
    lines,
    surchargeTotal,
    surchargeFromCycleIds,
    adjustmentTotal,
    adjustmentFromCycleIds,
  }
}
