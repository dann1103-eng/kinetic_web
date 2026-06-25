'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import {
  calculatePayroll,
  calculateProfessionalServicesPayroll,
  round2,
} from '@/lib/domain/payroll/calculation'
import {
  sumProfessionalServicesPay,
  professionalServicesBaseFor,
  type TherapyPayTotals,
  type CompletedTherapyForPay,
} from '@/lib/domain/payroll/professional-services'
import { fromZonedTime } from 'date-fns-tz'
import type {
  PayrollFiscalConfig,
  PayrollItem,
  PayrollItemUserSnapshot,
  PayrollRun,
  PayrollType,
  UserRole,
} from '@/types/db'

const PAYROLL_ROLES: UserRole[] = ['admin', 'directora', 'contable', 'recepcion']

async function getActor() {
  const supabase = await createClient()
  const ctx = await getEffectiveUser()
  if (!ctx) throw new Error('No autenticado')
  return {
    supabase,
    user: { id: ctx.appUser.id, role: ctx.appUser.role, full_name: ctx.appUser.full_name },
  }
}

function canManagePayroll(role: UserRole): boolean {
  return PAYROLL_ROLES.includes(role)
}

// ──────────────────────────────────────────────────────────────────────────
// Config fiscal
// ──────────────────────────────────────────────────────────────────────────

export async function getActiveFiscalConfig(): Promise<PayrollFiscalConfig | null> {
  const { supabase } = await getActor()
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await supabase
    .from('payroll_fiscal_config')
    .select('*')
    .lte('effective_from', today)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as PayrollFiscalConfig | null) ?? null
}

export async function updateActiveFiscalConfig(
  input: {
    isssEmployeeRate: number
    isssEmployerRate: number
    isssCapSalaryUsd: number
    afpEmployeeRate: number
    afpEmployerRate: number
    afpCapSalaryUsd: number | null
    isrBrackets: PayrollFiscalConfig['isr_brackets_json']
    professionalServicesIsrRate: number
    notes?: string | null
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, user } = await getActor()
  if (!canManagePayroll(user.role)) return { ok: false, error: 'Solo admin/directora/contable/recepción pueden modificar la configuración fiscal.' }

  // Crea nueva versión "activa desde hoy". Mantiene el historial.
  const today = new Date().toISOString().slice(0, 10)
  const { error } = await supabase
    .from('payroll_fiscal_config')
    .upsert(
      {
        effective_from: today,
        isss_employee_rate: input.isssEmployeeRate,
        isss_employer_rate: input.isssEmployerRate,
        isss_cap_salary_usd: input.isssCapSalaryUsd,
        afp_employee_rate: input.afpEmployeeRate,
        afp_employer_rate: input.afpEmployerRate,
        afp_cap_salary_usd: input.afpCapSalaryUsd,
        isr_brackets_json: input.isrBrackets,
        professional_services_isr_rate: input.professionalServicesIsrRate,
        notes: input.notes ?? null,
        created_by_user_id: user.id,
      },
      { onConflict: 'effective_from' },
    )
  if (error) return { ok: false, error: error.message }
  revalidatePath('/reportes/contabilidad/configuracion')
  return { ok: true }
}

// ──────────────────────────────────────────────────────────────────────────
// Salarios por usuario
// ──────────────────────────────────────────────────────────────────────────

export interface UpdateUserSalaryInput {
  userId: string
  monthlySalaryUsd: number | null
  /** Base fija mensual de la planilla de servicios profesionales. */
  professionalServicesBaseUsd?: number | null
  hourlyRateUsd: number | null
  contractType: 'mensual_fijo' | 'por_terapias' | 'sin_contrato'
  inNormalPayroll: boolean
  inProfessionalServicesPayroll: boolean
  dui: string | null
  isssNumber: string | null
  afpNumber: string | null
  afpProvider: 'crecer' | 'confia' | null
  hireDate: string | null
}

