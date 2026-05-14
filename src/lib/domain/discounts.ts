import type { DiscountKind } from '@/types/db'

export interface Discount {
  kind: DiscountKind
  value: number
  reason?: string | null
}

/**
 * Aplica el descuento al subtotal y devuelve el total final.
 * - 'none' o value≤0 → subtotal
 * - 'percent' → subtotal × (1 - clamp(value, 0, 100) / 100)
 * - 'fixed' → max(0, subtotal - value)
 */
export function applyDiscount(subtotal: number, d: Discount): number {
  if (d.kind === 'none' || d.value <= 0) return round2(subtotal)
  if (d.kind === 'percent') {
    const pct = Math.min(100, Math.max(0, d.value))
    return round2(subtotal * (1 - pct / 100))
  }
  return Math.max(0, round2(subtotal - d.value))
}

/** Monto del descuento (no el total). Útil para mostrar "− $X". */
export function discountAmount(subtotal: number, d: Discount): number {
  return round2(subtotal - applyDiscount(subtotal, d))
}

/** Valida que un descuento sea coherente. Devuelve error string o null si OK. */
export function validateDiscount(d: Discount): string | null {
  if (d.kind === 'none') return null
  if (d.value < 0) return 'El descuento no puede ser negativo.'
  if (d.kind === 'percent' && d.value > 100) {
    return 'El porcentaje no puede ser mayor a 100.'
  }
  return null
}

/** Etiqueta legible: "10% off", "$50 off", "Sin descuento". */
export function describeDiscount(d: Discount): string {
  if (d.kind === 'none' || d.value <= 0) return 'Sin descuento'
  if (d.kind === 'percent') return `${d.value}% de descuento`
  return `$${d.value.toFixed(2)} de descuento`
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
