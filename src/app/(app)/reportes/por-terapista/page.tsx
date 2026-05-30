import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { TopNav } from '@/components/layout/TopNav'
import {
  getTherapistMonthlyReport,
  getTherapistHistoricalCapacity,
  fmtHours,
  fmtPercent,
} from '@/lib/domain/reports/therapist'
import { PeriodSelector } from '@/components/reportes/por-terapista/PeriodSelector'
import { HistoricalCapacitySection } from '@/components/reportes/por-terapista/HistoricalCapacitySection'
import { ReportDownloadButton } from '@/components/reportes/ReportDownloadButton'
import type { UserRole } from '@/types/db'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES: UserRole[] = ['admin', 'directora', 'coordinadora_terapias', 'recepcion']

interface PageProps {
  searchParams: Promise<{
    year?: string
    month?: string
  }>
}

function parseYear(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  if (Number.isNaN(n) || n < 2000 || n > 2100) return fallback
  return n
}

function parseMonth(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  if (Number.isNaN(n) || n < 1 || n > 12) return fallback
  return n
}

function complianceTone(pct: number): string {
  if (pct >= 90) return 'text-emerald-700'
  if (pct >= 70) return 'text-amber-700'
  return 'text-rose-700'
}

function occupancyTone(pct: number | null): string {
  if (pct == null) return 'text-fm-on-surface-variant'
  if (pct < 60) return 'text-emerald-700'
  if (pct <= 85) return 'text-amber-700'
  return 'text-rose-700'
}

