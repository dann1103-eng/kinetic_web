/**
 * Webhook receptor de eventos n1co.
 *
 * Configuración: registrar la URL `<dominio>/api/webhooks/n1co` en
 *   https://portal.n1co.shop/configuration/webhook
 * y guardar el secret HMAC en la variable de entorno `N1CO_WEBHOOK_SECRET`.
 *
 * Seguridad:
 *  - Verifica firma HMAC SHA-256 (header X-H4B-Hmac-Sha256) sobre el RAW body.
 *  - Persiste TODOS los eventos (firma válida o no) para auditoría.
 *  - Idempotencia por (order_id|subscription_id, event_type) — reintentos no
 *    aplican el mismo cambio dos veces.
 *
 * Devuelve 200 lo más rápido posible: persiste primero, procesa después.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyN1coWebhookSignature } from '@/lib/n1co/webhook-verify'
import {
  persistN1coEvent,
  alreadyProcessed,
  routeN1coEvent,
} from '@/lib/n1co/webhook-router'
import { applyN1coPaidFromWebhook } from '@/app/actions/_n1co-apply-paid'

export const runtime = 'nodejs'   // necesitamos request.text() para HMAC sobre raw
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-h4b-hmac-sha256')
  const secret = process.env.N1CO_WEBHOOK_SECRET

  // Si no hay secret configurado no podemos verificar nada → 503
  if (!secret) {
    console.error('[n1co] N1CO_WEBHOOK_SECRET no configurado')
    return new NextResponse(
      JSON.stringify({ ok: false, error: 'webhook_not_configured' }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    )
  }

  const valid = verifyN1coWebhookSignature(rawBody, signature, secret)

  // Parse defensivo: si el body no es JSON, igualmente lo guardamos como string
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody)
  } catch {
    // Aún así persistimos para auditoría
    payload = { _malformed: true, _raw: rawBody }
  }

  const supabase = createAdminClient()

  // 1. Persistir SIEMPRE (firma OK o no)
  let eventId: string
  try {
    eventId = await persistN1coEvent({
      supabase,
      payload,
      signature,
      signatureValid: valid,
    })
  } catch (err) {
    console.error('[n1co] error persistiendo evento', err)
    return new NextResponse(
      JSON.stringify({ ok: false, error: 'persist_failed' }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    )
  }

  // 2. Si firma inválida: corta aquí (evento queda registrado para investigación)
  if (!valid) {
    return new NextResponse(
      JSON.stringify({ ok: false, error: 'invalid_signature' }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    )
  }

  // 3. Idempotencia
  const dedup = await alreadyProcessed(supabase, payload, eventId)
  if (dedup) {
    await supabase
      .from('n1co_payment_events')
      .update({
        processed: true,
        matched_invoice_id: dedup.matchedInvoiceId,
        matching_strategy: 'manual',
      })
      .eq('id', eventId)
    return NextResponse.json({ ok: true, dedup: true })
  }

  // 4. Routing — pasamos supabase via closure
  const result = await routeN1coEvent(supabase, payload, (invoiceId, p) =>
    applyN1coPaidFromWebhook(invoiceId, p, supabase),
  )
  await supabase
    .from('n1co_payment_events')
    .update({
      matched_invoice_id: result.invoiceId,
      matched_client_id: result.clientId,
      matching_strategy: result.strategy,
      processed: result.processed,
      process_error: result.error,
    })
    .eq('id', eventId)

  return NextResponse.json({ ok: true, processed: result.processed, strategy: result.strategy })
}

// Aceptar solo POST
export async function GET() {
  return new NextResponse('Method Not Allowed', { status: 405 })
}
