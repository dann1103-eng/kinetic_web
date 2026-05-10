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
