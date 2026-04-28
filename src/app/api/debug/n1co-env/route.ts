/**
 * TEMPORAL: endpoint de diagnóstico para verificar qué env vars n1co están
 * disponibles en runtime. NO expone valores — solo presencia/longitud.
 * Eliminar después de confirmar que la integración funciona.
 */

import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const envs = {
    N1CO_ENVIRONMENT: process.env.N1CO_ENVIRONMENT ?? null,
    N1CO_API_BASE_URL: process.env.N1CO_API_BASE_URL ?? null,
    N1CO_CLIENT_ID_present: !!process.env.N1CO_CLIENT_ID,
    N1CO_CLIENT_ID_length: process.env.N1CO_CLIENT_ID?.length ?? 0,
    N1CO_CLIENT_SECRET_present: !!process.env.N1CO_CLIENT_SECRET,
    N1CO_CLIENT_SECRET_length: process.env.N1CO_CLIENT_SECRET?.length ?? 0,
    N1CO_WEBHOOK_SECRET_present: !!process.env.N1CO_WEBHOOK_SECRET,
    N1CO_WEBHOOK_SECRET_length: process.env.N1CO_WEBHOOK_SECRET?.length ?? 0,
    N1CO_CHECKOUT_LINK_SECRET_present: !!process.env.N1CO_CHECKOUT_LINK_SECRET,
    N1CO_CHECKOUT_LINK_SECRET_length: process.env.N1CO_CHECKOUT_LINK_SECRET?.length ?? 0,
    N1CO_PAY_BASE_URL: process.env.N1CO_PAY_BASE_URL ?? null,
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
    // Lista todas las keys que empiezan con N1CO_ — útil si hay typos
    N1CO_keys: Object.keys(process.env).filter((k) => k.startsWith('N1CO')).sort(),
  }
  return NextResponse.json(envs)
}
