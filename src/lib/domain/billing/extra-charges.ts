/**
 * Líneas de cobro que no son terapias (mig 0185): materiales, una evaluación
 * suelta, un cargo acordado con la familia.
 *
 * El monto del ciclo y las líneas de la factura salían las dos de
 * `therapies_json`, así que todo lo que se cobrara tenía que ser una terapia.
 * Meter "materiales" ahí lo habría hecho aparecer en "días y fechas por terapia"
 * y lo habría metido en el emparejado con la agenda, que cuenta citas.
 *
 * **Tolera que la columna no exista.** El deploy sale antes que la migración
 * manual, así que `normalizeExtraCharges` acepta `undefined` y devuelve lista
 * vacía en vez de romper. Las lecturas de ciclos usan `select('*')` por la misma
 * razón (mismo patrón que `suspension_id` de la 0184).
 */

export interface ExtraChargeLine {
  description: string
  quantity: number
  unit_price: number
}

/** Lo que suma (o resta, si el precio es negativo) el conjunto de líneas. */
export function extraChargesTotal(lines: ExtraChargeLine[]): number {
  const sum = lines.reduce((s, l) => s + Number(l.quantity ?? 0) * Number(l.unit_price ?? 0), 0)
  return Math.round(sum * 100) / 100
}

/**
 * Lee el jsonb del ciclo con desconfianza: puede venir `undefined` (columna sin
 * migrar), `null`, o con filas incompletas cargadas a mano.
 */
export function normalizeExtraCharges(raw: unknown): ExtraChargeLine[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
    .map((l) => ({
      description: String(l.description ?? '').trim(),
      quantity: Number(l.quantity ?? 0),
      unit_price: Number(l.unit_price ?? 0),
    }))
    .filter((l) => l.description.length > 0 && Number.isFinite(l.quantity) && Number.isFinite(l.unit_price))
}
