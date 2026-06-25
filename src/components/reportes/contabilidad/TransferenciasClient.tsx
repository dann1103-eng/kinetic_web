'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { buildBankTransferRows, type BankTransferUser } from '@/lib/domain/reports/bank-transfer'

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

interface Props {
  year: number
  month: number
  data: {
    users: BankTransferUser[]
    normalNet: Record<string, number>
    spNet: Record<string, number>
    hasNormalRun: boolean
    hasSpRun: boolean
  }
}

export function TransferenciasClient({ year, month, data }: Props) {
  const router = useRouter()
  const [otros, setOtros] = useState<Record<string, string>>({})

  const { rows, totals } = useMemo(() => {
    const normalMap = new Map(Object.entries(data.normalNet))
    const spMap = new Map(Object.entries(data.spNet))
    const otrosMap = new Map<string, number>()
    for (const [id, v] of Object.entries(otros)) {
      const n = Number(v)
      if (n) otrosMap.set(id, n)
    }
    return buildBankTransferRows({
      users: data.users,
      normalNetByUser: normalMap,
      spNetByUser: spMap,
      otrosByUser: otrosMap,
    })
  }, [data, otros])

  function goMonth(delta: number) {
    let y = year
    let m = month + delta
    if (m < 1) { m = 12; y -= 1 } else if (m > 12) { m = 1; y += 1 }
    router.push(`/reportes/contabilidad/transferencias?year=${y}&month=${m}`)
  }

  function exportUrl(format: 'xlsx' | 'pdf'): string {
    const otrosObj: Record<string, number> = {}
    for (const [id, v] of Object.entries(otros)) {
      const n = Number(v)
      if (n) otrosObj[id] = n
    }
    const params = new URLSearchParams({ year: String(year), month: String(month) })
    if (Object.keys(otrosObj).length > 0) params.set('otros', JSON.stringify(otrosObj))
    return `/api/reportes/contabilidad/transferencias/${format}?${params.toString()}`
  }

  const noRuns = !data.hasNormalRun && !data.hasSpRun
  const missingCount = rows.filter((r) => r.missingBank).length

  return (
    <div className="space-y-4">
      {/* Controles */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => goMonth(-1)}
            className="w-8 h-8 inline-flex items-center justify-center rounded-full hover:bg-fm-surface-container text-fm-on-surface-variant"
            aria-label="Mes anterior"
          >
            <span className="material-symbols-outlined text-[20px]">chevron_left</span>
          </button>
          <span className="text-sm font-bold text-fm-on-surface min-w-[10ch] text-center">
            {MONTHS[month - 1]} {year}
          </span>
          <button
            type="button"
            onClick={() => goMonth(1)}
            className="w-8 h-8 inline-flex items-center justify-center rounded-full hover:bg-fm-surface-container text-fm-on-surface-variant"
            aria-label="Mes siguiente"
          >
            <span className="material-symbols-outlined text-[20px]">chevron_right</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={exportUrl('xlsx')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-fm-primary text-white hover:opacity-90"
          >
            <span className="material-symbols-outlined text-[18px]">table_view</span>
            Excel
          </a>
          <a
            href={exportUrl('pdf')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border border-fm-primary/40 text-fm-primary hover:bg-fm-primary/5"
          >
            <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
            PDF
          </a>
        </div>
      </div>

      {noRuns && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No hay planillas selladas (normal o servicios profesionales) para {MONTHS[month - 1]} {year}.
          Sellá las planillas del mes para generar el documento.
        </div>
      )}

      {missingCount > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          ⚠️ {missingCount} persona(s) con monto a depositar pero sin banco o número de cuenta.
          Completá sus datos en Configuración → Salarios.
        </div>
      )}

      {/* Tabla */}
      <div className="overflow-x-auto rounded-2xl border border-fm-outline-variant/30">
        <table className="w-full text-sm">
          <thead className="bg-fm-surface-container text-[10px] uppercase tracking-wide text-fm-on-surface-variant">
            <tr>
              <th className="text-left px-2 py-2 font-semibold w-8">#</th>
              <th className="text-left px-3 py-2 font-semibold">Nombre</th>
              <th className="text-left px-3 py-2 font-semibold">DUI / NIT</th>
              <th className="text-left px-3 py-2 font-semibold">Banco</th>
              <th className="text-left px-3 py-2 font-semibold">Tipo</th>
              <th className="text-left px-3 py-2 font-semibold">Nº cuenta</th>
              <th className="text-right px-3 py-2 font-semibold">Salario</th>
              <th className="text-right px-3 py-2 font-semibold">Honorarios</th>
              <th className="text-right px-3 py-2 font-semibold w-28">Otros</th>
              <th className="text-right px-3 py-2 font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-fm-on-surface-variant">
                  No hay montos a depositar este mes.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr
                  key={r.userId}
                  className={`border-t border-fm-outline-variant/15 ${r.missingBank ? 'bg-amber-50/60' : ''}`}
                >
                  <td className="px-2 py-1.5 text-fm-on-surface-variant tabular-nums">{i + 1}</td>
                  <td className="px-3 py-1.5 font-medium text-fm-on-surface">{r.nombre}</td>
                  <td className="px-3 py-1.5 text-fm-on-surface-variant tabular-nums">{r.duiNit || '—'}</td>
                  <td className="px-3 py-1.5 text-fm-on-surface-variant">
                    {r.banco || <span className="text-amber-700">Falta</span>}
                  </td>
                  <td className="px-3 py-1.5 text-fm-on-surface-variant">{r.tipoCuenta || '—'}</td>
                  <td className="px-3 py-1.5 text-fm-on-surface-variant tabular-nums">
                    {r.numeroCuenta || <span className="text-amber-700">Falta</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{r.salario ? money(r.salario) : '—'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{r.honorarios ? money(r.honorarios) : '—'}</td>
                  <td className="px-3 py-1.5 text-right">
                    <div className="inline-flex items-center gap-1">
                      <span className="text-fm-on-surface-variant text-xs">$</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={otros[r.userId] ?? ''}
                        placeholder="0.00"
                        onChange={(e) => setOtros((prev) => ({ ...prev, [r.userId]: e.target.value }))}
                        className="w-20 rounded-md border border-fm-outline-variant/40 bg-fm-background px-2 py-1 text-sm text-right tabular-nums"
                      />
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right font-bold tabular-nums text-fm-primary">{money(r.total)}</td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-fm-outline-variant/40 bg-fm-surface-container-low font-bold">
                <td className="px-3 py-2 text-fm-on-surface" colSpan={6}>Total a transferir</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(totals.salario)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(totals.honorarios)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(totals.otros)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-fm-primary">{money(totals.total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="text-[11px] text-fm-on-surface-variant">
        Salario = neto de la planilla normal sellada del mes. Honorarios = neto de la planilla
        de servicios profesionales. Otros = monto manual (viáticos, reintegros, etc.).
      </p>
    </div>
  )
}
