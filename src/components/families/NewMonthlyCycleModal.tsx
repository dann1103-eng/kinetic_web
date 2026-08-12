'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  confirmMonthlyPaymentAndGenerate,
  generateCycleAgenda,
  dryRunMonthlyGeneration,
  getCycleRolloverPreview,
  type RolloverPreview,
} from '@/app/actions/monthly-cycles'
import { SERVICE_TYPE_LABELS } from '@/types/db'
import type {
  DiscountKind,
  MonthlyCandidateAppointment,
  MonthlyCandidatesResult,
  MonthlySessionCycle,
  MorningProgram,
  ServiceCatalogItem,
  ServiceType,
  TherapyBillingMode,
  TreatmentPlan,
} from '@/types/db'
import { applyDiscount } from '@/lib/domain/discounts'
import { isChildPaused } from '@/lib/domain/intake-pipeline'
import { describeMonthlyConflict } from '@/lib/domain/appointment'
import {
  daysPerWeekLabel,
  isMonthlyFlatEntry,
  therapyLineAmount,
} from '@/lib/domain/billing/monthly-flat'
import { DiscountFields } from './DiscountFields'
import { DraggableCycleCalendar, candidateSignature } from './DraggableCycleCalendar'
import {
  MorningProgramCycleSection,
  type MorningGroupSelection,
  type MorningCandidateOut,
} from './MorningProgramCycleSection'

interface Props {
  childId: string
  plan: TreatmentPlan
  /** Catálogo de terapias individuales — para precargar precios estándar. */
  therapyCatalog?: ServiceCatalogItem[]
  /** Programa matutino del niño — activa el precio BK precargado. */
  enrolledProgram?: MorningProgram | null
  /** Períodos ya existentes (no cancelled) para evitar duplicar. */
  existingPeriods: string[]
  /** Fase del niño — para avisar si está en pausa (generar le agenda el mes
   *  completo, y desde el cobro automático eso además se le cobra). */
  childPhaseCode?: string | null
  onClose: () => void
  onCreated: (cycle: MonthlySessionCycle) => void
}

/** Precio estándar del catálogo para un service_type (BK-aware). */
function catalogPriceFor(
  catalog: ServiceCatalogItem[] | undefined,
  service: string,
  enrolledProgram: MorningProgram | null | undefined,
  daysPerWeek?: number | null,
): number {
  if (!catalog) return 0
  // 1) Terapia individual por service_type.
  const ind = catalog.find(
    (c) => c.active && c.category === 'terapia_individual' && c.service_type === service,
  )
  if (ind) {
    if (enrolledProgram && ind.unit_price_bk_usd != null) return Number(ind.unit_price_bk_usd)
    return Number(ind.unit_price_usd)
  }
  // 2) Programa matutino (blue_kids / learning_kids / aula_educativa):
  //    mensualidad fija. Se busca la variante exacta de días/semana del plan;
  //    si el plan no la trae, se sugiere el paquete de más días y se ajusta.
  if (service === 'blue_kids' || service === 'learning_kids' || service === 'aula_educativa') {
    const variants = catalog.filter(
      (c) => c.active && c.category === 'mensualidad' && c.morning_program === service,
    )
    const exact = daysPerWeek
      ? variants.find((c) => c.days_per_week === daysPerWeek)
      : undefined
    const mens =
      exact ?? variants.sort((a, b) => (b.days_per_week ?? 0) - (a.days_per_week ?? 0))[0]
    if (mens) return Number(mens.unit_price_usd)
  }
  return 0
}

interface PricedTherapy {
  service: string
  sessions_per_month: number
  unit_cost_usd: number
  /** 'monthly_flat' ⇒ mensualidad fija: subtotal = 1 × precio. */
  billing_mode?: TherapyBillingMode
  days_per_week?: number | null
}

