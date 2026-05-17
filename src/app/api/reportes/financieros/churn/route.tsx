import { renderToBuffer } from '@react-pdf/renderer'
import {
  ensureFinancialReportAccess,
  parseDateParam,
  pdfResponse,
} from '../_shared'
import { getChurnBreakdown } from '@/lib/domain/reports/financial'
import { ChurnPDF } from '@/components/reportes/pdf/ChurnPDF'

export const dynamic = 'force-dynamic'

function defaultRange(): { from: string; to: string } {
  const now = new Date()
  const to = now.toISOString().slice(0, 10)
  const fromDate = new Date(now)
  fromDate.setMonth(fromDate.getMonth() - 11)
  fromDate.setDate(1)
  const from = fromDate.toISOString().slice(0, 10)
  return { from, to }
}

export async function GET(req: Request) {
  const access = await ensureFinancialReportAccess()
  if ('response' in access) return access.response
  const { supabase, logoUrl } = access.context

  const url = new URL(req.url)
  const def = defaultRange()
  const from = parseDateParam(url.searchParams.get('from')) ?? def.from
  const to = parseDateParam(url.searchParams.get('to')) ?? def.to

  const data = await getChurnBreakdown(supabase, { fromDate: from, toDate: to })

  const buffer = await renderToBuffer(
    <ChurnPDF data={data} fromDate={from} toDate={to} logoUrl={logoUrl} />,
  )

  return pdfResponse(buffer, `kinetic-churn-${from}-a-${to}.pdf`)
}
