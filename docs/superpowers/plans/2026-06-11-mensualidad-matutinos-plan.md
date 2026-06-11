# Plan de implementación — Mensualidad programas matutinos

Spec: `docs/superpowers/specs/2026-06-11-mensualidad-programas-matutinos-design.md`

**Ajuste vs spec (mejora):** los servicios matutinos (`blue_kids`, `learning_kids`,
`aula_educativa`) son `monthly_flat` **implícitamente** cuando la entrada no trae
`billing_mode`. Así los planes existentes de niños matutinos quedan corregidos sin
re-guardar cada plan (que es exactamente lo que pidió el usuario). Una entrada
puede forzar `billing_mode: 'per_session'` explícito si hiciera falta.

## Pasos

1. **Dominio puro** — `src/lib/domain/billing/monthly-flat.ts` + test:
   `MORNING_PROGRAM_SERVICES`, `isMonthlyFlatEntry(entry)`, `therapyLineAmount(entry)`.
2. **Tipos** — `TreatmentPlanTherapyEntry` += `billing_mode?`, `days_per_week?`.
3. **Action plan** — `validateTherapies` acepta los campos nuevos;
   `recalcSubtotal` usa `therapyLineAmount`; fix bug: `validateSchedule`
   preservar `frequency` (hoy se pierde al guardar).
4. **Migración 0147** — redefine (misma firma, sin DROP):
   - `compute_monthly_appointment_candidates`: sin cuota para flat.
   - `confirm_monthly_payment_and_generate`: línea qty 1 × precio para flat.
   - `mark_appointment_absence`: auto-waive si el servicio es flat en el plan activo.
   - Actualizar `verify_pending_migrations.sql`.
5. **monthly-cycles.ts** — rollover preview excluye flat; patch post-RPC
   (expected total) flat-aware; `pricedTherapies` lleva `billing_mode`.
6. **kinetic-invoices.ts** — `buildCycleLineItems` flat → 1 × mensualidad,
   descripción "Mensualidad X — N días a la semana".
7. **TreatmentPlanEditor** — selector de variante (días/semana del catálogo) en
   vez de ses/mes para servicios matutinos; warning variante vs días marcados;
   prop `serviceCatalog` (threading: page → TreatmentPlanSection → editor).
8. **TreatmentPlanSection (read-only)** — mostrar "Mensualidad · N días/sem".
9. **NewMonthlyCycleModal** — filas flat: sin stepper, subtotal = mensualidad,
   precio precargado de la variante exacta; sync/delete no tocan el cobro flat.
10. **Verificación** — vitest + lint + build. Commit a master.
