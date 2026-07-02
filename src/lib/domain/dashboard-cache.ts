import 'server-only'
import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMgmtDashboardData } from './global-dashboard'
import { getMgmtWidgetsData } from './dashboard-widgets'

/**
 * Versiones CACHEADAS de los datos del dashboard de gestión (admin/directora).
 *
 * SEGURIDAD — por qué una caché compartida acá NO filtra datos entre usuarios:
 * ambos datasets son AGENCY-WIDE (los mismos números para cualquier admin/directora,
 * no dependen de quién mira). El acceso ya está gateado en la página: solo los roles
 * KINETIC_MGMT llegan a llamar estas funciones. No cachear acá nada per-usuario.
 *
 * Por qué admin client adentro: unstable_cache NO puede leer cookies/headers (la
 * sesión de Supabase) dentro del scope cacheado. Como la data es agency-wide y el
 * usuario ya está autorizado por la página, usar el service role adentro devuelve
 * exactamente lo mismo que vería por RLS.
 *
 * TTL corto (60s): un dashboard de KPIs tolera ese retraso; tras el TTL se revalida
 * solo. Se puede invalidar antes con revalidateTag('dashboard-mgmt') desde las
 * mutaciones si en el futuro se quiere frescura inmediata.
 *
 * NOTA Next 16: unstable_cache está marcado legacy (lo reemplaza `use cache`), pero
 * `use cache` exige el flag cacheComponents (opt-in que cambia el rendering de TODA
 * la app). unstable_cache sigue funcionando y es la opción quirúrgica y de bajo riesgo.
 */

const DASHBOARD_TTL_SECONDS = 60

export const getCachedMgmtDashboardData = unstable_cache(
  async () => getMgmtDashboardData(createAdminClient()),
  ['mgmt-dashboard'],
  { revalidate: DASHBOARD_TTL_SECONDS, tags: ['dashboard-mgmt'] },
)

export const getCachedMgmtWidgetsData = unstable_cache(
  async () => getMgmtWidgetsData(createAdminClient()),
  ['mgmt-widgets'],
  { revalidate: DASHBOARD_TTL_SECONDS, tags: ['dashboard-mgmt'] },
)
