/**
 * Verificación de firma de webhook n1co.
 *
 * n1co firma con HMAC SHA-256 sobre el RAW body de la petición POST,
 * y envía el resultado en base64 en el header `X-H4B-Hmac-Sha256`.
 *
 * El secret se obtiene al registrar el webhook en
 *   https://portal.n1co.shop/configuration/webhook
 * y debe guardarse en la variable de entorno `N1CO_WEBHOOK_SECRET`.
 *
 * IMPORTANTE: usa el RAW body antes de JSON.parse — re-serializar cambia
 * espaciado/orden y rompe la firma.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

export function verifyN1coWebhookSignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string,
): boolean {
  if (!signature) return false
  let expected: string
  try {
    expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64')
  } catch {
    return false
  }
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(signature, 'utf8')
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}
