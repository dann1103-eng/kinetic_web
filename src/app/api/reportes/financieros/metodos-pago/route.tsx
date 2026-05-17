import { renderToBuffer } from '@react-pdf/renderer'
import {
  ensureFinancialReportAccess,
  parseDateParam,
  pdfResponse,
} from '../_shared'
import { getPaymentMethodBreakdown } from '@/lib/domain/reports/financial'
import { PaymentMethodPDF } from '@/components/reportes/pdf/PaymentMethodPDF'

export const dynamic = 'force-dynamic'

function defaultRange(): { from: string; to: string } {
  const now = new Date()
  const year = now.getFullYear()
  return { from: `${year}-01-01`, to: now.toISOString().slice(0, 10) }
}

export async function GET(req: Request) {
  const access = await ensureFinancialReportAccess()
  if ('response' in access) return access.response
  const { supabase, logoUrl } = access.context

  const url = new URL(req.url)
  const def = defaultRange()
  const from = parseDateParam(url.searchParams.get('from')) ?? def.from
  const to = parseDateParam(url.searchParams.get('to')) ?? def.to

  const data = await getPaymentMethodBreakdown(supabase, { fromDate: from, toDate: to })

  const buffer = await renderToBuffer(
    <PaymentMethodPDF
      rows={data.rows}
      totalUsd={data.totalUsd}
      totalCount={data.totalCount}
      fromDate={from}
      toDate={to}
      logoUrl={logoUrl}
    />,
  )

  return pdfResponse(buffer, `kinetic-metodos-pago-${from}-a-${to}.pdf`)
}
