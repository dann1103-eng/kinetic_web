import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import { getBankTransferData } from '@/lib/domain/reports/bank-transfer-data'
import { TransferenciasClient } from '@/components/reportes/contabilidad/TransferenciasClient'
import type { UserRole } from '@/types/db'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES: UserRole[] = ['admin', 'directora', 'contable', 'recepcion']
const TZ = 'America/El_Salvador'

interface PageProps {
  searchParams: Promise<{ year?: string; month?: string }>
}

function nowSv(): { year: number; month: number } {
  const [y, m] = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' })
    .format(new Date())
    .split('-')
    .map(Number)
  return { year: y, month: m }
}

export default async function TransferenciasPage({ searchParams }: PageProps) {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')
  if (!ALLOWED_ROLES.includes(ctx.appUser.role)) redirect('/dashboard')

  const sp = await searchParams
  const now = nowSv()
  const year = sp.year ? Number(sp.year) : now.year
  const month = sp.month ? Number(sp.month) : now.month

  const supabase = await createClient()
  const data = await getBankTransferData(supabase, year, month)

  return (
    <div className="flex flex-col min-h-full">
      <TopNav title="Documento de transferencias" />

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
          <span className="text-sm font-bold text-fm-on-surface">Transferencias</span>
        </div>

        <header>
          <h1 className="text-2xl font-extrabold tracking-tight text-fm-on-surface">
            Documento de transferencias
          </h1>
          <p className="text-sm text-fm-on-surface-variant mt-1">
            Números de cuenta y total a depositar por persona, consolidando la planilla normal
            y la de servicios profesionales del mes. Exportá a Excel o PDF.
          </p>
        </header>

        <TransferenciasClient year={year} month={month} data={data} />
      </div>
    </div>
  )
}
