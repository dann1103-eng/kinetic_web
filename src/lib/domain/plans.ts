import type { PlanLimits, ContentType, Plan } from '@/types/db'

/** Tipos vendibles como contenido extra y su precio unitario (USD) */
export const EXTRA_CONTENT_PRICES: Partial<Record<ContentType, number>> = {
  video_corto: 20,
  reel: 25,
  short: 15,
  estatico: 15,
}

/** Human-readable label for each content type */
export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  historia: 'Historias',
  estatico: 'Estáticos',
  video_corto: 'Videos cortos (30 seg)',
  reel: 'Videos largos (90 seg)',
  short: 'Shorts (10 seg)',
  produccion: 'Producciones',
  reunion: 'Reuniones',
  matriz_contenido: 'Matriz de contenido',
}

/** Ordered list for display */
export const CONTENT_TYPES: ContentType[] = [
  'historia',
  'estatico',
  'video_corto',
  'reel',
  'short',
  'produccion',
  'reunion',
  'matriz_contenido',
]

/** Content types that never carry over between billing cycles */
export const NON_CARRYOVER_TYPES: ContentType[] = ['produccion', 'reunion', 'matriz_contenido']

/** Tipos de contenido "tippables" — el operador puede elegir uno u otro al registrar.
 *  En planes con `unified_content_limit`, estos tipos comparten un pool común. */
export const TIPPABLE_CONTENT_TYPES: ContentType[] = ['estatico', 'video_corto', 'reel', 'short']

/** Mapeo ContentType → llave del PlanLimits (`historia` → `historias`). */
export const CONTENT_TO_PLAN_KEY: Record<ContentType, keyof PlanLimits> = {
  historia: 'historias',
  estatico: 'estaticos',
  video_corto: 'videos_cortos',
  reel: 'reels',
  short: 'shorts',
  produccion: 'producciones',
  reunion: 'reuniones',
  matriz_contenido: 'matrices_contenido',
}

/** Convierte un rollover con llaves de PlanLimits a llaves de ContentType. */
export function rolloverToContentType(
  rollover: Partial<PlanLimits> | null | undefined,
): Partial<Record<ContentType, number>> {
  if (!rollover) return {}
  return {
    historia: rollover.historias ?? 0,
    estatico: rollover.estaticos ?? 0,
    video_corto: rollover.videos_cortos ?? 0,
    reel: rollover.reels ?? 0,
    short: rollover.shorts ?? 0,
    produccion: rollover.producciones ?? 0,
    reunion: rollover.reuniones ?? 0,
  }
}

/** Convert PlanLimits JSON to ContentType-keyed record */
export function limitsToRecord(limits: PlanLimits): Record<ContentType, number> {
  return {
    historia: limits.historias,
    estatico: limits.estaticos,
    video_corto: limits.videos_cortos,
    reel: limits.reels,
    short: limits.shorts,
    produccion: limits.producciones,
    reunion: limits.reuniones ?? 0,
    matriz_contenido: limits.matrices_contenido ?? 1,
  }
}

/** Compute effective limits = snapshot + rollover */
export function effectiveLimits(
  snapshot: PlanLimits,
  rollover: Partial<PlanLimits> | null
): Record<ContentType, number> {
  const base = limitsToRecord(snapshot)
  if (!rollover) return base

  const roll: Partial<Record<ContentType, number>> = {
    historia: rollover.historias ?? 0,
    estatico: rollover.estaticos ?? 0,
    video_corto: rollover.videos_cortos ?? 0,
    reel: rollover.reels ?? 0,
    short: rollover.shorts ?? 0,
    produccion: rollover.producciones ?? 0,
    reunion: rollover.reuniones ?? 0,
    matriz_contenido: 0, // never carries over
  }

  return {
    historia: base.historia + (roll.historia ?? 0),
    estatico: base.estatico + (roll.estatico ?? 0),
    video_corto: base.video_corto + (roll.video_corto ?? 0),
    reel: base.reel + (roll.reel ?? 0),
    short: base.short + (roll.short ?? 0),
    produccion: base.produccion + (roll.produccion ?? 0),
    reunion: base.reunion + (roll.reunion ?? 0),
    matriz_contenido: base.matriz_contenido,
  }
}