/** Default: el próximo mes (1ro). Devuelve 'YYYY-MM'. */
function defaultPeriodMonth(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 2 // +1 para 1-indexed, +1 para "próximo"
  const y = month > 12 ? year + 1 : year
  const m = ((month - 1) % 12) + 1
  return `${y}-${String(m).padStart(2, '0')}`
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-SV', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function NewMonthlyCycleModal({
  childId,
  plan,
  therapyCatalog,
  enrolledProgram,
  existingPeriods,
  childPhaseCode,
  onClose,
  onCreated,
}: Props) {
  // Precios por terapia — precargados del CATÁLOGO (no del plan, que ya no
  // guarda precios). La persona que cobra puede editar cada precio.
  const [priced, setPriced] = useState<PricedTherapy[]>(() =>
    (plan.therapies_json ?? [])
      .filter((t) => t.active)
      .map((t) => ({
        service: t.service,
        sessions_per_month: t.sessions_per_month || 0,
        // Si el plan trae un precio (>0) lo respetamos; si no, jalamos del catálogo
        // (para mensualidades, la variante exacta de días/semana del plan).
        unit_cost_usd:
          (t.unit_cost_usd && t.unit_cost_usd > 0)
            ? t.unit_cost_usd
            : catalogPriceFor(therapyCatalog, t.service, enrolledProgram, t.days_per_week),
        // Modalidad resuelta (explícita o implícita por servicio matutino).
        billing_mode: isMonthlyFlatEntry(t) ? 'monthly_flat' : 'per_session',
        days_per_week: t.days_per_week ?? null,
      })),
  )

  function patchPrice(idx: number, unit: number) {
    setPriced((prev) => prev.map((p, i) => (i === idx ? { ...p, unit_cost_usd: unit } : p)))
  }

  // Subtotal: sesiones × precio para terapias; 1 × mensualidad para programas
  // matutinos (suscripción — el mes vale lo mismo tenga 28 o 31 días).
  const planSubtotal = priced.reduce(
    (s, t) =>
      s +
      therapyLineAmount({
        service: t.service as ServiceType,
        billing_mode: t.billing_mode,
        sessions_per_month: t.sessions_per_month || 0,
        unit_cost_usd: t.unit_cost_usd || 0,
      }),
    0,
  )

  const [periodMonth, setPeriodMonth] = useState<string>(defaultPeriodMonth())
  // Programa matutino: grupo + días del niño (solo si el niño está inscrito).
  const [morning, setMorning] = useState<MorningGroupSelection>({
    groupId: null,
    attendanceDays: [],
  })
  const [morningCandidates, setMorningCandidates] = useState<MorningCandidateOut[]>([])
  // Descuento del ciclo: default = mismo que el plan, editable.
  const [discountKind, setDiscountKind] = useState<DiscountKind>(
    plan.discount_kind ?? 'none',
  )
  const [discountValue, setDiscountValue] = useState<number>(
    Number(plan.discount_value ?? 0),
  )
  const [discountReason, setDiscountReason] = useState<string>(
    plan.discount_reason ?? '',
  )
  // El monto sugerido se recalcula del subtotal aplicando el descuento del ciclo.
  const computedTotal = applyDiscount(planSubtotal, {
    kind: discountKind,
    value: discountValue,
  })
  // Fecha límite de pago (periodo de gracia). Default: día 5 del mes del ciclo.
  const [graceDate, setGraceDate] = useState<string>(`${periodMonth}-05`)
  useEffect(() => {
    setGraceDate(`${periodMonth}-05`)
  }, [periodMonth])
  const [notes, setNotes] = useState('')
  // Desacople F1: true = flujo combinado (ciclo + factura); false = solo agenda.
  const [withInvoice, setWithInvoice] = useState(true)

  // Rollover del mes anterior.
  const [rollover, setRollover] = useState<RolloverPreview | null>(null)
  const [rolloverMode, setRolloverMode] = useState<'none' | 'accumulate' | 'discount'>('none')
  const rolloverSessionsMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const it of rollover?.items ?? []) map[it.service] = it.missed
    return map
  }, [rollover])

  const [dryRun, setDryRun] = useState<MonthlyCandidatesResult | null>(null)
  const [dryError, setDryError] = useState<string | null>(null)
  const [isLoadingDry, startLoadDry] = useTransition()

  /** Citas que se van a crear. Inicialmente = dryRun.candidates; el usuario
   *  puede arrastrarlas a otros días en la grilla. */
  const [editedCandidates, setEditedCandidates] = useState<MonthlyCandidateAppointment[]>([])
  const [hasEdits, setHasEdits] = useState(false)

  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [isConfirming, startConfirm] = useTransition()

  // Pool de citas que el patrón del plan puede generar este mes, por servicio
  // (= candidatas mostradas + las que sobraban por cuota). Ya excluye asuetos.
  // Es el tope para AUMENTAR citas de un servicio desde el stepper.
  const poolByService = useMemo(() => {
    const map: Record<string, MonthlyCandidateAppointment[]> = {}
    if (!dryRun) return map
    for (const c of [...dryRun.candidates, ...dryRun.skipped_overquota]) {
      if (!map[c.service]) map[c.service] = []
      map[c.service].push(c)
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    }
    return map
  }, [dryRun])

  // Conflictos del dry-run casados por firma (servicio+inicio) para pintarlos en
  // rojo en el calendario. `liveConflicts` recalcula en vivo: al mover/quitar una
  // cita su firma cambia y deja de contar como conflicto → así se puede confirmar
  // una vez resueltos, sin tener que ir a /agenda.
  const conflictSigs = useMemo(() => {
    const s = new Set<string>()
    for (const c of dryRun?.conflicts ?? []) s.add(candidateSignature(c.candidate))
    return s
  }, [dryRun])
  const conflictLabelBySig = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of dryRun?.conflicts ?? []) {
      m.set(
        candidateSignature(c.candidate),
        describeMonthlyConflict(c, childId, formatDateTime(c.conflict_starts_at)),
      )
    }
    return m
  }, [dryRun, childId])
  const liveConflicts = useMemo(
    () => editedCandidates.filter((c) => conflictSigs.has(candidateSignature(c))),
    [editedCandidates, conflictSigs],
  )

  const periodAlreadyUsed = existingPeriods.some((p) => p.startsWith(periodMonth))
  // Pausar a un niño SÍ cancela sus citas futuras (mig 0121), pero nada impide
  // generarle después un ciclo nuevo — que le vuelve a agendar el mes completo
  // y, con el cobro automático, se lo cobra.
  const childPaused = isChildPaused(childPhaseCode)

  // ¿Se está generando el ciclo del mes en curso, ya empezado? Solo ahí tiene
  // sentido recortar las fechas del patrón que ya pasaron.
  const monthInProgress = useMemo(() => {
    const now = new Date()
    const nowYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    return periodMonth === nowYm && now.getDate() > 1
  }, [periodMonth])
  const [skipPastDates, setSkipPastDates] = useState(true)

  // Cargar preview de rollover (mes anterior) al cambiar período.
  useEffect(() => {
    if (!periodMonth || periodAlreadyUsed) {
      setRollover(null)
      return
    }
    let cancel = false
    getCycleRolloverPreview(childId, periodMonth).then((res) => {
      if (cancel) return
      setRollover(res.ok ? res.preview : null)
    })
    return () => {
      cancel = true
    }
  }, [childId, periodMonth, periodAlreadyUsed])

  // Cargar dry-run automáticamente al cambiar período / modo rollover.
  useEffect(() => {
    if (!periodMonth || periodAlreadyUsed) {
      setDryRun(null)
      return
    }
    setDryError(null)
    const rolloverForCompute = rolloverMode === 'accumulate' ? rolloverSessionsMap : null
    startLoadDry(async () => {
      const res = await dryRunMonthlyGeneration(childId, periodMonth, rolloverForCompute)
      if (!res.ok) {
        setDryError(res.error)
        setDryRun(null)
        setEditedCandidates([])
        setHasEdits(false)
        return
      }
      setDryRun(res.result)
      // WYSIWYG: el calendario arranca con TODO el patrón del mes — las dentro de
      // cuota MÁS las que la cuota del plan dejaba fuera (skipped_overquota). Lo
      // que se ve = lo que se crea. La persona puede quitar las que no quiera con
      // − o ✕. Así no se "corta a media de mes" por una cuota más baja que el patrón.
      const fullPattern = [...res.result.candidates, ...res.result.skipped_overquota].sort(
        (a, b) => a.starts_at.localeCompare(b.starts_at),
      )
      // Generando un ciclo con el mes YA empezado: el patrón incluye fechas que
      // ya pasaron (el compute recorre el mes completo). Crearlas es basura en la
      // agenda, y dejarlas en el cobro deja el ciclo cobrando sesiones que nunca
      // se van a dar. Por defecto se recortan; la persona puede pedir el mes
      // completo si de verdad hay que registrar lo ya transcurrido.
      const nowMs = new Date().getTime()
      const pattern =
        monthInProgress && skipPastDates
          ? fullPattern.filter((c) => new Date(c.starts_at).getTime() >= nowMs)
          : fullPattern
      setEditedCandidates(pattern)
      setHasEdits(false)
      // Sincronizar las sesiones a COBRAR con las citas mostradas,
      // salvo en rollover acumulado (ese modo suma citas sin recobrar).
      if (rolloverMode === 'none') {
        const genCount: Record<string, number> = {}
        for (const c of pattern) {
          genCount[c.service] = (genCount[c.service] ?? 0) + 1
        }
        setPriced((prev) =>
          prev.map((row) =>
            (genCount[row.service] ?? 0) > 0
              ? { ...row, sessions_per_month: genCount[row.service] }
              : row,
          ),
        )
      }
    })
  }, [
    childId,
    periodMonth,
    periodAlreadyUsed,
    rolloverMode,
    rolloverSessionsMap,
    monthInProgress,
    skipPastDates,
  ])

  function handleMoveCandidate(idx: number, newStartsAt: string, newEndsAt: string) {
    setEditedCandidates((prev) =>
      prev.map((c, i) =>
        i === idx ? { ...c, starts_at: newStartsAt, ends_at: newEndsAt } : c,
      ),
    )
    setHasEdits(true)
  }

  // Editar la hora de una cita puntual de este mes (el patrón del plan queda
  // intacto; solo cambia este ciclo). Misma forma que mover de día.
  function handleRetimeCandidate(idx: number, newStartsAt: string, newEndsAt: string) {
    setEditedCandidates((prev) =>
      prev.map((c, i) =>
        i === idx ? { ...c, starts_at: newStartsAt, ends_at: newEndsAt } : c,
      ),
    )
    setHasEdits(true)
  }

  function handleDeleteCandidate(idx: number) {
    const svc = editedCandidates[idx]?.service
    setEditedCandidates((prev) => prev.filter((_, i) => i !== idx))
    setHasEdits(true)
    // Cobrar una sesión menos para ese servicio (mantener cobro = citas).
    if (svc) {
      setPriced((prev) => {
        const j = prev.findIndex((r) => r.service === svc)
        if (j === -1) return prev
        return prev.map((r, i) =>
          i === j ? { ...r, sessions_per_month: Math.max(0, r.sessions_per_month - 1) } : r,
        )
      })
    }
  }

  /**
   * Sube/baja en 1 las sesiones de una terapia, reflejándolo en el calendario:
   *  - Terapias con citas (pool > 0): agrega la próxima cita libre del patrón
   *    o quita la de fecha más tardía; el cobro queda = nº de citas.
   *  - Programas sin citas individuales (pool = 0): solo ajusta el cobro.
   */
  function stepSessions(idx: number, delta: 1 | -1) {
    const svc = priced[idx].service
    const pool = poolByService[svc] ?? []

    if (pool.length === 0) {
      // Solo cobro (ej. programa matutino mensual, sin citas en la grilla).
      setPriced((prev) =>
        prev.map((r, i) =>
          i === idx
            ? { ...r, sessions_per_month: Math.max(0, r.sessions_per_month + delta) }
            : r,
        ),
      )
      return
    }

    if (delta < 0) {
      // Quitar la cita de fecha más tardía de ese servicio.
      const mine = editedCandidates
        .map((c, i) => ({ c, i }))
        .filter((x) => x.c.service === svc)
        .sort((a, b) => a.c.starts_at.localeCompare(b.c.starts_at))
      if (mine.length === 0) return
      const removeI = mine[mine.length - 1].i
      const newCount = mine.length - 1
      setEditedCandidates((prev) => prev.filter((_, i) => i !== removeI))
      setPriced((prev) =>
        prev.map((r, i) => (i === idx ? { ...r, sessions_per_month: newCount } : r)),
      )
      setHasEdits(true)
    } else {
      // Agregar la próxima cita del patrón que no esté ya en el calendario.
      const used = new Set(
        editedCandidates.filter((c) => c.service === svc).map((c) => c.starts_at),
      )
      const next = pool.find((c) => !used.has(c.starts_at))
      if (!next) return // sin más slots del patrón este mes
      const newCount = used.size + 1
      setEditedCandidates((prev) =>
        [...prev, next].sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
      )
      setPriced((prev) =>
        prev.map((r, i) => (i === idx ? { ...r, sessions_per_month: newCount } : r)),
      )
      setHasEdits(true)
    }
  }

  function handleResetEdits() {
    if (!dryRun) return
    // Restaurar = TODO el patrón del mes (igual que al cargar la previsualización).
    const fullPattern = [...dryRun.candidates, ...dryRun.skipped_overquota].sort(
      (a, b) => a.starts_at.localeCompare(b.starts_at),
    )
    setEditedCandidates(fullPattern)
    setHasEdits(false)
  }

  function handleConfirm() {
    setConfirmError(null)
    if (periodAlreadyUsed) {
      setConfirmError('Ya existe un ciclo activo para este mes. Anulá el anterior primero.')
      return
    }
    if (!dryRun) {
      setConfirmError('Esperá la previsualización antes de confirmar.')
      return
    }
    if (enrolledProgram && !morning.groupId) {
      setConfirmError('Seleccioná el grupo del programa matutino.')
      return
    }
    startConfirm(async () => {
      // Desacople F1: "solo agenda" genera ciclo + citas sin factura (la
      // coordinadora agenda; recepción factura después desde el historial).
      const common = {
        childId,
        periodMonth,
        notes: notes.trim() || null,
        // WYSIWYG: se crean EXACTAMENTE las citas que muestra el calendario (todo el
        // patrón del mes, menos las que la persona haya quitado). Sin tope de cuota
        // oculto. Si no hay ninguna (ej. niño solo con programa matutino) va []
        // y el RPC no inserta citas por-sesión (las matutinas van por su propio flujo).
        appointmentsOverride: editedCandidates,
        discountKind,
        discountValue,
        discountReason: discountReason.trim() || null,
        // Precios finales por terapia — sobreescriben el snapshot del plan.
        pricedTherapies: priced,
        // Fecha límite de pago (gracia).
        dueDate: graceDate,
        // Rollover del mes anterior.
        rolloverMode,
        rolloverSessions: rolloverMode !== 'none' ? rolloverSessionsMap : null,
        rolloverDiscountUsd: rolloverMode === 'discount' ? (rollover?.totalDiscount ?? 0) : 0,
        // Programa matutino: grupo + días + citas previsualizadas/iteradas.
        // Pasar null (no []) cuando el array está vacío: null → servidor recomputa
        // del horario del grupo; [] vacío sería un override que no inserta nada.
        programGroupId: enrolledProgram ? morning.groupId : null,
        attendanceDays: enrolledProgram ? morning.attendanceDays : null,
        morningAppointments: enrolledProgram && morningCandidates.length > 0 ? morningCandidates : null,
      }
      const res = withInvoice
        ? await confirmMonthlyPaymentAndGenerate({ ...common, paymentAmountUsd: computedTotal })
        : await generateCycleAgenda(common)
      if (!res.ok) {
        setConfirmError(res.error)
        return
      }
      onCreated(res.cycle)
    })
  }

  const canConfirm =
    !!dryRun &&
    !periodAlreadyUsed &&
    !isConfirming

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-fm-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-2xl my-8 flex flex-col max-h-[calc(100vh-4rem)]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-fm-outline-variant/20">
          <h2 className="text-lg font-semibold text-fm-on-surface">
            Generar ciclo del mes
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full hover:bg-fm-surface-container text-fm-on-surface-variant"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Mes del ciclo (YYYY-MM)">
              <input
                type="month"
                value={periodMonth}
                onChange={(e) => setPeriodMonth(e.target.value)}
                className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
              />
              {periodAlreadyUsed && (
                <p className="mt-1 text-[11px] text-red-700">
                  Ya existe un ciclo activo para este mes.
                </p>
              )}
            </Field>
            <Field label="Fecha límite de pago (gracia)">
              <input
                type="date"
                value={graceDate}
                onChange={(e) => setGraceDate(e.target.value)}
                className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
              />
              <p className="mt-1 text-[11px] text-fm-on-surface-variant">
                Total del ciclo: <b>${computedTotal.toFixed(2)}</b>. Pasada esta fecha se
                cobra 5% de recargo por cada 5 días de atraso. El pago se registra
                después con &ldquo;Marcar pagado&rdquo;.
              </p>
            </Field>
          </div>

          {/* Programa matutino: selección de grupo + días + calendarización */}
          {enrolledProgram && (
            <MorningProgramCycleSection
              program={enrolledProgram}
              periodMonth={periodMonth}
              value={morning}
              onChange={setMorning}
              onCandidatesChange={setMorningCandidates}
            />
          )}

          {/* Precios por terapia — precargados del catálogo, editables */}
          <div className="rounded-lg border border-fm-outline-variant/20 overflow-hidden">
            <div className="px-3 py-2 bg-fm-surface-container-low/40 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-fm-on-surface-variant">
                Precios del mes (precargados del catálogo{enrolledProgram ? ' · BK' : ''})
              </span>
            </div>
            {priced.length === 0 ? (
              <p className="px-3 py-2 text-xs text-fm-on-surface-variant italic">
                El plan no tiene terapias activas.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase tracking-wide text-fm-on-surface-variant">
                  <tr className="border-t border-fm-outline-variant/15">
                    <th className="text-left px-3 py-1 font-semibold">Terapia</th>
                    <th className="text-right px-3 py-1 font-semibold">Ses/mes</th>
                    <th className="text-right px-3 py-1 font-semibold">Precio unit.</th>
                    <th className="text-right px-3 py-1 font-semibold">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {priced.map((t, idx) => (
                    <tr key={`${t.service}-${idx}`} className="border-t border-fm-outline-variant/10">
                      <td className="px-3 py-1.5">
                        {SERVICE_TYPE_LABELS[t.service as ServiceType] ?? t.service}
                        {t.billing_mode === 'monthly_flat' && (
                          <span
                            className="ml-1.5 inline-block text-[9px] px-1.5 py-0.5 rounded-full bg-fm-primary/10 text-fm-primary font-medium align-middle"
                            title={`Mensualidad fija${daysPerWeekLabel(t.days_per_week) ? ` — ${daysPerWeekLabel(t.days_per_week)}` : ''}: se cobra 1 × precio sin importar el número de citas del mes.`}
                          >
                            Mensualidad{t.days_per_week ? ` ${t.days_per_week}d` : ''}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        {(() => {
                          const poolLen = poolByService[t.service]?.length ?? 0
                          const calendarBacked = poolLen > 0
                          const atMax = calendarBacked && t.sessions_per_month >= poolLen
                          return (
                            <div className="flex flex-col items-end gap-0.5">
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => stepSessions(idx, -1)}
                                  disabled={t.sessions_per_month <= 0}
                                  className="h-6 w-6 rounded-md border border-fm-outline-variant/30 bg-white text-fm-on-surface leading-none disabled:opacity-40 hover:bg-fm-surface-container"
                                  aria-label="Quitar una sesión"
                                >
                                  −
                                </button>
                                <span className="w-7 text-center tabular-nums font-medium">
                                  {t.sessions_per_month}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => stepSessions(idx, 1)}
                                  disabled={atMax}
                                  title={atMax ? 'No hay más citas en el patrón este mes' : undefined}
                                  className="h-6 w-6 rounded-md border border-fm-outline-variant/30 bg-white text-fm-on-surface leading-none disabled:opacity-40 hover:bg-fm-surface-container"
                                  aria-label="Agregar una sesión"
                                >
                                  +
                                </button>
                              </div>
                              {atMax && (
                                <span className="text-[9px] text-fm-on-surface-variant">
                                  máx {poolLen} (patrón)
                                </span>
                              )}
                            </div>
                          )
                        })()}
                      </td>
                      <td className="text-right px-3 py-1.5">
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={t.unit_cost_usd}
                          onChange={(e) => patchPrice(idx, Number(e.target.value))}
                          className="w-20 rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1 text-sm tabular-nums text-right"
                        />
                      </td>
                      <td className="text-right px-3 py-1.5 tabular-nums font-medium">
                        ${therapyLineAmount({
                          service: t.service as ServiceType,
                          billing_mode: t.billing_mode,
                          sessions_per_month: t.sessions_per_month,
                          unit_cost_usd: t.unit_cost_usd,
                        }).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {priced.length > 0 && (
              <p className="px-3 py-2 text-[11px] text-fm-on-surface-variant border-t border-fm-outline-variant/10">
                Usá <b>− / +</b> para ajustar las sesiones del mes: agrega o quita
                citas en el calendario de abajo y se cobra en consecuencia. Útil si
                el niño no asistirá a todas (asuetos, ausencias avisadas). También
                podés quitar una cita puntual con la ✕ en el calendario.
                {priced.some((t) => t.billing_mode === 'monthly_flat') && (
                  <>
                    {' '}Las filas con <b>Mensualidad</b> se cobran a precio fijo
                    (1 × mensualidad): quitar o agregar citas no cambia el monto.
                  </>
                )}
              </p>
            )}
          </div>

          {/* Rollover del mes anterior */}
          {rollover && rollover.items.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-2">
              <p className="text-xs font-semibold text-amber-900">
                Arrastre del mes anterior — {rollover.items.reduce((s, i) => s + i.missed, 0)}{' '}
                sesión(es) no dada(s) ni repuesta(s)
              </p>
              <ul className="text-[11px] text-amber-900 space-y-0.5">
                {rollover.items.map((it) => (
                  <li key={it.service}>
                    • {SERVICE_TYPE_LABELS[it.service as ServiceType] ?? it.service}:{' '}
                    <b>{it.missed}</b> sesión(es)
                    {it.unitPrice > 0 && ` · ($${(it.missed * it.unitPrice).toFixed(2)})`}
                  </li>
                ))}
              </ul>
              <div className="flex flex-col gap-1 text-xs text-amber-900">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="rollover"
                    checked={rolloverMode === 'none'}
                    onChange={() => setRolloverMode('none')}
                  />
                  No aplicar
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="rollover"
                    checked={rolloverMode === 'accumulate'}
                    onChange={() => setRolloverMode('accumulate')}
                  />
                  Acumular sesiones (generar citas extra este mes, sin recobrar)
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="rollover"
                    checked={rolloverMode === 'discount'}
                    onChange={() => setRolloverMode('discount')}
                  />
                  Descontar ${rollover.totalDiscount.toFixed(2)} de la factura
                </label>
              </div>
              {rolloverMode === 'accumulate' && (
                <p className="text-[11px] text-amber-700 italic">
                  Se intentarán generar las sesiones extra donde el horario tenga
                  espacio (sube la cuota del mes). Revisá la previsualización abajo.
                </p>
              )}
            </div>
          )}

          <DiscountFields
            subtotal={planSubtotal}
            kind={discountKind}
            value={discountValue}
            reason={discountReason}
            onChangeKind={(k) => setDiscountKind(k)}
            onChangeValue={(v) => setDiscountValue(v)}
            onChangeReason={setDiscountReason}
            disabled={isConfirming}
          />

          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wide text-fm-on-surface-variant mb-1">
              Notas
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
            />
          </div>

          {/* Preview */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-fm-on-surface">
                Previsualización del mes
              </h3>
              {isLoadingDry && (
                <span className="text-xs text-fm-on-surface-variant">Calculando…</span>
              )}
            </div>

            {dryError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {dryError}
              </div>
            )}

            {dryRun && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                  <Stat
                    label="A generar"
                    value={editedCandidates.length}
                    tone="ok"
                  />
                  <Stat
                    label="Conflictos"
                    value={liveConflicts.length}
                    tone={liveConflicts.length > 0 ? 'error' : 'ok'}
                  />
                  <Stat
                    label="Saltadas (asueto)"
                    value={dryRun.summary.skipped_holiday_count}
                    tone="info"
                  />
                  <Stat
                    label="Quitadas"
                    value={Math.max(
                      0,
                      dryRun.candidates.length +
                        dryRun.skipped_overquota.length -
                        editedCandidates.length,
                    )}
                    tone="info"
                  />
                </div>

                {liveConflicts.length > 0 && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
                    <p className="font-semibold">
                      {liveConflicts.length} cita(s) con conflicto de horario — en rojo en el calendario.
                    </p>
                    <p className="mt-0.5">
                      Pasá el mouse por encima de una celda roja para ver el detalle. Se pueden
                      generar igual — revisalas cuando puedas, o movelas/quitalas ahora si preferís
                      resolverlas antes.
                    </p>
                  </div>
                )}

                {childPaused && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
                    <p className="font-semibold">Este niño/a está en pausa temporal.</p>
                    <p className="mt-0.5">
                      Generar el ciclo le agenda el mes completo <b>y se lo cobra</b>. Si la pausa
                      sigue, no generés el ciclo; si ya se reincorporó, primero sacalo de la pausa
                      en el pipeline de fases.
                    </p>
                  </div>
                )}

                {monthInProgress && (
                  <div className="rounded-lg border border-fm-outline-variant/20 bg-fm-surface-container-low/40 p-2.5 space-y-1.5">
                    <p className="text-[11px] font-semibold text-fm-on-surface">
                      El mes ya empezó — ¿desde cuándo agendar?
                    </p>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="radio"
                        className="mt-0.5"
                        checked={skipPastDates}
                        onChange={() => setSkipPastDates(true)}
                      />
                      <span className="text-[11px] text-fm-on-surface">
                        Solo de hoy en adelante
                        <span className="block text-fm-on-surface-variant">
                          No agenda ni cobra los días del mes que ya pasaron.
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="radio"
                        className="mt-0.5"
                        checked={!skipPastDates}
                        onChange={() => setSkipPastDates(false)}
                      />
                      <span className="text-[11px] text-fm-on-surface">
                        Mes completo
                        <span className="block text-fm-on-surface-variant">
                          Incluye los días ya transcurridos: úsalo solo si esas sesiones se
                          dieron y hay que cobrarlas.
                        </span>
                      </span>
                    </label>
                  </div>
                )}

                {(editedCandidates.length > 0 || hasEdits) && (
                  <div className="rounded-lg border border-fm-outline-variant/20 p-3 bg-fm-surface-container-low/30">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-fm-on-surface">
                        Calendario de las {editedCandidates.length} citas a crear
                      </p>
                      {hasEdits && (
                        <button
                          type="button"
                          onClick={handleResetEdits}
                          className="text-[11px] text-fm-primary hover:underline"
                        >
                          Restaurar a defaults
                        </button>
                      )}
                    </div>
                    <DraggableCycleCalendar
                      periodMonth={`${periodMonth}-01`}
                      candidates={editedCandidates}
                      onMove={handleMoveCandidate}
                      onRetime={handleRetimeCandidate}
                      onDelete={handleDeleteCandidate}
                      conflictSigs={conflictSigs}
                      conflictLabelBySig={conflictLabelBySig}
                    />
                    {hasEdits && (
                      <p className="mt-2 text-[11px] text-amber-700">
                        Tenés cambios. Al confirmar se crearán las citas en
                        las fechas que marcaste, no las del patrón original.
                      </p>
                    )}
                  </div>
                )}

                {dryRun.skipped_holidays.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-fm-on-surface-variant hover:underline">
                      Ver {dryRun.skipped_holidays.length} fecha(s) saltada(s) por asueto
                    </summary>
                    <ul className="mt-1 ml-4 space-y-0.5">
                      {dryRun.skipped_holidays.map((c, i) => (
                        <li key={i} className="text-fm-on-surface-variant">
                          • {formatDateTime(c.starts_at)} —{' '}
                          {SERVICE_TYPE_LABELS[c.service as ServiceType] ?? c.service}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {/* La cuota del plan ya no recorta la agenda: el calendario arriba
                    muestra TODO el patrón del mes y esas son las citas que se crean.
                    Para dar menos, quitalas con − o ✕. */}
              </div>
            )}
          </section>

          {confirmError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {confirmError}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-fm-outline-variant/20 bg-fm-surface flex-wrap">
          {/* Desacople F1: la coordinadora puede generar SOLO la agenda; recepción
              factura después con "Generar factura" en el historial de ciclos. */}
          <label className="mr-auto inline-flex items-center gap-2 text-xs text-fm-on-surface-variant cursor-pointer select-none">
            <input
              type="checkbox"
              checked={withInvoice}
              onChange={(e) => setWithInvoice(e.target.checked)}
              disabled={isConfirming}
              className="h-4 w-4 rounded border-fm-outline-variant text-fm-primary focus:ring-fm-primary"
            />
            Generar también la factura
          </label>
          <button
            type="button"
            onClick={onClose}
            disabled={isConfirming}
            className="px-4 py-2 text-sm rounded-lg text-fm-on-surface hover:bg-fm-surface-container"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="px-4 py-2 text-sm rounded-lg bg-fm-primary text-white font-medium hover:opacity-90 disabled:opacity-60"
          >
            {isConfirming ? 'Generando…' : withInvoice ? 'Generar ciclo' : 'Generar solo agenda'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-medium uppercase tracking-wide text-fm-on-surface-variant mb-1">
        {label}
      </label>
      {children}
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'ok' | 'error' | 'info'
}) {
  const colors =
    tone === 'error'
      ? 'bg-red-100 text-red-700 border-red-200'
      : tone === 'ok'
        ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
        : 'bg-zinc-100 text-zinc-700 border-zinc-200'
  return (
    <div className={`rounded-lg border px-3 py-2 ${colors}`}>
      <div className="text-xl font-bold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  )
}


