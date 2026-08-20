import type {
  ServiceCatalogItem,
  ServiceCategory,
  MorningProgram,
} from '@/types/db'

/**
 * Encuentra la matrícula vigente para un programa y un mes (1-12) dado.
 * Las matrículas BK/LK comparten precios con AE pero usan grupos separados
 * por audit (matricula_bk_lk vs matricula_ae).
 */
export function findMatriculaForMonth(
  items: ServiceCatalogItem[],
  program: MorningProgram,
  monthOneBased: number,
): ServiceCatalogItem | null {
  const group = program === 'aula_educativa' ? 'matricula_ae' : 'matricula_bk_lk'
  return (
    items.find(
      (i) =>
        i.active &&
        i.proration_group === group &&
        i.applies_from_month !== null &&
        i.applies_to_month !== null &&
        monthOneBased >= i.applies_from_month &&
        monthOneBased <= i.applies_to_month,
    ) ?? null
  )
}

/**
 * Encuentra el material didáctico vigente para un mes (1-12) dado.
 * Aplica a Blue Kids, Learning Kids y Aula Educativa por igual.
 */
export function findMaterialForMonth(
  items: ServiceCatalogItem[],
  monthOneBased: number,
): ServiceCatalogItem | null {
  return (
    items.find(
      (i) =>
        i.active &&
        i.proration_group === 'material_bk_ae' &&
        i.applies_from_month !== null &&
        i.applies_to_month !== null &&
        monthOneBased >= i.applies_from_month &&
        monthOneBased <= i.applies_to_month,
    ) ?? null
  )
}

/**
 * Encuentra la mensualidad para un programa + frecuencia (días/semana).
 * Aula Educativa no tiene tarifa de 4 días.
 */
export function findMensualidad(
  items: ServiceCatalogItem[],
  program: MorningProgram,
  daysPerWeek: number,
): ServiceCatalogItem | null {
  return (
    items.find(
      (i) =>
        i.active &&
        i.category === 'mensualidad' &&
        i.morning_program === program &&
        i.days_per_week === daysPerWeek,
    ) ?? null
  )
}

/** Filtra y ordena los items activos de una categoría. */
export function listByCategory(
  items: ServiceCatalogItem[],
  category: ServiceCategory,
  options: { includeInactive?: boolean } = {},
): ServiceCatalogItem[] {
  return items
    .filter(
      (i) => i.category === category && (options.includeInactive || i.active),
    )
    .sort(
      (a, b) =>
        a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'es'),
    )
}

/** Agrupa todos los items por categoría, manteniendo el orden de SERVICE_CATEGORY_ORDER. */
export function groupByCategory(
  items: ServiceCatalogItem[],
  options: { includeInactive?: boolean } = {},
): Record<ServiceCategory, ServiceCatalogItem[]> {
  const result = {} as Record<ServiceCategory, ServiceCatalogItem[]>
  for (const item of items) {
    if (!options.includeInactive && !item.active) continue
    if (!result[item.category]) result[item.category] = []
    result[item.category].push(item)
  }
  for (const cat of Object.keys(result) as ServiceCategory[]) {
    result[cat].sort(
      (a, b) =>
        a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'es'),
    )
  }
  return result
}

// =============================================================================
// Alta de artículos nuevos (formulario de /catalogos)
// =============================================================================

/**
 * Convierte el nombre visible en un código snake_case para `service_catalog.code`.
 *
 * El código es un detalle técnico (clave única, referenciada por
 * `appointments.service_code` e `invoices`), pero quien carga el catálogo es
 * recepción o contabilidad — no tienen por qué inventarlo. Se propone desde el
 * nombre y queda editable.
 *
 * Garantiza pasar el `/^[a-z0-9_]+$/` que valida `createServiceCatalogItem`, o
 * devuelve cadena vacía si el nombre no tiene ni una letra ni un número (el
 * formulario pide entonces uno a mano).
 */
export function slugifyCatalogCode(name: string): string {
  return normalize(name)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** Qué campos extra exige cada categoría del catálogo. */
export interface CategoryFieldRules {
  /** Mensualidad: programa matutino + días/semana son obligatorios. */
  needsProgram: boolean
  /** Terapia individual: se enlaza a un `ServiceType` para heredar el precio. */
  needsServiceType: boolean
  /** Matrícula y material: pueden prorratearse por rango de meses. */
  allowsProration: boolean
}

/**
 * Única fuente de verdad de qué pide cada categoría, para que el formulario no
 * se desincronice de la validación del servidor ni de los CHECK de la base
 * (`mensualidad_requires_program`, `proration_requires_months`, mig 0107).
 */
export function categoryFieldRules(category: ServiceCategory): CategoryFieldRules {
  return {
    needsProgram: category === 'mensualidad',
    needsServiceType: category === 'terapia_individual',
    allowsProration: category === 'matricula' || category === 'material_didactico',
  }
}

/**
 * Orden que le toca a un artículo nuevo: al final de su categoría.
 *
 * El default de la columna es 0, que lo mandaría al tope de la lista por encima
 * de todo lo ya cargado. Cuenta también los inactivos: siguen ocupando lugar y
 * pueden reactivarse.
 */
export function nextSortOrder(
  items: ServiceCatalogItem[],
  category: ServiceCategory,
): number {
  const orders = items
    .filter((i) => i.category === category)
    .map((i) => i.sort_order ?? 0)
  if (orders.length === 0) return 0
  return Math.max(...orders) + 1
}

/** Búsqueda fuzzy simple (case-insensitive, sin acentos) para el combobox. */
export function searchItems(
  items: ServiceCatalogItem[],
  query: string,
): ServiceCatalogItem[] {
  const q = normalize(query)
  if (!q) return items
  return items.filter((i) => {
    const haystack = normalize(`${i.name} ${i.code} ${i.description ?? ''}`)
    return haystack.includes(q)
  })
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}
