/**
 * Cálculo puro de planilla — El Salvador.
 *
 * Aplica deducciones ISSS, AFP e ISR sobre el bruto mensual del empleado.
 * Todo el cálculo es testable sin Supabase.
 *
 * Referencias legales:
 *   - ISSS (Ley del Seguro Social, ref. 2021): 3% emp / 7.5% pat sobre min(bruto, $1000).
 *   - AFP (Ley Integral SAP, reforma 2022): 7.25% emp / 8.75% pat sobre IBC.
 *   - ISR mensual asalariados (Reglamento de Retención, Decreto 75/1992):
 *     base = bruto - ISSS_emp - AFP_emp. Tabla progresiva de 4 tramos.
 *
 * Todos los rates y brackets son configurables vía `payroll_fiscal_config`.
 */

import type { IsrBracket, PayrollFiscalConfig } from '@/types/db'

/** Redondea a 2 decimales (USD cent precision). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export interface PayrollInputs {
  /** Salario base mensual del empleado (mensual_fijo) o cálculo de horas. */
  baseSalaryUsd: number
  /** Horas extras del período (no aplica si mensual_fijo). */
  extraHours?: number
  /** Tarifa de horas extras (snapshot de hourly_rate al momento). */
  extraHoursRateUsd?: number
  /** Bono o pago adicional gravable. */
  bonusUsd?: number
  /** Anticipos u otras deducciones no fiscales. */
  otherDeductionsUsd?: number
}

export interface PayrollCalculation {
  baseSalaryUsd: number
  extraHoursAmountUsd: number
  bonusUsd: number
  /** Bruto antes de deducciones fiscales (incluye bonos y horas extras). */
  grossTotalUsd: number

  isssEmployeeUsd: number
  afpEmployeeUsd: number
  isrUsd: number
  otherDeductionsUsd: number
  totalDeductionsUsd: number

  /** Pago neto al empleado. */
  netPayUsd: number

  /** Aportes patronales (no afectan el neto, pero se reportan). */
  isssEmployerUsd: number
  afpEmployerUsd: number
  /** Costo total del empleado al patrono (bruto + aportes patronales). */
  employerCostUsd: number
}

/**
 * Aplica los tramos progresivos del ISR a una base gravable mensual.
 * El primer tramo aplicable (where from <= base <= to) define la retención.
 */
export function applyIsrBrackets(taxBase: number, brackets: IsrBracket[]): number {
  if (taxBase <= 0) return 0
  for (const b of brackets) {
    const upper = b.to ?? Number.POSITIVE_INFINITY
    if (taxBase >= b.from && taxBase <= upper) {
      const taxable = Math.max(0, taxBase - b.baseSubtract)
      return round2(taxable * b.rate + b.fixed)
    }
  }
  // Si la base supera el último tramo y por alguna razón no matchea,
  // usar el último tramo de fallback.
  const last = brackets[brackets.length - 1]
  if (!last) return 0
  return round2(Math.max(0, taxBase - last.baseSubtract) * last.rate + last.fixed)
}

/** Calcula la planilla de un empleado con la configuración fiscal dada. */
export function calculatePayroll(
  inputs: PayrollInputs,
  config: PayrollFiscalConfig,
): PayrollCalculation {
  const base = round2(Math.max(0, inputs.baseSalaryUsd))
  const extraHours = Math.max(0, inputs.extraHours ?? 0)
  const extraRate = Math.max(0, inputs.extraHoursRateUsd ?? 0)
  const extraAmount = round2(extraHours * extraRate)
  const bonus = round2(Math.max(0, inputs.bonusUsd ?? 0))
  const otherDeductions = round2(Math.max(0, inputs.otherDeductionsUsd ?? 0))

  const gross = round2(base + extraAmount + bonus)

  // ISSS: aplica sobre min(gross, cap). Empleado 3%, patrono 7.5%.
  const isssBase = Math.min(gross, Number(config.isss_cap_salary_usd))
  const isssEmployee = round2(isssBase * Number(config.isss_employee_rate))
  const isssEmployer = round2(isssBase * Number(config.isss_employer_rate))

  // AFP: aplica sobre gross (con tope si está configurado).
  const afpCap = config.afp_cap_salary_usd != null
    ? Math.min(gross, Number(config.afp_cap_salary_usd))
    : gross
  const afpEmployee = round2(afpCap * Number(config.afp_employee_rate))
  const afpEmployer = round2(afpCap * Number(config.afp_employer_rate))

  // ISR: base gravable = bruto - ISSS_emp - AFP_emp
  const taxBase = round2(gross - isssEmployee - afpEmployee)
  const isr = applyIsrBrackets(taxBase, config.isr_brackets_json as IsrBracket[])

  const totalDeductions = round2(isssEmployee + afpEmployee + isr + otherDeductions)
  const netPay = round2(gross - totalDeductions)
  const employerCost = round2(gross + isssEmployer + afpEmployer)

  return {
    baseSalaryUsd: base,
    extraHoursAmountUsd: extraAmount,
    bonusUsd: bonus,
    grossTotalUsd: gross,
    isssEmployeeUsd: isssEmployee,
    afpEmployeeUsd: afpEmployee,
    isrUsd: isr,
    otherDeductionsUsd: otherDeductions,
    totalDeductionsUsd: totalDeductions,
    netPayUsd: netPay,
    isssEmployerUsd: isssEmployer,
    afpEmployerUsd: afpEmployer,
    employerCostUsd: employerCost,
  }
}

/**
 * Calcula un pago de SERVICIOS PROFESIONALES (honorarios).
 *
 * Régimen distinto al asalariado: solo se retiene ISR (10% configurable) sobre el
 * monto bruto. No hay ISSS, ni AFP, ni aportes patronales. Devuelve la misma forma
 * `PayrollCalculation` que el cálculo normal para reutilizar las columnas de
 * `payroll_items` y la UI; los campos de ISSS/AFP/patrono quedan en 0.
 */
export function calculateProfessionalServicesPayroll(
  inputs: { baseUsd: number; otherDeductionsUsd?: number },
  isrRate: number,
): PayrollCalculation {
  const gross = round2(Math.max(0, inputs.baseUsd))
  const otherDeductions = round2(Math.max(0, inputs.otherDeductionsUsd ?? 0))
  const isr = round2(gross * Math.max(0, isrRate))
  const totalDeductions = round2(isr + otherDeductions)
  const netPay = round2(gross - totalDeductions)

  return {
    baseSalaryUsd: gross,
    extraHoursAmountUsd: 0,
    bonusUsd: 0,
    grossTotalUsd: gross,
    isssEmployeeUsd: 0,
    afpEmployeeUsd: 0,
    isrUsd: isr,
    otherDeductionsUsd: otherDeductions,
    totalDeductionsUsd: totalDeductions,
    netPayUsd: netPay,
    isssEmployerUsd: 0,
    afpEmployerUsd: 0,
    employerCostUsd: gross,
  }
}

/** Etiqueta legible mes/año en español SV. */
export function formatPeriodLabel(year: number, month: number): string {
  const labels = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ]
  return `${labels[month - 1]} ${year}`
}

/** Formato moneda USD para tablas de planilla. */
export function fmtUsd(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}
