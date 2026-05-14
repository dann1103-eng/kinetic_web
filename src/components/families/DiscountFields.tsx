'use client'

import {
  DISCOUNT_KIND_LABELS,
  type DiscountKind,
} from '@/types/db'
import {
  applyDiscount,
  discountAmount,
} from '@/lib/domain/discounts'

interface Props {
  subtotal: number
  kind: DiscountKind
  value: number
  reason: string
  onChangeKind: (kind: DiscountKind) => void
  onChangeValue: (value: number) => void
  onChangeReason: (reason: string) => void
  /** Si true, los inputs son disabled. */
  disabled?: boolean
}

const KIND_OPTIONS: DiscountKind[] = ['none', 'percent', 'fixed']

export function DiscountFields({
  subtotal,
  kind,
  value,
  reason,
  onChangeKind,
  onChangeValue,
  onChangeReason,
  disabled,
}: Props) {
  const discount = { kind, value }
  const off = discountAmount(subtotal, discount)
  const total = applyDiscount(subtotal, discount)
  const showDetails = kind !== 'none'

  return (
    <section className="rounded-2xl border border-fm-outline-variant/20 bg-fm-surface-container-low/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-fm-on-surface">Descuento</h3>
        <div className="text-xs text-fm-on-surface-variant tabular-nums">
          Subtotal: ${subtotal.toFixed(2)}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <Field label="Tipo">
          <select
            value={kind}
            disabled={disabled}
            onChange={(e) => onChangeKind(e.target.value as DiscountKind)}
            className="w-full rounded-md border border-fm-outline-variant/30 bg-white dark:bg-fm-surface-container-lowest px-2 py-1.5 text-sm"
          >
            {KIND_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {DISCOUNT_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>

        {showDetails && (
          <Field
            label={kind === 'percent' ? 'Porcentaje (0-100)' : 'Monto USD'}
          >
            <input
              type="number"
              min={0}
              max={kind === 'percent' ? 100 : undefined}
              step={kind === 'percent' ? 1 : 0.01}
              value={value || ''}
              disabled={disabled}
              onChange={(e) =>
                onChangeValue(Math.max(0, Number(e.target.value)))
              }
              className="w-full rounded-md border border-fm-outline-variant/30 bg-white dark:bg-fm-surface-container-lowest px-2 py-1.5 text-sm tabular-nums"
            />
          </Field>
        )}

        {showDetails && (
          <Field label="Motivo (opcional)">
            <input
              type="text"
              value={reason}
              disabled={disabled}
              onChange={(e) => onChangeReason(e.target.value)}
              placeholder="Ej. beca, hermanos, pago anual…"
              className="w-full rounded-md border border-fm-outline-variant/30 bg-white dark:bg-fm-surface-container-lowest px-2 py-1.5 text-sm"
            />
          </Field>
        )}
      </div>

      {showDetails && (
        <div className="flex items-center justify-between rounded-xl bg-fm-surface-container-lowest border border-fm-outline-variant/20 px-4 py-3 text-sm">
          <span className="text-fm-on-surface-variant">
            Descuento aplicado:{' '}
            <span className="font-semibold text-fm-on-surface tabular-nums">
              − ${off.toFixed(2)}
            </span>
          </span>
          <span className="font-bold text-fm-primary tabular-nums">
            Total: ${total.toFixed(2)}
          </span>
        </div>
      )}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-bold uppercase tracking-wider text-fm-on-surface-variant block">
        {label}
      </label>
      {children}
    </div>
  )
}
