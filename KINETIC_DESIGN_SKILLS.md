# Kinetic — Design Skills

> Índice de skills de diseño UX/UI instaladas para uso activo en este proyecto.
> Todas las paths absolutas asumen `~/.claude/skills/`.

## Stack instalado

| # | Nombre | Origen | Path SKILL.md | Activación recomendada |
|---|---|---|---|---|
| 1 | **emil-design-eng** | [emilkowalski/skill](https://github.com/emilkowalski/skill) | `~/.claude/skills/emilkowalski-skill/skills/emil-design-eng/SKILL.md` | Filosofía/principios UI cuando se discute craft o se hace polish |
| 2 | **impeccable** | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | `~/.claude/skills/impeccable/.claude/skills/impeccable/SKILL.md` | Workflow de diseño completo con commands (craft/shape/audit). **Requiere `PRODUCT.md` y `DESIGN.md` en root** ✅ ya creados |
| 3 | **taste-skill** (12 sub-skills) | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) | `~/.claude/skills/taste-skill/skills/<subname>/SKILL.md` | Anti-slop rules + variants estilísticos |
| 4 | **Playwright** | [microsoft/playwright](https://github.com/microsoft/playwright) | `node_modules` (proyecto) | Verificación visual programática + tests E2E |

## Cómo invocarlos

### 1. emil-design-eng — filosofía de craft

```
Read ~/.claude/skills/emilkowalski-skill/skills/emil-design-eng/SKILL.md
```

**Cuándo:** antes de hacer cualquier polish, micro-interacción o decisión de animación. Establece el "north star" cualitativo.

**Caso típico Kinetic:** "vamos a pulir la transición del modal de crear niño" → leo el skill, aplico principios.

### 2. impeccable — design system framework

```
Read ~/.claude/skills/impeccable/.claude/skills/impeccable/SKILL.md
```

**Cuándo:** trabajos de diseño estructurados (rediseñar una vista completa, auditar un módulo, mejorar consistencia).

**Comandos disponibles** (mencionar en chat):
- `/impeccable shape` — define el brief de diseño antes de ejecutar
- `/impeccable craft <target>` — implementa con el brief confirmado
- `/impeccable audit <path>` — audita una pantalla existente
- `/impeccable polish` — pasa de "funcional" a "pulido"
- `/impeccable bolder` / `/impeccable quieter` / `/impeccable colorize` / `/impeccable animate` — modificadores estilísticos
- `/impeccable adapt` — adapta a otro device/contexto
- `/impeccable distill` — simplifica / quita ruido
- `/impeccable harden` — agrega edge cases (loading, empty, error)
- `/impeccable layout` / `/impeccable typeset` — refactor estructural
- `/impeccable live` — iteración en vivo en browser

**Pre-requisito ya cumplido:**
- `PRODUCT.md` ✅ — usuarios, brand, tono, anti-references
- `DESIGN.md` ✅ — paleta, tipografía, componentes patrón, anti-patterns

### 3. taste-skill — sub-skills por estilo

Lista de 12 sub-skills disponibles en `~/.claude/skills/taste-skill/skills/`:

| Sub-skill | Para qué |
|---|---|
| `taste-skill/SKILL.md` | **Reglas base anti-slop** (DESIGN_VARIANCE, MOTION_INTENSITY, VISUAL_DENSITY) |
| `brandkit/SKILL.md` | Generar identidad visual coherente |
| `brutalist-skill/SKILL.md` | Variant brutalist |
| `minimalist-skill/SKILL.md` | Variant minimalista (👈 alineado con Kinetic) |
| `soft-skill/SKILL.md` | Variant soft / friendly (👈 alineado con Kinetic) |
| `redesign-skill/SKILL.md` | Workflow de rediseño |
| `image-to-code-skill/SKILL.md` | Recrear UI desde screenshot |
| `imagegen-frontend-web/SKILL.md` | Generar mocks visuales web |
| `imagegen-frontend-mobile/SKILL.md` | Generar mocks móvil (👈 útil para portal padres) |
| `gpt-tasteskill/SKILL.md` | Variant para GPT |
| `output-skill/SKILL.md` | Formato de output |
| `stitch-skill/SKILL.md` | Composición de pantallas |

**Default para Kinetic:** combinar `taste-skill` (reglas base) + `soft-skill` (warmth para padres) + `minimalist-skill` (claridad clínica).

### 4. Playwright — verificación visual y tests

**Comandos disponibles:**

```bash
# Smoke test (sin auth)
npx playwright test smoke

# Modo interactivo con UI
npx playwright test --ui

# Ver browser
npx playwright test --headed

# Solo móvil
npx playwright test --project=chromium-mobile

# Ver report HTML después de fallo
npx playwright show-report
```

**Tests viven en:** `tests/e2e/`

**Smoke test inicial:** `tests/e2e/smoke.spec.ts` — verifica branding Kinetic en /login + redirección de rutas protegidas + color primario del CTA.

**Casos de uso típicos:**
- Antes de cerrar una fase: correr suite E2E para confirmar regresiones cero
- Después de un rediseño: regenerar screenshots baseline
- Para audits visuales: tomar screenshots de cada pantalla en light + dark + mobile

## Workflow recomendado para próximas mejoras UX/UI

1. **Antes de tocar código:** leer `emil-design-eng` + `taste-skill` para activar mindset
2. **Para nueva pantalla:** invocar `/impeccable shape` → confirmar brief → `/impeccable craft`
3. **Para mejorar pantalla existente:** `/impeccable audit <path>` → `/impeccable polish` o `/impeccable distill`
4. **Para edge cases:** `/impeccable harden` (loading, empty, error states)
5. **Después de cambios visuales:** `npx playwright test` para confirmar no-regresión

## Notas sobre Impeccable

El skill tiene scripts en `~/.claude/skills/impeccable/.claude/skills/impeccable/scripts/` (load-context.mjs, shape.mjs, craft.mjs, etc.) — son la implementación interna. No requieren ejecución manual; el skill los invoca cuando lo activas.

El loader busca `PRODUCT.md` / `DESIGN.md` en este orden:
1. Project root (✅ ahí están los nuestros)
2. `.agents/context/`
3. `docs/`
4. `IMPECCABLE_CONTEXT_DIR` env var override

## Referencias

- Plan principal del proyecto: `~/.claude/plans/kinetic-es-un-cenor-enchanted-lark.md`
- Doc de adaptación técnica: `KINETIC.md` (root)
- Migraciones SQL: `supabase/migrations-kinetic/`
