# DESIGN.md — Kinetic CRM

> Loaded by `~/.claude/skills/impeccable` para gates de diseño.

## Identidad visual

### Logo
- Wordmark "kinetic" en azul (#1FA4DA) con personajes infantiles multicolor a la izquierda
- Tagline: "muévete y aprende" en gris debajo
- Disponible en PNG (vectorial pendiente de cliente)
- Hay versiones light/dark del wordmark

### Paleta primaria

Definida en `src/app/globals.css` con prefijo legacy `--fm-*` (no renombrar para evitar tocar 300+ archivos):

| Token | Valor light | Valor dark | Uso |
|---|---|---|---|
| `--fm-primary` | `#1FA4DA` (azul) | `#87daff` | CTAs, headers, links, focus rings |
| `--fm-primary-container` | `#b9eaff` | `#00536f` | Backgrounds suaves de elementos primarios |
| `--fm-secondary` | `#F7B945` (amarillo) | `#ffd58f` | Acentos, badges, programa matutino |
| `--fm-tertiary` | `#7CC74F` (verde) | `#b6e094` | Estados positivos (Activo, Completado) |
| `--fm-error` | `#E5316E` (rosa/magenta) | `#ff7aa6` | Destructivos, alergias críticas, mora |
| `--fm-surface-*` | escala neutral fría | escala neutral fría | Backgrounds, cards |
| `--fm-on-*` | contrastes WCAG AA | contrastes WCAG AA | Texto sobre cada color |

**Anti-pattern:** No usar más de 1 color primario por pantalla. El amarillo y verde son acentos limitados.

### Tipografía

- **Sans única:** Manrope (cargada via next/font/google con weights 200-800)
- Display/headings: weight 700-800
- Body: weight 400-500
- UI labels: weight 500-600 + tracking-wide en uppercase para legends
- **No mezclar fuentes.** Si se necesita mono (códigos de niño, números técnicos), usar `font-mono` de Tailwind sobre el stack default del sistema.

### Iconografía

- **Material Symbols Outlined** (cargado via `<link>` en layout.tsx)
- Uso: `<span className="material-symbols-outlined">icon_name</span>`
- Tamaños estándar: text-base (default), text-lg (énfasis), text-2xl (hero)
- **No** usar emojis en UI seria (queda OK en cuadernillo de niños)

### Espaciado y radios

- Radio base: `--radius: 0.75rem` → derivados sm/md/lg/xl/2xl/3xl
- Cards: `rounded-2xl`
- Buttons: `rounded-xl`
- Pills/badges: `rounded-full`
- Modales: `rounded-2xl` con border `border-fm-outline-variant/30`

### Componentes patrón

- **Cards de información:** fondo `bg-fm-surface-container-lowest`, border `border-fm-outline-variant/20`, padding `p-4` o `p-6`, header con label uppercase tracking-wide en `text-xs text-fm-on-surface-variant`
- **Tablas:** thead con `text-xs font-semibold text-fm-outline uppercase`, body rows con `border-b border-fm-outline-variant/5 hover:bg-fm-surface-container-low`
- **Status badges:** `text-xs px-2 py-0.5 rounded-full` con paleta `*/15` para fondo y color sólido para texto (ej. `bg-fm-tertiary/15 text-fm-tertiary`)
- **Modals:** overlay `bg-black/40`, contenido max-w-2xl con header sticky y footer sticky
- **Avatars:** gradient lineal 135° usando dos tonos de la paleta (ver `FamiliesTable.tsx`)

### Estados clínicos / información sensible

- **Alergias / contacto emergencia faltante:** texto `text-fm-error` o background `bg-fm-error/10`
- **Diagnóstico editorial:** italic `text-fm-primary` (es info importante pero no de emergencia)
- **Estados de tratamiento:** badges con colores semánticos (active=verde, paused=gris, etc.)

## Convenciones de UX

### Autosave y feedback
- Forms críticos (reportes de avance, planes de tratamiento) deben tener autosave o "guardando..." claro.
- Toasts para confirmaciones rápidas (no modales).
- Errores inline al lado del campo, no al final del form.

### Navegación
- Sidebar fijo izquierdo con badges para items con notificaciones (Renovaciones, Inbox)
- TopNav con `title` + opcional `backHref` para navegación atrás
- Breadcrumbs solo donde la jerarquía es profunda (>2 niveles)

### Densidad
- **Internal staff (admin/directora/coordinadoras):** density media-alta — pueden ver muchas cosas a la vez
- **Terapistas / maestras:** density baja — foco en una tarea
- **Portal padres:** density baja — UX consumer, móvil-first, hover-free

### Dark mode
- Soportado via `next-themes` + clase `dark` en `<html>`
- Todos los tokens `--fm-*` tienen versión dark en `globals.css`
- Probar siempre en light Y dark

## Anti-patterns explícitos

1. ❌ No usar gradientes púrpura/violeta saturados (look "AI slop" de 2024)
2. ❌ No usar Inter como display (queda genérico)
3. ❌ No usar `h-screen` para hero — usar `min-h-[100dvh]` (regla de taste-skill)
4. ❌ No centrar layouts cuando hay layouts asimétricos válidos
5. ❌ No abusar de cards (cuando elevation no comunica nada, usar dividers)
6. ❌ No usar emojis en UI clínica/seria (sí en módulos infantiles si aplica)
7. ❌ No animar todo. Animaciones solo donde aportan claridad de estado/transición.
8. ❌ No usar contraste pobre para "look limpio" — WCAG AA es no-negociable

## Referencias internas

- Pages existentes a respetar como ejemplo: `/familias`, `/familias/[id]`, `/familias/[id]/children/[childId]`
- Componentes referencia: `FamiliesTable.tsx`, `FamilyForm.tsx`, `ChildForm.tsx`