export async function updateUserSalary(
  input: UpdateUserSalaryInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user } = await getActor()
  if (!canManagePayroll(user.role)) return { ok: false, error: 'No autorizado.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('users')
    .update({
      monthly_salary_usd: input.monthlySalaryUsd,
      professional_services_base_usd: input.professionalServicesBaseUsd ?? null,
      hourly_rate_usd: input.hourlyRateUsd,
      contract_type: input.contractType,
      in_normal_payroll: input.inNormalPayroll,
      in_professional_services_payroll: input.inProfessionalServicesPayroll,
      dui: input.dui,
      isss_number: input.isssNumber,
      afp_number: input.afpNumber,
      afp_provider: input.afpProvider,
      hire_date: input.hireDate,
    })
    .eq('id', input.userId)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/reportes/contabilidad/configuracion')
  revalidatePath('/users')
  return { ok: true }
}

// ──────────────────────────────────────────────────────────────────────────
// Payroll runs — crear, sellar, marcar pagado, cancelar
// ──────────────────────────────────────────────────────────────────────────

export async function createPayrollRun(input: {
  year: number
  month: number
  payrollType: PayrollType
  /** NULL/undefined = mensual; 1 = primera quincena (1-15); 2 = segunda (16-fin). */
  periodHalf?: 1 | 2 | null
  notes?: string | null
}): Promise<{ ok: true; run: PayrollRun } | { ok: false; error: string }> {
  const { supabase, user } = await getActor()
  if (!canManagePayroll(user.role)) return { ok: false, error: 'No autorizado.' }
  if (input.month < 1 || input.month > 12) return { ok: false, error: 'Mes inválido.' }
  if (input.payrollType !== 'normal' && input.payrollType !== 'servicios_profesionales') {
    return { ok: false, error: 'Tipo de planilla inválido.' }
  }
  const isSp = input.payrollType === 'servicios_profesionales'
  const half: 1 | 2 | null = input.periodHalf === 1 || input.periodHalf === 2 ? input.periodHalf : null
  // Quincenal prorratea el sueldo fijo a la mitad; mensual = 1.
  const baseFactor = half === null ? 1 : 0.5

  // Validar que no exista una activa de ESTE tipo + quincena en el período.
  let existingQuery = supabase
    .from('payroll_runs')
    .select('id, status')
    .eq('period_year', input.year)
    .eq('period_month', input.month)
    .eq('payroll_type', input.payrollType)
    .neq('status', 'cancelled')
  existingQuery = half === null ? existingQuery.is('period_half', null) : existingQuery.eq('period_half', half)
  const { data: existing } = await existingQuery.maybeSingle()
  if (existing) return { ok: false, error: 'Ya existe una planilla activa de este tipo para ese período/quincena.' }

  const admin = createAdminClient()
  const { data: created, error: createErr } = await admin
    .from('payroll_runs')
    .insert({
      period_year: input.year,
      period_month: input.month,
      period_half: half,
      payroll_type: input.payrollType,
      status: 'draft',
      notes: input.notes ?? null,
      created_by_user_id: user.id,
    })
    .select('*')
    .single()
  if (createErr || !created) return { ok: false, error: createErr?.message ?? 'No se pudo crear la planilla.' }

  // Cargar config fiscal activa
  const config = await getActiveFiscalConfig()
  if (!config) {
    // Rollback: borra la run draft
    await admin.from('payroll_runs').delete().eq('id', created.id)
    return { ok: false, error: 'No hay configuración fiscal activa.' }
  }

  // Empleados según la planilla: el flag de pertenencia decide quién entra.
  const membershipColumn = isSp ? 'in_professional_services_payroll' : 'in_normal_payroll'
  const { data: empleados } = await admin
    .from('users')
    .select('id, full_name, email, role, contract_type, in_normal_payroll, in_professional_services_payroll, monthly_salary_usd, professional_services_base_usd, hourly_rate_usd, dui, isss_number, afp_number, afp_provider, hire_date')
    .eq(membershipColumn, true)
    .neq('role', 'client')
    .neq('role', 'family')

  // Para servicios profesionales: pago POR CANTIDAD de terapias (no por horas):
  // cada terapia completada aporta su tarifa de catálogo (cost_usd por service_type).
  // Solo-SP → todas las terapias completadas; ambos (también en normal) → solo las is_extra.
  let spTotals: TherapyPayTotals = { all: new Map(), extra: new Map(), count: new Map() }
  if (isSp) {
    const { data: catalogRaw } = await admin
      .from('service_catalog')
      .select('service_type, cost_usd')
      .eq('category', 'terapia_individual')
      .eq('active', true)
    const costByService = new Map<string, number>()
    for (const c of catalogRaw ?? []) {
      if (c.service_type) costByService.set(c.service_type, Number(c.cost_usd ?? 0))
    }

    // Tarifa por tipo de evaluación, indexada por código (cost_usd del catálogo).
    const { data: evalCatalogRaw } = await admin
      .from('service_catalog')
      .select('code, cost_usd')
      .in('category', ['evaluacion', 'evaluacion_dx_tea', 'evaluacion_psicologica'])
      .eq('active', true)
    const costByEvalCode = new Map<string, number>()
    for (const c of evalCatalogRaw ?? []) {
      if (c.code) costByEvalCode.set(c.code, Number(c.cost_usd ?? 0))
    }

    // Ventana del período: mensual = todo el mes; quincena 1 = días 1-15;
    // quincena 2 = día 16 al fin de mes.
    const startDay = half === 2 ? 16 : 1
    const startDate = new Date(input.year, input.month - 1, startDay, 0, 0, 0)
    const endDate =
      half === 1
        ? new Date(input.year, input.month - 1, 16, 0, 0, 0)
        : new Date(input.year, input.month, 1, 0, 0, 0)
    const periodStartISO = fromZonedTime(startDate, 'America/El_Salvador').toISOString()
    const periodEndISO = fromZonedTime(endDate, 'America/El_Salvador').toISOString()
    const empIds = (empleados ?? []).map((u) => u.id)
    const { data: apptsRaw } = empIds.length
      ? await admin
          .from('appointments')
          .select('therapist_id, service_type, service_code, event_type, is_extra, status')
          .in('event_type', ['terapia', 'evaluacion'])
          .eq('status', 'completed')
          .in('therapist_id', empIds)
          .gte('starts_at', periodStartISO)
          .lt('starts_at', periodEndISO)
      : { data: [] as { therapist_id: string | null; service_type: string | null; service_code: string | null; event_type: string; is_extra: boolean; status: string }[] }

    // Evaluaciones aportan su cost_usd por código; terapias por service_type.
    const payInput: CompletedTherapyForPay[] = (apptsRaw ?? []).map((a) => ({
      therapist_id: a.therapist_id,
      service_type: a.service_type,
      is_extra: a.is_extra,
      cost_override:
        a.event_type === 'evaluacion' ? costByEvalCode.get(a.service_code ?? '') ?? 0 : null,
    }))

    // Suma pura y testeada (professional-services.test.ts): la duración NO interviene.
    spTotals = sumProfessionalServicesPay(payInput, costByService)
  }

  const items = (empleados ?? []).map((u) => {
    if (isSp) {
      // Base SP = honorario fijo mensual (prorrateado si es quincenal) + terapias/
      // evaluaciones completadas en el período. Ambos (también en normal) → solo las
      // is_extra cuentan; solo-SP → todas las completadas.
      const fixedBase = round2(Number(u.professional_services_base_usd ?? 0) * baseFactor)
      const therapyBase = professionalServicesBaseFor(u.id, u.in_normal_payroll, spTotals)
      const base = round2(fixedBase + therapyBase)
      const calc = calculateProfessionalServicesPayroll(
        { baseUsd: base },
        Number(config.professional_services_isr_rate ?? 0.1),
      )
      return {
        payroll_run_id: created.id,
        user_id: u.id,
        user_snapshot_json: null,
        base_salary_usd: calc.baseSalaryUsd,
        extra_hours: 0,
        extra_hours_rate_usd: u.hourly_rate_usd ?? null,
        extra_hours_amount_usd: 0,
        bonus_usd: calc.bonusUsd,
        other_deductions_usd: 0,
        gross_total_usd: calc.grossTotalUsd,
        isss_employee_usd: calc.isssEmployeeUsd,
        afp_employee_usd: calc.afpEmployeeUsd,
        isr_usd: calc.isrUsd,
        total_deductions_usd: calc.totalDeductionsUsd,
        net_pay_usd: calc.netPayUsd,
        isss_employer_usd: calc.isssEmployerUsd,
        afp_employer_usd: calc.afpEmployerUsd,
        employer_cost_usd: calc.employerCostUsd,
      }
    }
    // Planilla normal: sueldo fijo (prorrateado a la mitad si es quincenal),
    // deducciones completas. Los extras van a la SP.
    const baseSalary = round2(Number(u.monthly_salary_usd ?? 0) * baseFactor)
    const calc = calculatePayroll({ baseSalaryUsd: baseSalary }, config)
    return {
      payroll_run_id: created.id,
      user_id: u.id,
      user_snapshot_json: null,
      base_salary_usd: calc.baseSalaryUsd,
      extra_hours: 0,
      extra_hours_rate_usd: u.hourly_rate_usd ?? null,
      extra_hours_amount_usd: 0,
      bonus_usd: calc.bonusUsd,
      other_deductions_usd: 0,
      gross_total_usd: calc.grossTotalUsd,
      isss_employee_usd: calc.isssEmployeeUsd,
      afp_employee_usd: calc.afpEmployeeUsd,
      isr_usd: calc.isrUsd,
      total_deductions_usd: calc.totalDeductionsUsd,
      net_pay_usd: calc.netPayUsd,
      isss_employer_usd: calc.isssEmployerUsd,
      afp_employer_usd: calc.afpEmployerUsd,
      employer_cost_usd: calc.employerCostUsd,
    }
  })

  if (items.length > 0) {
    const { error: itemsErr } = await admin.from('payroll_items').insert(items)
    if (itemsErr) {
      await admin.from('payroll_runs').delete().eq('id', created.id)
      return { ok: false, error: `No se pudieron crear los ítems: ${itemsErr.message}` }
    }
  }

  revalidatePath('/reportes/contabilidad/planillas')
  return { ok: true, run: created as PayrollRun }
}

