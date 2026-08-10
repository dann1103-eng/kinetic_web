'use server'

/**
 * cycle-charge-sync.ts — el cobro del ciclo sigue a la agenda.
 *
 * Se llama después de crear / borrar / mover una cita de terapia. Si el mes ya
 * tiene ciclo generado, re-sincroniza `sessions_per_month` del snapshot con las
 * citas reales y recalcula `payment_amount_usd`. Así una terapia extra que la
 * familia pidió se cobra sola, en vez de quedar agendada pero sin cobrar.
 *
 * Ciclo PENDIENTE  → se ajusta el monto (y se regenera la factura si ya existía).
 * Ciclo PAGADO     → no se toca lo cobrado; la diferencia se arrastra al mes
 *                    siguiente vía `billing_adjustment_usd` (mismo mecanismo que
 *                    usa `upsertTreatmentPlan` al cambiar el plan de un mes ya
 *                    pagado, migs 0177/0178).
 * Ciclo ANULADO    → no se toca.
 *
 * Usa el admin client a propósito: quien agenda (una terapista, por ejemplo) no
 * necesariamente pasa `kn_can_manage_cycles()` en RLS, pero ya pasó el control de
 * permisos de agendar. Sin esto el ajuste fallaría en silencio.
 */

import { fromZonedTime } from 'date-fns-tz'
import { createAdminClient } from '@/lib/supabase/admin'
import { expectedCycleAmount } from '@/lib/domain/billing/cycle-edit'
import { isMonthlyFlatEntry } from '@/lib/domain/billing/monthly-flat'
import {
  billableSessionCounts,
  therapiesSyncedToAgenda,
  type ChargeableAppt,
} from '@/lib/domain/billing/agenda-charge-sync'
import { createInvoiceForCycle } from './kinetic-invoices'
import type {
  DiscountKind,
  MonthlySessionCycle,
  ServiceCatalogItem,
  TreatmentPlanTherapyEntry,
} from '@/types/db'

const TZ = 'America/El_Salvador'

/** Precio de catálogo de una terapia individual (BK-aware). 0 = sin precio. */
function catalogPrice(
  catalog: ServiceCatalogItem[],
  service: string,
  isMorningChild: boolean,
): number {
  const item = catalog.find(
    (c) => c.active && c.category === 'terapia_individual' && c.service_type === service,
  )
  if (!item) return 0
  if (isMorningChild && item.unit_price_bk_usd != null) return Number(item.unit_price_bk_usd)
  return Number(item.unit_price_usd ?? 0)
}

/**
 * Re-sincroniza el cobro de los ciclos de `periodMonths` con la agenda real.
 * Nunca lanza: es un efecto secundario de agendar, y un fallo acá no debe
 * tumbar la creación de la cita (queda logueado y el PDF de detalle declara la
 * diferencia).
 *
 * @param childId       niño dueño de las citas
 * @param periodMonths  meses tocados ('YYYY-MM-01'); se deduplican
 */
export async function syncCycleChargeToAgenda(
  childId: string,
  periodMonths: string[],
): Promise<void> {
  const months = [...new Set(periodMonths.filter(Boolean))]
  if (months.length === 0) return

  try {
    const admin = createAdminClient()

    for (const periodMonth of months) {
      const { data: cycleRaw } = await admin
        .from('monthly_session_cycles')
        .select('*')
        .eq('child_id', childId)
        .eq('period_month', periodMonth)
        .neq('status', 'cancelled')
        .maybeSingle()
      if (!cycleRaw) continue
      const cycle = cycleRaw as MonthlySessionCycle
      if (cycle.status !== 'generated') continue

      // Citas de terapia del mes (zona SV).
      const [y, m] = periodMonth.slice(0, 7).split('-').map(Number)
      const startISO = fromZonedTime(new Date(y, m - 1, 1, 0, 0, 0), TZ).toISOString()
      const endISO = fromZonedTime(new Date(y, m, 1, 0, 0, 0), TZ).toISOString()
      const { data: apptsRaw } = await admin
        .from('appointments')
        .select('service_type, status, event_type')
        .eq('child_id', childId)
        .eq('event_type', 'terapia')
        .gte('starts_at', startISO)
        .lt('starts_at', endISO)

      const counts = billableSessionCounts((apptsRaw ?? []) as ChargeableAppt[])
      if (counts.size === 0) continue

      const snapshot = (cycle.treatment_plan_snapshot ?? {}) as {
        therapies_json?: TreatmentPlanTherapyEntry[]
        [k: string]: unknown
      }
      const current = snapshot.therapies_json ?? []
      if (current.length === 0) continue

      // Precio de catálogo solo si aparece un servicio que no está en el plan.
      const known = new Set<string>(current.map((t) => t.service))
      let catalog: ServiceCatalogItem[] = []
      if ([...counts.keys()].some((s) => !known.has(s))) {
        const { data: catRaw } = await admin.from('service_catalog').select('*')
        catalog = (catRaw ?? []) as ServiceCatalogItem[]
      }
      const isMorningChild = current.some((t) => t.active !== false && isMonthlyFlatEntry(t))

      const synced = therapiesSyncedToAgenda(current, counts, (service) =>
        catalogPrice(catalog, service, isMorningChild),
      )
      if (synced.unpricedServices.length > 0) {
        console.warn(
          `[cycle-charge-sync] ${childId} ${periodMonth}: sin precio de catálogo para ${synced.unpricedServices.join(', ')} — quedan agendadas sin cobrar.`,
        )
      }
      if (!synced.changed) continue

      // Monto esperado con el mismo criterio que generar y editar el ciclo:
      // subtotal − descuento. (El rollover en modo 'discount' se aplica en la
      // factura, no acá — ver createInvoiceForCycle.)
      const expected = expectedCycleAmount(
        synced.therapies.map((t) => ({
          service: t.service,
          sessions_per_month: Number(t.sessions_per_month ?? 0),
          unit_cost_usd: Number(t.unit_cost_usd ?? 0),
          billing_mode: t.billing_mode,
        })),
        {
          kind: (cycle.discount_kind ?? 'none') as DiscountKind,
          value: Number(cycle.discount_value ?? 0),
        },
      )

      const newSnapshot = { ...snapshot, therapies_json: synced.therapies }

      if (cycle.payment_status === 'paid') {
        // Ya pagado: no se re-cobra el mes. La diferencia contra lo que se
        // congeló al pagar viaja a la factura del mes siguiente.
        if (cycle.paid_expected_usd == null) continue
        const adjustment = Math.round((expected - Number(cycle.paid_expected_usd)) * 100) / 100
        await admin
          .from('monthly_session_cycles')
          .update({ treatment_plan_snapshot: newSnapshot, billing_adjustment_usd: adjustment })
          .eq('id', cycle.id)
        continue
      }

      const { error: updErr } = await admin
        .from('monthly_session_cycles')
        .update({ treatment_plan_snapshot: newSnapshot, payment_amount_usd: expected })
        .eq('id', cycle.id)
        .eq('payment_status', 'pending')
      if (updErr) {
        console.error(`[cycle-charge-sync] ${cycle.id}:`, updErr.message)
        continue
      }

      // Si ya había factura emitida, regenerarla con el detalle al día.
      if (cycle.invoice_id) {
        await createInvoiceForCycle(cycle.id).catch((e) => {
          console.error(`[cycle-charge-sync] re-factura ${cycle.id} falló:`, e)
        })
      }
    }
  } catch (e) {
    console.error('[cycle-charge-sync] falló:', e)
  }
}