export default async function ReportesPorTerapistaPage({ searchParams }: PageProps) {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')
  if (!ALLOWED_ROLES.includes(ctx.appUser.role)) redirect('/dashboard')

  const params = await searchParams
  const now = new Date()
  const year = parseYear(params.year, now.getFullYear())
  const month = parseMonth(params.month, now.getMonth() + 1)

  const supabase = await createClient()
  const [report, historicalCapacity] = await Promise.all([
    getTherapistMonthlyReport(supabase, { year, month }),
    getTherapistHistoricalCapacity(supabase, { monthsBack: 6 }),
  ])

  return (
    <div className="flex flex-col min-h-full">
      <TopNav title="Reportes por terapista" />

      <div className="flex-1 p-6 max-w-6xl mx-auto w-full space-y-6">
        <div className="flex items-center gap-2 pt-2">
          <Link
            href="/reportes"
            className="inline-flex items-center gap-1 text-sm text-fm-on-surface-variant hover:text-fm-primary transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
            Reportes
          </Link>
          <span className="text-fm-on-surface-variant">/</span>
          <span className="text-sm font-bold text-fm-on-surface">Por terapista</span>
        </div>

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-fm-on-surface">
              {report.monthLabel}
            </h1>
            <p className="text-sm text-fm-on-surface-variant mt-1">
              {report.totals.therapists} terapista{report.totals.therapists === 1 ? '' : 's'} ·{' '}
              {report.totals.completed} sesiones completadas ·{' '}
              {fmtHours(report.totals.hoursWorked)} trabajadas
            </p>
          </div>
          <div className="flex items-center gap-3">
            <PeriodSelector year={year} month={month} systemYear={now.getFullYear()} />
            <ReportDownloadButton
              href={`/api/reportes/por-terapista/equipo?year=${year}&month=${month}`}
              filename={`kinetic-equipo-${year}-${String(month).padStart(2, '0')}`}
              label="Descargar tabla"
            />
          </div>
        </header>

        {/* KPIs agregados */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Sesiones realizadas" value={String(report.totals.completed)} />
          <Kpi label="No-shows" value={String(report.totals.no_show)} tone="rose" />
          <Kpi label="Cancel. tardía" value={String(report.totals.late_cancel)} tone="rose" />
          <Kpi label="Reposiciones cumplidas" value={String(report.totals.replacement_attended)} tone="teal" />
        </div>

        {report.rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-fm-outline-variant/40 bg-fm-background p-12 text-center">
            <p className="text-sm text-fm-on-surface-variant">
              No hay terapistas con rol activo. Configurá usuarios en{' '}
              <Link href="/users" className="text-fm-primary hover:underline">/users</Link>.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-fm-outline-variant/30 bg-fm-background">
            <table className="w-full text-sm">
              <thead className="bg-fm-surface-container">
                <tr>
                  <th rowSpan={2} className="text-left py-2 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider align-bottom">
                    Terapista
                  </th>
                  <th colSpan={4} className="text-center py-2 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider border-l border-fm-outline-variant/30">
                    Asistencia
                  </th>
                  <th colSpan={2} className="text-center py-2 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider border-l border-fm-outline-variant/30">
                    Carga horaria
                  </th>
                  <th colSpan={3} className="text-center py-2 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider border-l border-fm-outline-variant/30">
                    Informes
                  </th>
                  <th rowSpan={2} className="py-2 px-4 w-12 align-bottom"></th>
                </tr>
                <tr className="border-t border-fm-outline-variant/20">
                  <th className="text-right py-2 px-3 font-bold text-fm-on-surface-variant text-[10px] uppercase tracking-wider border-l border-fm-outline-variant/30">Compl.</th>
                  <th className="text-right py-2 px-3 font-bold text-fm-on-surface-variant text-[10px] uppercase tracking-wider">NoShow</th>
                  <th className="text-right py-2 px-3 font-bold text-fm-on-surface-variant text-[10px] uppercase tracking-wider">L.Cancel</th>
                  <th className="text-right py-2 px-3 font-bold text-fm-on-surface-variant text-[10px] uppercase tracking-wider">Reposic.</th>
                  <th className="text-right py-2 px-3 font-bold text-fm-on-surface-variant text-[10px] uppercase tracking-wider border-l border-fm-outline-variant/30">Trabaj.</th>
                  <th className="text-right py-2 px-3 font-bold text-fm-on-surface-variant text-[10px] uppercase tracking-wider">% Ocup.</th>
                  <th className="text-right py-2 px-3 font-bold text-fm-on-surface-variant text-[10px] uppercase tracking-wider border-l border-fm-outline-variant/30">Niños</th>
                  <th className="text-right py-2 px-3 font-bold text-fm-on-surface-variant text-[10px] uppercase tracking-wider">Entreg.</th>
                  <th className="text-right py-2 px-3 font-bold text-fm-on-surface-variant text-[10px] uppercase tracking-wider">% Cumpl.</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr
                    key={r.therapist.id}
                    className="border-t border-fm-outline-variant/20 hover:bg-fm-surface-container-low transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="font-semibold text-fm-on-surface">{r.therapist.full_name}</div>
                      <div className="text-xs text-fm-on-surface-variant capitalize">
                        {r.therapist.role.replace('_', ' ')}
                      </div>
                    </td>
                    {/* Asistencia */}
                    <td className="py-3 px-3 text-right font-bold text-fm-on-surface border-l border-fm-outline-variant/20">
                      {r.attendance.completed}
                    </td>
                    <td className="py-3 px-3 text-right text-rose-700">{r.attendance.no_show}</td>
                    <td className="py-3 px-3 text-right text-amber-700">{r.attendance.late_cancel}</td>
                    <td className="py-3 px-3 text-right" style={{ color: '#00675c' }}>
                      {r.attendance.replacement_attended}
                    </td>
                    {/* Horas */}
                    <td className="py-3 px-3 text-right font-bold text-fm-on-surface border-l border-fm-outline-variant/20">
                      {fmtHours(r.hoursLoad.hoursWorked)}
                    </td>
                    <td className={`py-3 px-3 text-right font-bold ${occupancyTone(r.hoursLoad.occupancyPct)}`}>
                      {r.hoursLoad.occupancyPct == null
                        ? '—'
                        : fmtPercent(r.hoursLoad.occupancyPct, 0)}
                    </td>
                    {/* Informes */}
                    <td className="py-3 px-3 text-right text-fm-on-surface border-l border-fm-outline-variant/20">
                      {r.reports.childrenAsPrimary}
                    </td>
                    <td className="py-3 px-3 text-right text-fm-on-surface">
                      {r.reports.reportsDelivered}/{r.reports.reportsDue}
                    </td>
                    <td className={`py-3 px-3 text-right font-bold ${complianceTone(r.reports.compliancePct)}`}>
                      {r.reports.reportsDue === 0 ? '—' : fmtPercent(r.reports.compliancePct, 0)}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <Link
                        href={`/api/reportes/por-terapista/individual/${r.therapist.id}?year=${year}&month=${month}`}
                        target="_blank"
                        className="material-symbols-outlined text-fm-on-surface-variant hover:text-fm-primary transition-colors"
                        style={{ fontSize: '18px' }}
                        title="Descargar PDF individual"
                      >
                        download
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Capacidad histórica multi-mes */}
        <HistoricalCapacitySection data={historicalCapacity} />

        <details className="text-xs text-fm-on-surface-variant px-2">
          <summary className="cursor-pointer hover:text-fm-on-surface">Notas del cálculo</summary>
          <ul className="mt-2 list-disc list-inside space-y-1">
            <li><strong>Asistencia</strong>: cuenta citas del mes con resultado definitivo (completed / no_show / late_cancel).</li>
            <li><strong>Reposiciones cumplidas</strong>: absences en estado <code>replaced</code> resueltas dentro del mes.</li>
            <li><strong>Horas trabajadas</strong>: suma de duraciones de citas <code>completed</code>. Horas contratadas estima como <code>max_hours_per_week × (días del mes / 7)</code>.</li>
            <li><strong>Cumplimiento de informes</strong>: cuenta informes con <code>period_ends</code> dentro del mes. Entregados = status approved o sent_to_family.</li>
          </ul>
        </details>
      </div>
    </div>
  )
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'rose' | 'teal' }) {
  const color = tone === 'rose' ? '#b31b25' : tone === 'teal' ? '#00675c' : '#1e293b'
  return (
    <div className="rounded-2xl bg-fm-background border border-fm-surface-container-high p-4">
      <p className="text-[11px] font-extrabold uppercase tracking-wider text-fm-on-surface-variant">{label}</p>
      <p className="text-2xl font-black mt-2" style={{ color }}>{value}</p>
    </div>
  )
}
