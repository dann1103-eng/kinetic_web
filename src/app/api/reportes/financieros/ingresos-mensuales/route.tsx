import { renderToBuffer } from '@react-pdf/renderer'
import { ensureFinancialReportAccess, parseYearParam, pdfResponse } from '../_shared'
import { getMonthlyRevenue } from '@/lib/domain/reports/financial'
import { MonthlyRevenuePDF } from '@/components/reportes/pdf/MonthlyRevenuePDF'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const access = await ensureFinancialReportAccess()
  if ('response' in access) return access.response
  const { supabase, logoUrl } = access.context

  const url = new URL(req.url)
  const year = parseYearParam(url.searchParams, new Date().getFullYear())

  const rows = await getMonthlyRevenue(supabase, { year })

  const buffer = await renderToBuffer(
    <MonthlyRevenuePDF year={year} rows={rows} logoUrl={logoUrl} />,
  )

  return pdfResponse(buffer, `kinetic-ingresos-mensuales-${year}.pdf`)
}
