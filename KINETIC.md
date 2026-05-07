# Kinetic — Adaptación del CRM

> **Este worktree contiene la adaptación de FM CRM a Kinetic Center (Beginnings, S.A. de C.V.).**
> Plan completo en `~/.claude/plans/kinetic-es-un-cenor-enchanted-lark.md` (v0.7).

## Estrategia técnica

- **Mismo código base que FM CRM**, branding y dominio adaptados a Kinetic.
- **Tokens CSS `--fm-*` se mantienen por compatibilidad** (cambian solo los valores). Renombrar a `--kinetic-*` tocaría cientos de archivos sin beneficio funcional.
- **Migraciones FM (`supabase/migrations/`) están congeladas** como referencia. Las migraciones de Kinetic viven en `supabase/migrations-kinetic/` y arrancan desde `0001`.
- **Proyecto Supabase y Vercel separados de FM** — pendiente de crear por el cliente.
- **Reportes PDF (`TimesheetPdfReport`, `ClientCycleReport`) NO se rebrandean** — Kinetic tendrá plantillas nuevas redactadas desde cero en Fase 3 y Fase 6 (ver plan).

## Datos institucionales (Kinetic)

| Campo | Valor |
|---|---|
| Razón social | **Beginnings, S.A. de C.V.** |
| Nombre comercial | Kinetic |
| Nombre completo | Kinetic — Centro de Estimulación y Desarrollo Intelectual |
| Tagline | "muévete y aprende" |
| Dirección | Colonia La Sultana, Calle Las Rosas #36 C, Antiguo Cuscatlán, La Libertad, El Salvador |
| Teléfonos | 2243-9648 / 2243-7487 / 2243-7488 |
| WhatsApp | 7743-8666 |
| Email mercadeo | mercadeo@kinetic.center |
| Email admin | asistenteadministrativo@kinetic.center |
| Web | www.kinetic.center |
| Banco | BAC (Banco de América Central) |
| Cuenta bancaria | **201028016** |
| NIT | **PENDIENTE** |
| NRC | **PENDIENTE** |

## Profesionales identificados (seed inicial)

| Profesional | Profesión | Junta |
|---|---|---|
| Licda. Josselin Castro | Directora General | (pendiente) |
| Licda. Tania Abigail Meléndez Mejía | Psicóloga | JVPP 12141 |
| Licda. Estefany Judith Cruz Vásquez | Psicóloga | JVPP 11102 |
| Licda. Diana Patricia Mancía Ayala | Psicóloga | JVPP 10989 |
| Licda. Jenny Elizabeth Palacios Portillo | Fisioterapeuta y T. Ocupacional | JVPM 907 |

Nota: **JVPP** (Psicología) y **JVPM** (Médica) son juntas distintas.

## Pruebas estandarizadas conocidas

| Código | Nombre completo | Sistema |
|---|---|---|
| WISC_V | Wechsler Intelligence Scale for Children, 5ª ed. | Puntuación compuesta |
| CARAS | Test de Caras (atención y control de impulsividad) | Eneatipos + percentiles |
| E_TDAH | Escala TDAH basada en DSM-5 | Percentiles familia/escuela |
| SENA | Sistema de Evaluación de Niños y Adolescentes | T-scores familia/escuela/autoinforme |
| ESPQ | Cuestionario de Personalidad para Niños | 13 dim. primer orden + 3 segundo orden, decatipos |
| RAVEN | Raven escala coloreada | Subtest A/ab/B + percentil + rango |

## Placeholders activos en este MVP

Estos valores se usan hasta confirmar con cliente. Editar por UI admin o migración posterior:

- **Color primario:** `#1FA4DA` (azul dominante del logo Kinetic)
- **Color acento secundario:** `#F7B945` (amarillo del logo)
- **Color destructivo:** `#E5316E` (rosa/magenta del logo)
- **Logo:** `app_settings.agency_logo_url = NULL` → fallback a `/icons/icon-192.png`. Admin sube logo real cuando esté el SVG.
- **NIT/NRC:** strings vacíos en `company_settings`. Editar por `/facturacion/settings`.
- **Tipos de terapia y precios:** catálogo `service_packages` arranca vacío. Admin agrega por UI.

## Cambios aplicados (Fase 0)

- [x] `KINETIC.md` (este archivo)
- [ ] `src/app/layout.tsx` — título, apple title, themeColor
- [ ] `src/app/globals.css` — paleta Kinetic (tokens `--fm-*` mantenidos)
- [ ] `src/lib/n1co/payment-links.ts` — strings "FM Communications" → "Kinetic"
- [ ] `src/lib/n1co/payment-link.ts` — strings + URL fallback
- [ ] `src/lib/n1co/plans-sync.ts` — descripción de plan
- [x] `supabase/migrations-kinetic/0002_to_0079_merged.sql` — merge de las 78 migraciones FM 0002→0079 en un solo SQL para pegar de una vez en Supabase
- [x] `supabase/migrations-kinetic/0080_kinetic_init.sql` — `company_settings` re-seed + `professional_signatures` con 5 profesionales reales + `test_catalog` con 6 pruebas

## Próximos pasos (NO ejecutados aún)

- Fase 1 — Núcleo familiar/clínico (~2 semanas)
- Fase 2 — Agenda + Google Meet (~1.5–2 semanas)
- Fase 3 — Sesiones, reportería, agenda digital (~3 semanas)
- Fase 4 — Reposiciones + cuarentenas + recargos (~1.5 semanas)
- Fase 5 — Programas matutinos + cuadernillo + indicadores (~2–2.5 semanas)
- Fase 6 — Evaluaciones + plan tratamiento (~2.5 semanas)
- Fase 7 — Pagos + matrícula + Ficha de Acuerdo (~2 semanas)
- Fase 8 — Contabilidad básica (~1 semana)
- Fase 9 — Pipeline paciente + dashboards (~1 semana)
- Fase 10 — QA + capacitación + go-live (~1 semana)

**Total estimado:** 15.5–17.5 semanas con 1 dev full-time.
