/**
 * Helpers para crear payment links dinámicos en n1co.
 *
 * Modelo:
 *   - Una factura del CRM = un payment link dinámico con orderReference=invoice.id
 *   - El webhook SuccessPayment trae orderReference → match directo a la factura
 */

import { n1coRequest } from './client'
import type {
  CreatePaymentLinkInput,
  CreatePaymentLinkResponse,
  N1coMetadataItem,
} from './types'
import type { Client, Invoice, Plan } from '@/types/db'

/**
 * Crea un payment link dinámico para una factura del CRM.
 * El webhook SuccessPayment posterior incluirá `orderReference=invoice.id`
 * y los items de `metadata`, permitiendo match directo.
 */
export async function createInvoicePaymentLink(args: {
  invoice: Pick<Invoice, 'id' | 'invoice_number' | 'total' | 'currency' | 'billing_cycle_id'>
  client: Pick<Client, 'id' | 'name'>
  plan?: Pick<Plan, 'id' | 'name'> | null
  periodLabel?: string
  /** Si no se pasa, se deriva de APP_URL + /n1co-callback?invoice=...&status=success. */
  successUrl?: string
  cancelUrl?: string
  /** Default 4320 (3 días). */
  expirationMinutes?: number
  locationCode?: string
  /** Metadata adicional para el webhook (ej. extraType, extraQty para autoservicio). */
  extraMetadata?: N1coMetadataItem[]
}): Promise<CreatePaymentLinkResponse> {
  const { invoice, client, plan, periodLabel } = args

  const orderName = plan?.name
    ? `FM Communications · ${plan.name}${periodLabel ? ` (${periodLabel})` : ''}`
    : `Factura ${invoice.invoice_number}`

  const orderDescription = `Factura ${invoice.invoice_number} · Cliente: ${client.name}`

  const metadata: N1coMetadataItem[] = [
    { name: 'invoiceId', value: invoice.id },
    { name: 'invoiceNumber', value: invoice.invoice_number },
    { name: 'clientId', value: client.id },
  ]
  if (invoice.billing_cycle_id) {
    metadata.push({ name: 'cycleId', value: invoice.billing_cycle_id })
  }
  if (args.extraMetadata?.length) {
    metadata.push(...args.extraMetadata)
  }

  const appUrl = getAppUrl()
  const successUrl = args.successUrl
    ?? `${appUrl}/n1co-callback?invoice=${encodeURIComponent(invoice.id)}&status=success`
  const cancelUrl = args.cancelUrl
    ?? `${appUrl}/n1co-callback?invoice=${encodeURIComponent(invoice.id)}&status=cancel`

  const input: CreatePaymentLinkInput = {
    orderReference: invoice.id,
    orderName,
    orderDescription,
    amount: invoice.total,
    successUrl,
    cancelUrl,
    expirationMinutes: args.expirationMinutes ?? 4320,
    locationCode: args.locationCode,
    metadata,
  }

  return n1coRequest<CreatePaymentLinkResponse>({
    method: 'POST',
    path: '/paymentlink/checkout',
    body: input,
  })
}

/**
 * URL absoluta de la app, para construir successUrl/cancelUrl que n1co
 * usa al redirigir el iframe post-pago.
 *  - APP_URL (preferido, configurado a mano)
 *  - VERCEL_URL (auto en Vercel; sin protocolo, hay que añadir https://)
 *  - http://localhost:3000 (fallback dev)
 */
function getAppUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '')
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

/**
 * Crea un payment link para un paquete extra mid-cycle (cambios o contenido extra).
 * Sin factura formal — el match en webhook usa metadata.packageId.
 */
export async function createPackagePaymentLink(args: {
  packageId: string
  packageType: 'cambios' | 'extra_content'
  cycleId: string
  clientId: string
  clientName: string
  amount: number
  description: string
  successUrl?: string
  cancelUrl?: string
  expirationMinutes?: number
  locationCode?: string
}): Promise<CreatePaymentLinkResponse> {
  const orderName =
    args.packageType === 'cambios'
      ? `Paquete extra de cambios · ${args.clientName}`
      : `Contenido extra · ${args.clientName}`

  const metadata: N1coMetadataItem[] = [
    { name: 'packageType', value: args.packageType },
    { name: 'packageId', value: args.packageId },
    { name: 'cycleId', value: args.cycleId },
    { name: 'clientId', value: args.clientId },
  ]

  const input: CreatePaymentLinkInput = {
    orderReference: `package:${args.packageId}`,
    orderName,
    orderDescription: args.description,
    amount: args.amount,
    successUrl: args.successUrl,
    cancelUrl: args.cancelUrl,
    expirationMinutes: args.expirationMinutes ?? 4320,
    locationCode: args.locationCode,
    metadata,
  }

  return n1coRequest<CreatePaymentLinkResponse>({
    method: 'POST',
    path: '/paymentlink/checkout',
    body: input,
  })
}

/**
 * Extrae el shortId del final de la URL del payment link
 * (ej. 'https://pay-sandbox.n1co.shop/pl/2PGRcv1q' → '2PGRcv1q').
 * Útil para reconciliación: identifica unívocamente el link al recibir el webhook.
 */
export function extractPaymentLinkId(url: string | null | undefined): string | null {
  if (!url) return null
  const m = /\/pl\/([^/?#]+)/.exec(url)
  return m ? m[1] : null
}
