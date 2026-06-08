import type { TherapistEarningsReport } from '@/lib/domain/reports/therapist'

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

/**
 * Vista en vivo del acumulado a pagar por terapias completadas en el mes.
 * Refleja lo que pagaría la planilla de servicios profesionales
 * (terapia completada × tarifa de catálogo).
 */
export function TherapyEarningsSection({ report }: { report: TherapistEarningsReport }) {
  const hasExtraOnly = report.rows.some((r) => r.extraOnly)

  return (
    <section className="rounded-2xl border border-fm-outline-variant/30 bg-fm-background overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-fm-outline-variant/20 bg-fm-surface-container">
        <div>
          <h2 className="text-sm font-extrabold text-fm-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-fm-primary" style={{ fontSize: '20px' }}>
              payments
            </span>
            Pago por terapias completadas — acumulado del mes
          </h2>
          <p className="text-xs text-fm-on-surface-variant mt-0.5">
            Cada terapia completada suma su tarifa del catálogo. Es lo que pagaría la
            planilla de servicios profesionales si se generara hoy.
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-fm-on-surface-variant">
            Total acumulado
          </p>
          <p className="text-2xl font-black" style={{ color: '#00675c' }}>
            {money(report.totalUsd)}
          </p>
        </div>
      </div>

      {report.rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-fm-on-surface-variant">
          No hay terapistas en planilla de servicios profesionales. Activá el flag en{' '}
          <span className="font-semibold">Usuarios → Salario</span> o registrá tarifas en{' '}
          <span className="font-semibold">Catálogos → Costos</span>.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-fm-surface-container-low">
              <tr>
                <th className="text-left py-2 px-5 font-bold text-fm-on-surface-variant text-[10px] uppercase tracking-wider">
                  Terapista
                </th>
                <th className="text-right py-2 px-3 font-bold text-fm-on-surface-variant text-[10px] uppercase tracking-wider">
                  Terapias compl.
                </th>
                <th className="text-right py-2 px-3 font-bold text-fm-on-surface-variant text-[10px] uppercase tracking-wider">
                  A pagar
                </th>
                <th className="text-right py-2 px-5 font-bold text-fm-on-surface-variant text-[10px] uppercase tracking-wider">
                  Monto acumulado
                </th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={r.therapistId} className="border-t border-fm-outline-variant/20">
                  <td className="py-3 px-5">
                    <span className="font-semibold text-fm-on-surface">{r.fullName}</span>
                    {r.extraOnly && (
                      <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                        solo extras
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums text-fm-on-surface">
                    {r.completedCount}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums text-fm-on-surface-variant">
                    {r.payableCount}
                  </td>
                  <td className="py-3 px-5 text-right tabular-nums font-bold text-fm-on-surface">
                    {money(r.amountUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasExtraOnly && (
        <p className="px-5 py-2.5 text-[11px] text-fm-on-surface-variant border-t border-fm-outline-variant/10">
          <span className="font-semibold text-amber-700">Solo extras</span>: terapistas con
          sueldo fijo (planilla normal) solo cobran aparte las terapias marcadas como{' '}
          <em>extra</em>; las demás ya van en su salario.
        </p>
      )}
    </section>
  )
}