export interface UpdatePayrollItemInput {
  itemId: string
  baseSalaryUsd?: number
  extraHours?: number
  extraHoursRateUsd?: number | null
  bonusUsd?: number
  otherDeductionsUsd?: number
  notes?: string | null
}

export async function updatePayrollItem(
  input: UpdatePayrollItemInput,
): Promise<{ ok: true; item: PayrollItem } | { ok: false; error: string }> {
  const { supabase, user } = await getActor()
  if (!canManagePayroll(user.role)) return { ok: false, error: 'No autorizado.' }

  const { data: item } = await supabase
    .from('payroll_items')
    .select('*')
    .eq('id', input.itemId)
    .maybeSingle()
  if (!item) return { ok: false, error: 'Ítem no encontrado.' }
  const { data: parentRun } = await supabase
    .from('payroll_runs')
    .select('status, payroll_type')
    .eq('id', item.payroll_run_id)
    .maybeSingle()
  if (parentRun?.status !== 'draft') return { ok: false, error: 'La planilla ya fue sellada.' }

  const config = await getActiveFiscalConfig()
  if (!config) return { ok: false, error: 'No hay configuración fiscal activa.' }

  const next = {
    baseSalaryUsd: input.baseSalaryUsd ?? Number(item.base_salary_usd),
    extraHours: input.extraHours ?? Number(item.extra_hours),
    extraHoursRateUsd: input.extraHoursRateUsd ?? (item.extra_hours_rate_usd != null ? Number(item.extra_hours_rate_usd) : 0),
    bonusUsd: input.bonusUsd ?? Number(item.bonus_usd),
    otherDeductionsUsd: input.otherDeductionsUsd ?? Number(item.other_deductions_usd),
  }
  // Servicios profesionales: solo retención ISR sobre la base. Normal: deducciones completas.
  const calc = parentRun.payroll_type === 'servicios_profesionales'
    ? calculateProfessionalServicesPayroll(
        { baseUsd: next.baseSalaryUsd, otherDeductionsUsd: next.otherDeductionsUsd },
        Number(config.professional_services_isr_rate ?? 0.1),
      )
    : calculatePayroll(next, config)

  const admin = createAdminClient()
  const { data: updated, error: updErr } = await admin
    .from('payroll_items')
    .update({
      base_salary_usd: calc.baseSalaryUsd,
      extra_hours: next.extraHours,
      extra_hours_rate_usd: next.extraHoursRateUsd,
      extra_hours_amount_usd: calc.extraHoursAmountUsd,
      bonus_usd: calc.bonusUsd,
      other_deductions_usd: calc.otherDeductionsUsd,
      gross_total_usd: calc.grossTotalUsd,
      isss_employee_usd: calc.isssEmployeeUsd,
      afp_employee_usd: calc.afpEmployeeUsd,
      isr_usd: calc.isrUsd,
      total_deductions_usd: calc.totalDeductionsUsd,
      net_pay_usd: calc.netPayUsd,
      isss_employer_usd: calc.isssEmployerUsd,
      afp_employer_usd: calc.afpEmployerUsd,
      employer_cost_usd: calc.employerCostUsd,
      notes: input.notes ?? item.notes,
    })
    .eq('id', input.itemId)
    .select('*')
    .single()
  if (updErr || !updated) return { ok: false, error: updErr?.message ?? 'No se pudo actualizar.' }

  revalidatePath(`/reportes/contabilidad/planillas/${item.payroll_run_id}`)
  return { ok: true, item: updated as PayrollItem }
}

