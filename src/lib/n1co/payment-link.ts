/**
 * Genera un payment link dinámico de n1co para una factura. Comparte la lógica
 * con `tryCreateN1coPaymentLink` de la edge function `daily-cycle-runner`, para
 * que tanto las facturas manuales como las automáticas tengan link.
 *
 * Devuelve null si:
 *   - falta `N1CO_CHECKOUT_LINK_SECRET` en el entorno (no romper el flujo si la
 *     integración no está configurada),
 *   - la API responde con error.
 */
export interface N1coPaymentLink {
  url: string
  orderId: number
  shortId: string | null
}

export interface N1coLinkInput {
  invoiceId: string
  invoiceNumber: string
  amount: number
  clientId: string
  clientName: string
  planName: string
  cycleId: string | null
  periodLabel: string
  source: 'manual-invoice' | 'cron-auto-billing'
}

export async function tryCreateN1coPaymentLink(
  args: N1coLinkInput,
): Promise<N1coPaymentLink | null> {
  const checkoutSecret = process.env.N1CO_CHECKOUT_LINK_SECRET
  if (!checkoutSecret) return null

  const env = process.env.N1CO_ENVIRONMENT ?? 'sandbox'
  const payBaseUrl = env === 'production'
    ? 'https://api-pay.n1co.shop/api'
    : 'https://api-pay-sandbox.n1co.shop/api'
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? 'https://fm-full-y-connect.vercel.app').replace(/\/$/, '')

  try {
    const res = await fetch(`${payBaseUrl}/paymentlink/checkout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${checkoutSecret}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        orderReference: args.invoiceId,
        orderName: `FM Communications · Plan ${args.planName} (${args.periodLabel})`,
        orderDescription: `Factura ${args.invoiceNumber} · Cliente: ${args.clientName}`,
        amount: args.amount,
        successUrl: `${appUrl}/n1co-callback?invoice=${encodeURIComponent(args.invoiceId)}&status=success`,
        cancelUrl: `${appUrl}/n1co-callback?invoice=${encodeURIComponent(args.invoiceId)}&status=cancel`,
        expirationMinutes: 4320,
        metadata: [
          { name: 'invoiceId', value: args.invoiceId },
          { name: 'invoiceNumber', value: args.invoiceNumber },
          { name: 'clientId', value: args.clientId },
          ...(args.cycleId ? [{ name: 'cycleId', value: args.cycleId }] : []),
          { name: 'source', value: args.source },
        ],
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[n1co] payment link error', res.status, body)
      return null
    }
    const json = await res.json() as { paymentLinkUrl: string; orderId: number; orderCode: string }
    const m = /\/pl\/([^/?#]+)/.exec(json.paymentLinkUrl)
    return {
      url: json.paymentLinkUrl,
      orderId: json.orderId,
      shortId: m ? m[1] : null,
    }
  } catch (err) {
    console.error('[n1co] payment link exception', err)
    return null
  }
}
