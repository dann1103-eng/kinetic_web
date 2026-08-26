/**
 * Lectura paginada para escapar del tope de filas de PostgREST.
 *
 * PostgREST corta CADA respuesta en 1000 filas y no avisa: no hay error, solo
 * llegan menos datos. Ya rompió tres cosas distintas en este proyecto:
 *
 * - la agenda "no mostraba citas más allá de julio" (>2400 citas);
 * - las barras de asistencia de /ninos aparecían todas en cero (agosto 2026
 *   acumuló 1049 lápidas `rescheduled` sobre 1709 filas y las completadas
 *   quedaban fuera de la respuesta);
 * - la lista pasada de los programas matutinos, que crece como
 *   niños × días del mes y pasa las mil filas con tres grupos.
 *
 * Filtrar por estado en la consulta ayuda, pero solo corre la pared: cualquier
 * consulta cuyo tamaño crezca con la cantidad de niños o de meses tiene que
 * paginarse.
 *
 * `makeQuery` debe devolver un builder ya con select/filtros/**order** y sin
 * `.range`. El orden explícito no es opcional: sin `order by` Postgres no
 * garantiza el mismo orden entre páginas, y paginar podría repetir u omitir
 * filas. Usar una columna única (normalmente `id`), o agregarla como desempate.
 */

export const POSTGREST_PAGE_SIZE = 1000

/** Techo de seguridad: 100 páginas = 100 000 filas. Evita un bucle infinito. */
const MAX_PAGES = 100

export async function fetchAllPaged<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  makeQuery: () => any,
  label = 'query',
): Promise<T[]> {
  const all: T[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * POSTGREST_PAGE_SIZE
    const { data, error } = await makeQuery().range(from, from + POSTGREST_PAGE_SIZE - 1)
    if (error) {
      // Se devuelve lo que sí llegó (misma degradación que antes de paginar),
      // pero queda registrado: un fallo mudo acá se ve como "faltan datos".
      console.error(`[fetchAllPaged] ${label} falló en la página ${page}:`, error)
      return all
    }
    const rows = (data ?? []) as T[]
    all.push(...rows)
    if (rows.length < POSTGREST_PAGE_SIZE) return all
  }
  console.error(`[fetchAllPaged] ${label} superó ${MAX_PAGES} páginas; se trunca.`)
  return all
}