export async function removePayrollItem(
  itemId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, user } = await getActor()
  if (!canManagePayroll(user.role)) return { ok: false, error: 'No autorizado.' }

  const { data: item } = await supabase
    .from('payroll_items')
    .select('payroll_run_id')
    .eq('id', itemId)
    .maybeSingle()
  if (!item) return { ok: false, error: 'Ítem no encontrado.' }
  const { data: parentRun } = await supabase
    .from('payroll_runs')
    .select('status')
    .eq('id', item.payroll_run_id)
    .maybeSingle()
  if (parentRun?.status !== 'draft') return { ok: false, error: 'La planilla ya fue sellada.' }

  const admin = createAdminClient()
  const { error } = await admin.from('payroll_items').delete().eq('id', itemId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/reportes/contabilidad/planillas/${item.payroll_run_id}`)
  return { ok: true }
}

export async function sealPayrollRun(
  runId: string,
): Promise<{ ok: true; run: PayrollRun } | { ok: false; error: string }> {
  const { supabase, user } = await getActor()
  if (!canManagePayroll(user.role)) return { ok: false, error: 'No autorizado.' }

  const { data: run } = await supabase.from('payroll_runs').select('*').eq('id', runId).maybeSingle()
  if (!run) return { ok: false, error: 'Planilla no encontrada.' }
  if (run.status !== 'draft') return { ok: false, error: 'Solo se pueden sellar planillas en borrador.' }

  const config = await getActiveFiscalConfig()
  if (!config) return { ok: false, error: 'No hay configuración fiscal activa.' }

  // Snapshot del empleado en cada item
  const admin = createAdminClient()
  const { data: items } = await admin
    .from('payroll_items')
    .select('id, user_id')
    .eq('payroll_run_id', runId)

  if (items && items.length > 0) {
    const userIds = items.map((i) => i.user_id)
    const { data: users } = await admin
      .from('users')
      .select('id, full_name, email, role, contract_type, dui, isss_number, afp_number, afp_provider, hire_date')
      .in('id', userIds)
    const byId = new Map((users ?? []).map((u) => [u.id, u]))

    for (const it of items) {
      const u = byId.get(it.user_id)
      if (!u) continue
      const snapshot: PayrollItemUserSnapshot = {
        full_name: u.full_name,
        email: u.email,
        role: u.role,
        contract_type: u.contract_type,
        dui: u.dui,
        isss_number: u.isss_number,
        afp_number: u.afp_number,
        afp_provider: u.afp_provider,
        hire_date: u.hire_date,
      }
      await admin
        .from('payroll_items')
        .update({ user_snapshot_json: snapshot })
        .eq('id', it.id)
    }
  }

  const { data: sealed, error } = await admin
    .from('payroll_runs')
    .update({
      status: 'sealed',
      sealed_at: new Date().toISOString(),
      sealed_by_user_id: user.id,
      fiscal_config_snapshot_json: config as unknown as Record<string, unknown>,
    })
    .eq('id', runId)
    .select('*')
    .single()
  if (error || !sealed) return { ok: false, error: error?.message ?? 'No se pudo sellar.' }

  revalidatePath(`/reportes/contabilidad/planillas/${runId}`)
  revalidatePath('/reportes/contabilidad/planillas')
  return { ok: true, run: sealed as PayrollRun }
}

export async function markPayrollRunPaid(
  runId: string,
): Promise<{ ok: true; run: PayrollRun } | { ok: false; error: string }> {
  const { supabase, user } = await getActor()
  if (!canManagePayroll(user.role)) return { ok: false, error: 'No autorizado.' }

  const { data: run } = await supabase.from('payroll_runs').select('status').eq('id', runId).maybeSingle()
  if (!run) return { ok: false, error: 'Planilla no encontrada.' }
  if (run.status !== 'sealed') return { ok: false, error: 'Solo planillas selladas se pueden marcar como pagadas.' }

  const admin = createAdminClient()
  const { data: updated, error } = await admin
    .from('payroll_runs')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      paid_by_user_id: user.id,
    })
    .eq('id', runId)
    .select('*')
    .single()
  if (error || !updated) return { ok: false, error: error?.message ?? 'No se pudo marcar como pagada.' }

  revalidatePath(`/reportes/contabilidad/planillas/${runId}`)
  revalidatePath('/reportes/contabilidad/planillas')
  return { ok: true, run: updated as PayrollRun }
}

export async function cancelPayrollRun(
  runId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, user } = await getActor()
  if (!canManagePayroll(user.role)) return { ok: false, error: 'No autorizado.' }
  if (!reason.trim()) return { ok: false, error: 'El motivo es requerido.' }

  const { data: run } = await supabase.from('payroll_runs').select('status').eq('id', runId).maybeSingle()
  if (!run) return { ok: false, error: 'Planilla no encontrada.' }
  if (run.status === 'cancelled') return { ok: false, error: 'Ya está anulada.' }
  // Se permite anular planillas PAGADAS (ej. pago registrado por error): queda
  // archivada con motivo/quién/cuándo. Marcar pagada no genera asientos
  // contables, así que no hay nada que revertir más allá del estado.

  const admin = createAdminClient()
  const { error } = await admin
    .from('payroll_runs')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by_user_id: user.id,
      cancel_reason: reason.trim(),
    })
    .eq('id', runId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/reportes/contabilidad/planillas/${runId}`)
  revalidatePath('/reportes/contabilidad/planillas')
  return { ok: true }
}

