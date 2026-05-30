/**
 * Ordenamiento por apellido a partir de un único campo "Nombre completo".
 *
 * Convención salvadoreña asumida: "Nombres + Apellido paterno + Apellido materno".
 * Se ordena por el **apellido paterno** (penúltima palabra) cuando hay 3+ tokens.
 *
 * Casos:
 *   - 0 tokens            → ''
 *   - 1 token  ("Zelaya") → ese token
 *   - 2 tokens ("Ana Zelaya")           → último token (apellido)
 *   - 3+ tokens ("María José Zelaya E.") → penúltimo token (apellido paterno)
 */
export function lastNameSortKey(fullName: string | null | undefined): string {
  if (!fullName) return ''
  const tokens = fullName.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return ''
  if (tokens.length === 1) return normalizeForSort(tokens[0])
  if (tokens.length === 2) return normalizeForSort(tokens[1])
  // 3+ → apellido paterno (penúltima palabra), con el resto como desempate.
  const paterno = tokens[tokens.length - 2]
  const materno = tokens[tokens.length - 1]
  const givenNames = tokens.slice(0, tokens.length - 2).join(' ')
  return normalizeForSort(`${paterno} ${materno} ${givenNames}`)
}

/** Minúsculas + sin acentos para comparar de forma estable. */
function normalizeForSort(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/** Comparador para usar en Array.sort() — ordena alfabéticamente por apellido. */
export function compareByLastName(
  aName: string | null | undefined,
  bName: string | null | undefined,
): number {
  return lastNameSortKey(aName).localeCompare(lastNameSortKey(bName), 'es')
}
