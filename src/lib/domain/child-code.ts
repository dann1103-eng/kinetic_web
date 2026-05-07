/**
 * Generación del código del niño (Kinetic).
 *
 * Reglas:
 *   - Código = iniciales de los apellidos (últimas 2 palabras del full_name).
 *     Ej: "Roberto Andrés Flores Morataya" → "FM"
 *         "Ana Sofía Flores Morataya"      → "FM" (colisión)
 *   - Si el código ya existe en la BD, se agrega sufijo numérico: "FM2", "FM3", etc.
 *   - 1 sola palabra → letra duplicada ("Ana" → "AA").
 *   - 2 palabras → inicial de cada una.
 *   - 3+ palabras → últimas 2 (apellidos).
 *
 * NOTA: la generación final con verificación de colisión vive en SQL
 *       (`public.generate_child_code`, en migración 0091). Este helper se usa
 *       en el cliente para PREVISUALIZAR el código que tendría un nombre antes
 *       de insert (UX). El código real se asigna por trigger BEFORE INSERT.
 */

/**
 * Calcula el código BASE (sin verificar colisiones) a partir del nombre completo.
 * Para verificar colisiones, llamar a la función SQL `generate_child_code`.
 */
export function computeChildCodeBase(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean)
  const n = words.length

  if (n === 0) return 'XX'

  if (n === 1) {
    const first = words[0][0]?.toUpperCase() ?? 'X'
    return first + first
  }

  if (n === 2) {
    return (
      (words[0][0]?.toUpperCase() ?? 'X') +
      (words[1][0]?.toUpperCase() ?? 'X')
    )
  }

  // 3+ palabras: tomar últimas 2 (apellidos)
  return (
    (words[n - 2][0]?.toUpperCase() ?? 'X') +
    (words[n - 1][0]?.toUpperCase() ?? 'X')
  )
}

/**
 * Dado el código base y la lista de códigos ya tomados, devuelve el primer
 * código libre (con sufijo numérico si hay colisión).
 *
 * Útil para previsualizar UX antes de insert. No es la fuente de verdad: el
 * trigger SQL hace la asignación final.
 */
export function findFreeChildCode(
  base: string,
  taken: ReadonlySet<string>,
): string {
  if (!taken.has(base)) return base
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${base}${i}`
    if (!taken.has(candidate)) return candidate
  }
  // Fallback paranoico (no debería alcanzarse)
  return `${base}_${Date.now()}`
}

/**
 * Conveniencia: combina compute + find en un solo paso.
 */
export function previewChildCode(
  fullName: string,
  takenCodes: ReadonlySet<string>,
): string {
  return findFreeChildCode(computeChildCodeBase(fullName), takenCodes)
}