// ──────────────────────────────────────────────────────────────────────────
// Empleado firma su recibo
// ──────────────────────────────────────────────────────────────────────────

export async function signMyPayrollItem(
  itemId: string,
): Promise<{ ok: true; item: PayrollItem } | { ok: false; error: string }> {
  const { supabase } = await getActor()
  const hdrs = await headers()
  const forwarded = hdrs.get('x-forwarded-for') ?? ''
  const signedIp = forwarded.split(',')[0]?.trim() || hdrs.get('x-real-ip') || null

  const { data, error } = await supabase.rpc('sign_my_payroll_item', {
    p_item_id: itemId,
    p_signed_ip: signedIp,
  })
  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('item_not_found')) return { ok: false, error: 'Recibo no encontrado.' }
    if (msg.includes('not_authorized')) return { ok: false, error: 'No autorizado.' }
    if (msg.includes('already_signed')) return { ok: false, error: 'Ya firmaste este recibo.' }
    if (msg.includes('run_not_sealed')) return { ok: false, error: 'La planilla aún no está sellada.' }
    return { ok: false, error: 'Error al firmar el recibo.' }
  }

  revalidatePath('/mis-recibos')
  revalidatePath(`/mis-recibos/${itemId}`)
  return { ok: true, item: data as PayrollItem }
}

