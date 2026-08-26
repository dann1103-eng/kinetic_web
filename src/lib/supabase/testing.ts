/**
 * Cliente Supabase falso, SOLO para tests (vitest). No lo importa nada de runtime.
 *
 * Emula las dos cosas de PostgREST que han roto dashboards en producción:
 *
 * 1. **Los filtros encadenados se aplican de verdad** (`eq/neq/in/is/not-in/gte/lt`),
 *    con la semántica SQL de NULL: una fila con la columna en NULL NO pasa un
 *    `neq`/`not-in`/`gte`/`lt`. Así un test nota si alguien mueve un filtro de la
 *    consulta al bucle, o si filtra por una columna nullable sin querer.
 *
 * 2. **El tope de 1000 filas por respuesta.** Es la causa de que las barras de
 *    asistencia aparecieran en cero (ago 2026) y de que la agenda "no mostrara
 *    citas más allá de julio". Sin emular el tope, un test pasa feliz con datos
 *    que en producción llegan truncados y en silencio.
 */

export const POSTGREST_MAX_ROWS = 1000

type Row = Record<string, unknown>
export type FakeTables = Record<string, Row[]>

type OpKind = 'eq' | 'neq' | 'is' | 'in' | 'notIn' | 'gte' | 'lt'
interface Op {
  kind: OpKind
  col: string
  val: unknown
}

function matches(row: Row, op: Op): boolean {
  const v = row[op.col]
  switch (op.kind) {
    case 'eq':
      return v === op.val
    case 'is':
      return op.val === null ? v == null : v === op.val
    case 'in':
      return (op.val as unknown[]).includes(v)
    // Semántica SQL: comparar contra NULL da NULL, o sea la fila no pasa.
    case 'neq':
      return v != null && v !== op.val
    case 'notIn':
      return v != null && !(op.val as unknown[]).includes(v)
    case 'gte':
      return v != null && (v as string | number) >= (op.val as string | number)
    case 'lt':
      return v != null && (v as string | number) < (op.val as string | number)
  }
}

/** Parsea la lista de PostgREST `(a,b,c)` de `.not(col, 'in', '(a,b,c)')`. */
function parseInList(raw: unknown): unknown[] {
  return String(raw)
    .replace(/^\(|\)$/g, '')
    .split(',')
    .map((s) => s.trim())
}

export interface FakeSupabase {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any
  /** Cuántas respuestas sirvió cada tabla (para asertar que se paginó). */
  requestsByTable: Map<string, number>
}

export function createFakeSupabase(tables: FakeTables): FakeSupabase {
  const requestsByTable = new Map<string, number>()

  return {
    requestsByTable,
    from(table: string) {
      const ops: Op[] = []
      const orderBy: { col: string; ascending: boolean }[] = []
      let range: { from: number; to: number } | null = null

      const push = (kind: OpKind, col: string, val: unknown) => {
        ops.push({ kind, col, val })
        return builder
      }

      const run = (): Row[] => {
        requestsByTable.set(table, (requestsByTable.get(table) ?? 0) + 1)
        let rows = (tables[table] ?? []).filter((r) => ops.every((o) => matches(r, o)))
        if (orderBy.length > 0) {
          rows = rows.slice().sort((a, b) => {
            for (const { col, ascending } of orderBy) {
              const dir = ascending ? 1 : -1
              const av = a[col] as never
              const bv = b[col] as never
              if (av > bv) return dir
              if (av < bv) return -dir
            }
            return 0
          })
        }
        const from = range?.from ?? 0
        const to = range?.to ?? Infinity
        // El tope del servidor manda incluso si se pidió un rango más grande.
        const size = Math.min(to - from + 1, POSTGREST_MAX_ROWS)
        return rows.slice(from, from + size)
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select: () => builder,
        eq: (col: string, val: unknown) => push('eq', col, val),
        neq: (col: string, val: unknown) => push('neq', col, val),
        is: (col: string, val: unknown) => push('is', col, val),
        in: (col: string, val: unknown[]) => push('in', col, val),
        gte: (col: string, val: unknown) => push('gte', col, val),
        lt: (col: string, val: unknown) => push('lt', col, val),
        not: (col: string, op: string, val: unknown) =>
          op === 'in' ? push('notIn', col, parseInList(val)) : builder,
        order: (col: string, opts?: { ascending?: boolean }) => {
          orderBy.push({ col, ascending: opts?.ascending !== false })
          return builder
        },
        limit: (n: number) => {
          range = { from: 0, to: n - 1 }
          return builder
        },
        range: (from: number, to: number) => {
          range = { from, to }
          return builder
        },
        then: (
          resolve: (v: { data: Row[]; error: null }) => unknown,
          reject?: (e: unknown) => unknown,
        ) => {
          try {
            return resolve({ data: run(), error: null })
          } catch (e) {
            return reject ? reject(e) : undefined
          }
        },
      }
      return builder
    },
  }
}