/**
 * Aplica `content_limits_override_json` sobre los límites calculados.
 * El override es un mapa parcial ContentType → número absoluto que reemplaza
 * la entrada correspondiente en los límites. Si no hay override, devuelve
 * los límites sin cambios.
 */
export function applyContentLimitsWithOverride<T extends Record<string, number>>(
  limits: T,
  override: Record<string, number> | null | undefined,
): T {
  if (!override) return limits
  return { ...limits, ...override }
}

/**
 * Ajusta los límites para planes con `unified_content_limit` (pool compartido).
 *
 * Toma los límites base (`effectiveLimits(...)`) y, si el snapshot incluye
 * `unified_content_limit`, redistribuye los tipos tippables:
 *   remainingPool = pool - sum(totals[tippable])
 *   limits[t] = remainingPool + totals[t]
 * Esto permite al operador elegir cualquier tipo hasta agotar el pool compartido,
 * sin romper el check `totals[t] >= limits[t]`.
 *
 * Planes sin `unified_content_limit` retornan los límites base sin modificar.
 */
export function applyUnifiedPool(
  base: Record<ContentType, number>,
  snapshot: PlanLimits,
  totals: Record<ContentType, number>,
): Record<ContentType, number> {
  const pool = snapshot.unified_content_limit
  if (pool == null) return base

  const consumed = TIPPABLE_CONTENT_TYPES.reduce((sum, t) => sum + (totals[t] ?? 0), 0)
  const remaining = Math.max(0, pool - consumed)

  const out = { ...base }
  for (const t of TIPPABLE_CONTENT_TYPES) {
    out[t] = remaining + (totals[t] ?? 0)
  }
  return out
}

/**
 * Genera una descripción legible del contenido incluido en un plan.
 * Usada como descripción de la línea de item en cotizaciones.
 * Ejemplo: "Pool de 12 contenidos · 4 historias · 5 cambios"
 */
export function formatPlanDescription(plan: Plan): string {
  const limits = plan.limits_json as PlanLimits
  const parts: string[] = []

  if (plan.unified_content_limit != null) {
    // Plan con pool unificado de contenidos tippables
    parts.push(`Pool de ${plan.unified_content_limit} contenidos`)
    const historias = limits.historias ?? 0
    if (historias > 0) parts.push(`${historias} historia${historias !== 1 ? 's' : ''}`)
    const producciones = limits.producciones ?? 0
    if (producciones > 0) parts.push(`${producciones} producción${producciones !== 1 ? 'es' : ''}`)
    const reuniones = limits.reuniones ?? 0
    if (reuniones > 0) parts.push(`${reuniones} reunión${reuniones !== 1 ? 'es' : ''}`)
  } else {
    // Plan con límites individuales por tipo de contenido
    const entries: Array<[number, string, string]> = [
      [limits.estaticos ?? 0,     'estático',    'estáticos'],
      [limits.videos_cortos ?? 0, 'video corto', 'videos cortos'],
      [limits.reels ?? 0,         'reel',        'reels'],
      [limits.shorts ?? 0,        'short',       'shorts'],
      [limits.historias ?? 0,     'historia',    'historias'],
      [limits.producciones ?? 0,  'producción',  'producciones'],
      [limits.reuniones ?? 0,     'reunión',     'reuniones'],
    ]
    for (const [qty, singular, plural] of entries) {
      if (qty > 0) parts.push(`${qty} ${qty === 1 ? singular : plural}`)
    }
  }

  if (plan.cambios_included > 0) {
    parts.push(`${plan.cambios_included} cambio${plan.cambios_included !== 1 ? 's' : ''}`)
  }

  return parts.length > 0 ? parts.join(' · ') : plan.name
}

/**
 * Consumo total del pool unificado (suma de tipos tippables).
 * Retorna null si el plan no usa `unified_content_limit`.
 */
export function unifiedPoolUsage(
  snapshot: PlanLimits,
  totals: Record<ContentType, number>,
): { used: number; limit: number } | null {
  const pool = snapshot.unified_content_limit
  if (pool == null) return null
  const used = TIPPABLE_CONTENT_TYPES.reduce((sum, t) => sum + (totals[t] ?? 0), 0)
  return { used, limit: pool }
}