// ──────────────────────────────────────────────────────────────────────────
// Lecturas auxiliares para UI
// ──────────────────────────────────────────────────────────────────────────

export async function listPayrollRuns(): Promise<PayrollRun[]> {
  const { supabase } = await getActor()
  const { data } = await supabase
    .from('payroll_runs')
    .select('*')
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false })
  return (data ?? []) as PayrollRun[]
}

export interface PayrollRunDetail {
  run: PayrollRun
  items: Array<PayrollItem & { user: { id: string; full_name: string; email: string; role: UserRole } | null }>
}

export async function getPayrollRunDetail(runId: string): Promise<PayrollRunDetail | null> {
  const { supabase } = await getActor()
  const { data: run } = await supabase.from('payroll_runs').select('*').eq('id', runId).maybeSingle()
  if (!run) return null

  const { data: itemsRaw } = await supabase
    .from('payroll_items')
    .select('*')
    .eq('payroll_run_id', runId)
    .order('created_at')

  const userIds = (itemsRaw ?? []).map((i) => i.user_id)
  let usersById: Map<string, { id: string; full_name: string; email: string; role: UserRole }> = new Map()
  if (userIds.length > 0) {
    const { data: usersRaw } = await supabase
      .from('users')
      .select('id, full_name, email, role')
      .in('id', userIds)
    usersById = new Map(((usersRaw ?? []) as Array<{ id: string; full_name: string; email: string; role: UserRole }>).map((u) => [u.id, u]))
  }

  const items = ((itemsRaw ?? []) as PayrollItem[]).map((it) => ({
    ...it,
    user: usersById.get(it.user_id) ?? null,
  }))

  return {
    run: run as PayrollRun,
    items,
  }
}

