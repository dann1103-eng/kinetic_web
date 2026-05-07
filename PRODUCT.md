# PRODUCT.md — Kinetic CRM

> Loaded by `~/.claude/skills/impeccable` para gates de contexto antes de cualquier trabajo de diseño UI/UX.

## Quiénes son los usuarios

**Kinetic Center** (razón social *Beginnings, S.A. de C.V.*) es un centro de atención integral para niños neurodivergentes en El Salvador (autismo, TDAH, altas capacidades, dificultades de aprendizaje, trastornos del neurodesarrollo).

El CRM lo usan **9 perfiles distintos** con necesidades muy diferentes:

| Perfil | Cómo usa el CRM | Densidad de UI esperada |
|---|---|---|
| **Directora General** (Josselin Castro) | Aprueba reportes uno por uno, ve dashboards clínicos, gestiona casos críticos | Media-alta — necesita ver muchos casos sin abrir cada uno |
| **Coordinadora de familias** | Captación + intake (fases 1-3 del pipeline). Recibe llamadas, agenda entrevistas | Media — flujos secuenciales, sin distracciones |
| **Coordinadora de terapias** | Calendario + reposiciones + cambios de horario | Alta — calendario denso |
| **Terapista** (psicóloga, fisio, etc.) | Su agenda del día, llenar reportes post-terapia, "agenda digital" con padre | Baja-media — foco en tareas individuales |
| **Maestra (programas matutinos)** | Asistencia diaria, cuadernillo del día | Baja — interacción rápida móvil |
| **Recepción** | Cobros pendientes, agenda de entradas | Media — vista operativa |
| **Contable** | Facturación, pagos, dashboard contable | Alta — datos densos |
| **Admin** | Todo (configuración, usuarios, etc.) | Variable |
| **Padres (portal)** | Ver agenda, leer reportes, cuadernillo, pagar facturas | Baja — UX consumer-grade, móvil-first |

## Brand

- **Nombre comercial:** Kinetic
- **Razón social:** Beginnings, S.A. de C.V.
- **Tagline:** *muévete y aprende*
- **Naming oficial del centro:** "Kinetic — Centro de Estimulación y Desarrollo Intelectual"

## Tono de comunicación

- **Cálido pero profesional.** Los padres vienen estresados y los niños son neurodivergentes. Lenguaje claro sin jerga médica innecesaria.
- **Esperanzador.** Estamos en el lado del progreso del niño. Evitar lenguaje clínico frío.
- **Respetuoso de la neurodiversidad.** Hablar de "niños neurodivergentes", no "niños con problemas". Diagnósticos son para context, no etiquetas.
- **Spanish formal latinoamericano (El Salvador).** Usted en lugar de tú con padres.

## Anti-references (lo que NO somos)

- **No somos un EHR clínico hospitalario.** Nada de UIs estilo Cerner/Epic — eso intimida a las terapistas.
- **No somos una app de mindfulness lifestyle.** Nada de gradientes púrpura saturados ni mocks "Calm-style".
- **No somos un dashboard de SaaS B2B genérico.** Nada de UIs que parezcan Linear/Notion clones.
- **No somos un school portal escolar.** Aunque trabajamos con colegios, NO somos un sistema escolar genérico.

## Referencias positivas

- **Patient-facing healthcare UX moderna:** Maven Clinic, Hello Heart, Lyra Health (calidez + claridad clínica)
- **Centros pediátricos premium:** páginas de Stanford Children's Health o Boston Children's
- **Apps con tono cálido pero competente:** Notion para docs, Linear para densidad de info

## Principios estratégicos

1. **Cero ambigüedad en información clínica.** Tipo de sangre, alergias, contacto de emergencia siempre visibles en el perfil del niño. Si falta dato crítico, mostrarlo en rojo.
2. **El padre nunca pierde tiempo buscando.** Portal del padre debe responder 3 preguntas en <2 clics: ¿cuándo es la próxima cita? ¿hay reportes nuevos? ¿debo algo?
3. **La directora aprueba en lote.** UI de aprobación de reportes debe permitir ver/aprobar/rechazar varios sin navegación pesada.
4. **Las terapistas trabajan en tablet.** Modulo de "iniciar/finalizar terapia" debe funcionar perfecto en touch.
5. **El staff escribe muchos reportes.** Editores de informes deben ser cómodos para texto largo (autosave, plantillas, sin modales claustrofóbicos).

## Fases del producto

Plan v0.7 completo en `~/.claude/plans/kinetic-es-un-cenor-enchanted-lark.md`.

Estado actual: **Fase 0 + Fase 1 entregadas.** Próximas: agenda + Google Meet (2), reportería con aprobación (3), reposiciones + cuarentenas (4), programas matutinos (5), evaluaciones (6), pagos + Ficha de Acuerdo (7), contabilidad (8).
