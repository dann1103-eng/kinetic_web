import 'server-only'
import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getMonthlyRevenue,
  getAnnualComparison,
  getPaymentMethodBreakdown,
  getChurnBreakdown,
} from './financial'

/**
 * Versiones CACHEADAS de los reportes financieros. Mismo razonamiento de seguridad
 * que dashboard-cache.ts: los datos son AGENCY-WIDE (agregados sobre
 * monthly_session_cycles / children), idénticos para cualquier rol autorizado
 * (admin/directora/contable/recepcion), y el acceso ya está gateado en la página.
 * → una caché compartida NO filtra datos entre usuarios.
 *
 * La clave de caché incluye los filtros (año / rango de fechas) para no mezclar
 * resultados de distintos períodos. Crear el unstable_cache por-request con las
 * keyParts dinámicas es el patrón documentado (la persistencia se basa en las
 * keyParts, no en la identidad de la función). Se usa admin client adentro porque
 * unstable_cache no puede leer cookies/headers en el scope cacheado.
 *
 * TTL 120s: los reportes toleran más retraso que el dashboard en vivo.
 */

const REPORTS_TTL_SECONDS = 120

export function getCachedMonthlyRevenue(opts: { year: number }) {
  return unstable_cache(
    () => getMonthlyRevenue(createAdminClient(), opts),
    ['reports-monthly-revenue', String(opts.year)],
    { revalidate: REPORTS_TTL_SECONDS, tags: ['reports-financial'] },
  )()
}

export function getCachedAnnualComparison(opts: { year: number }) {
  return unstable_cache(
    () => getAnnualComparison(createAdminClient(), opts),
    ['reports-annual-comparison', String(opts.year)],
    { revalidate: REPORTS_TTL_SECONDS, tags: ['reports-financial'] },
  )()
}

export function getCachedPaymentMethodBreakdown(opts: {
  fromDate: string
  toDate: string
}) {
  return unstable_cache(
    () => getPaymentMethodBreakdown(createAdminClient(), opts),
    ['reports-payment-method', opts.fromDate, opts.toDate],
    { revalidate: REPORTS_TTL_SECONDS, tags: ['reports-financial'] },
  )()
}

export function getCachedChurnBreakdown(opts: {
  fromDate: string
  toDate: string
}) {
  return unstable_cache(
    () => getChurnBreakdown(createAdminClient(), opts),
    ['reports-churn', opts.fromDate, opts.toDate],
    { revalidate: REPORTS_TTL_SECONDS, tags: ['reports-financial'] },
  )()
}