export interface MyPayrollItem extends PayrollItem {
  run: Pick<PayrollRun, 'id' | 'period_year' | 'period_month' | 'period_half' | 'status' | 'sealed_at' | 'paid_at'>
}

export async function listMyPayrollItems(): Promise<MyPayrollItem[]> {
  const { supabase, user } = await getActor()
  const { data: items } = await supabase
    .from('payroll_items')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const runIds = Array.from(new Set((items ?? []).map((i) => i.payroll_run_id)))
  if (runIds.length === 0) return []

  const { data: runs } = await supabase
    .from('payroll_runs')
    .select('id, period_year, period_month, period_half, status, sealed_at, paid_at')
    .in('id', runIds)
  const byId = new Map(
    ((runs ?? []) as Array<MyPayrollItem['run']>).map((r) => [r.id, r]),
  )

  return ((items ?? []) as PayrollItem[])
    .map((it) => {
      const run = byId.get(it.payroll_run_id)
      if (!run) return null
      if (run.status === 'draft' || run.status === 'cancelled') return null
      return { ...it, run }
    })
    .filter((x): x is MyPayrollItem => x !== null)
}

export async function getMyPayrollItem(itemId: string): Promise<MyPayrollItem | null> {
  const { supabase, user } = await getActor()
  const { data: item } = await supabase
    .from('payroll_items')
    .select('*')
    .eq('id', itemId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!item) return null
  const { data: run } = await supabase
    .from('payroll_runs')
    .select('id, period_year, period_month, period_half, status, sealed_at, paid_at')
    .eq('id', item.payroll_run_id)
    .maybeSingle()
  if (!run) return null
  if (run.status === 'draft' || run.status === 'cancelled') return null
  return { ...(item as PayrollItem), run: run as MyPayrollItem['run'] }
}
