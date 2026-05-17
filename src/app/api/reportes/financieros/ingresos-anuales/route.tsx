import { renderToBuffer } from '@react-pdf/renderer'
import { ensureFinancialReportAccess, parseYearParam, pdfResponse } from '../_shared'
import { getAnnualComparison } from '@/lib/domain/reports/financial'
import { AnnualComparisonPDF } from '@/components/reportes/pdf/AnnualComparisonPDF'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const access = await ensureFinancialReportAccess()
  if ('response' in access) return access.response
  const { supabase, logoUrl } = access.context

  const url = new URL(req.url)
  const year = parseYearParam(url.searchParams, new Date().getFullYear())

  const data = await getAnnualComparison(supabase, { year })

  const buffer = await renderToBuffer(
    <AnnualComparisonPDF data={data} logoUrl={logoUrl} />,
  )

  return pdfResponse(buffer, `kinetic-ingresos-anuales-${year}-vs-${year - 1}.pdf`)
}
