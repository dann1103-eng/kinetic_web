import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import { getActiveFiscalConfig } from '@/app/actions/payroll'
import { FiscalConfigEditor } from '@/components/reportes/contabilidad/FiscalConfigEditor'
import { UserSalaryRow } from '@/components/reportes/contabilidad/UserSalaryRow'
import type { PayrollContractType, AfpProvider, UserRole } from '@/types/db'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES: UserRole[] = ['admin', 'directora', 'contable', 'recepcion']

const STAFF_ROLES: UserRole[] = [
  'admin',
  'directora',
  'supervisor',
  'coordinadora_familias',
  'coordinadora_terapias',
  'terapista',
  'maestra',
  'recepcion',
  'contable',
]

export default async function ContabilidadConfigPage() {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')
  if (!ALLOWED_ROLES.includes(ctx.appUser.role)) redirect('/dashboard')

  const supabase = await createClient()
  const config = await getActiveFiscalConfig()

  const { data: usersRaw } = await supabase
    .from('users')
    .select('id, full_name, email, role, monthly_salary_usd, hourly_rate_usd, contract_type, in_normal_payroll, in_professional_services_payroll, dui, isss_number, afp_number, afp_provider, hire_date')
    .in('role', STAFF_ROLES)
    .order('full_name')

  const users = (usersRaw ?? []) as Array<{
    id: string
    full_name: string
    email: string
    role: string
    monthly_salary_usd: number | null
    hourly_rate_usd: number | null
    contract_type: PayrollContractType
    in_normal_payroll: boolean
    in_professional_services_payroll: boolean
    dui: string | null
    isss_number: string | null
    afp_number: string | null
    afp_provider: AfpProvider | null
    hire_date: string | null
  }>

  const canEditConfig = ALLOWED_ROLES.includes(ctx.appUser.role)

  return (
    <div className="flex flex-col min-h-full">
      <TopNav title="Configuración fiscal y salarios" />

      <div className="flex-1 p-6 max-w-6xl mx-auto w-full space-y-6">
        <div className="flex items-center gap-2 pt-2">
          <Link
            href="/reportes/contabilidad"
            className="inline-flex items-center gap-1 text-sm text-fm-on-surface-variant hover:text-fm-primary transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
            Planillas
          </Link>
          <span className="text-fm-on-surface-variant">/</span>
          <span className="text-sm font-bold text-fm-on-surface">Configuración</span>
        </div>

        <header>
          <h1 className="text-2xl font-extrabold tracking-tight text-fm-on-surface">
            Configuración fiscal y salarios
          </h1>
          <p className="text-sm text-fm-on-surface-variant mt-1">
            Constantes legales (ISSS, AFP, ISR) y salario base por empleado. Las planillas selladas conservan el snapshot de configuración usada al sellar.
          </p>
        </header>

        {config ? (
          <FiscalConfigEditor config={config} canEdit={canEditConfig} />
        ) : (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-amber-900">
            <h3 className="font-extrabold">Sin configuración fiscal activa</h3>
            <p className="text-sm mt-1">
              Aplicá la migración <code>0117_payroll.sql</code> en Supabase Studio. Incluye un seed con valores referenciales 2024-2026.
            </p>
          </div>
        )}

        <section className="space-y-3">
          <h2 className="text-base font-extrabold text-fm-on-surface">Salarios por empleado</h2>
          <p className="text-xs text-fm-on-surface-variant">
            Configurá el salario base y la pertenencia a cada planilla (normal y/o servicios profesionales) de cada empleado. Quien no pertenezca a ninguna no aparecerá en planillas nuevas.
          </p>

          <div className="overflow-x-auto rounded-2xl border border-fm-outline-variant/30 bg-fm-background">
            <table className="w-full text-sm">
              <thead className="bg-fm-surface-container">
                <tr>
                  <th className="text-left py-3 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">Empleado</th>
                  <th className="text-left py-3 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">Rol</th>
                  <th className="text-left py-3 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">Contrato</th>
                  <th className="text-right py-3 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">Salario mensual</th>
                  <th className="text-right py-3 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">Tarifa/hora</th>
                  <th className="py-3 px-4 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <UserSalaryRow key={u.id} user={u} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
