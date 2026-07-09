# Menciones @ en comentarios de lista de espera — Diseño

**Fecha:** 2026-07-09
**Estado:** Aprobado por usuario, pendiente de plan de implementación

## Contexto

`waitlist_entry_comments` (migración 0165) es la bitácora de comentarios del
equipo dentro del modal de detalle de cada entrada de la lista de espera
(`/operacion/lista-de-espera`, componente `WaitlistComments.tsx`). Hoy es un
textarea simple sin ningún tipo de mención — el usuario pidió poder "arrobar"
(@mencionar) a otras personas del equipo interno dentro de ese chat, igual
que ya funciona en el chat de requerimientos (`RequirementChat.tsx` /
`requirement_messages` / `requirement_mentions`, migración 0041) y en los
comentarios de revisión de assets (`review_comments` / `review_comment_mentions`,
migración 0047).

El objetivo de este diseño es replicar ese patrón ya probado en el codebase,
adaptado al dominio de lista de espera, sin inventar mecanismos nuevos.

## Objetivo

1. Poder escribir `@Nombre` dentro del comentario de una entrada de lista de
   espera, con autocompletado de personas del equipo.
2. La persona mencionada recibe una notificación en la campanita
   (`NotificationsDropdown.tsx`), igual que las menciones de requerimientos y
   de revisión.
3. Al hacer click en la notificación, la persona mencionada aterriza
   directamente en la tarjeta/modal de esa entrada de lista de espera
   (deep-link automático vía `?entry=<id>`), no solo en la página general.

## Alcance

**Dentro de alcance:**
- Autocompletado @ reusando `MentionAutocomplete.tsx` tal cual (sin cambios).
- Tabla nueva `waitlist_comment_mentions` + RLS.
- Extensión de `addWaitlistComment` para aceptar y persistir menciones.
- Integración completa en la campanita (query, realtime, click-through).
- Deep-link `?entry=<id>` para auto-abrir el modal de la entrada mencionada.

**Fuera de alcance (explícitamente descartado en el brainstorm):**
- Mencionar a roles sin acceso a `/operacion/lista-de-espera` (terapistas,
  maestras, etc.). El autocompletado solo sugiere los 5 roles que ya pueden
  leer/escribir en esta bitácora: `admin`, `directora`,
  `coordinadora_familias`, `coordinadora_terapias`, `recepcion`.
- Notificaciones por canal externo (email/WhatsApp) — sigue siendo backlog
  general del proyecto, no específico de esta feature.
- Edición o borrado de menciones tras enviar el comentario (la tabla de
  comentarios ya es append-only; las menciones heredan esa restricción).

## Arquitectura

### 1. Datos — migración `0173_waitlist_comment_mentions.sql`

Calco de `review_comment_mentions` (0047), adaptado a `waitlist_entry_comments`:

```sql
create table public.waitlist_comment_mentions (
  id                    uuid        primary key default gen_random_uuid(),
  comment_id            uuid        not null references public.waitlist_entry_comments(id) on delete cascade,
  entry_id              uuid        not null references public.waitlist_entries(id) on delete cascade,
  mentioned_user_id     uuid        not null references public.users(id) on delete cascade,
  mentioned_by_user_id  uuid        references public.users(id) on delete set null,
  read_at               timestamptz,
  created_at            timestamptz not null default now(),
  constraint waitlist_comment_mentions_unique unique (comment_id, mentioned_user_id)
);

create index waitlist_comment_mentions_mentioned_idx
  on public.waitlist_comment_mentions(mentioned_user_id, read_at, created_at);

alter table public.waitlist_comment_mentions enable row level security;

-- SELECT: solo el propio mencionado
create policy "waitlist_mentions read own" on public.waitlist_comment_mentions
  for select using (mentioned_user_id = auth.uid());

-- UPDATE: el propio mencionado (marcar leída) — mismo patrón que requirement_mentions
create policy "waitlist_mentions update own" on public.waitlist_comment_mentions
  for update using (mentioned_user_id = auth.uid());

-- Sin policy de INSERT: se escribe exclusivamente con admin client desde
-- addWaitlistComment (igual que requirement_mentions / review_comment_mentions).

grant all on public.waitlist_comment_mentions to anon, authenticated, service_role;

alter publication supabase_realtime add table public.waitlist_comment_mentions;
```

Sin cambios de esquema en `waitlist_entry_comments` — el `body` sigue
guardando el texto tal cual, con `@Nombre Completo ` embebido como texto
plano (mismo comportamiento que `requirement_messages.body`).

### 2. Backend — `src/app/actions/waitlist.ts`

```typescript
const MENTIONABLE_ROLES = [
  'admin', 'directora', 'coordinadora_familias', 'coordinadora_terapias', 'recepcion',
] as const

export async function addWaitlistComment(
  entryId: string,
  body: string,
  mentionedUserIds?: string[],
): Promise<{ ok: true; comment: WaitlistCommentView } | { ok: false; error: string }> {
  const { supabase, user } = await getActor()
  if (!isCoord(user.role)) return { ok: false, error: 'No autorizado.' }

  const trimmed = body.trim()
  if (!trimmed) return { ok: false, error: 'El comentario no puede estar vacío.' }

  const { data, error } = await supabase
    .from('waitlist_entry_comments')
    .insert({ entry_id: entryId, author_user_id: user.id, body: trimmed })
    .select('id, body, created_at, author_user_id, author:users!waitlist_entry_comments_author_user_id_fkey(full_name)')
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? 'Error al comentar.' }

  // Menciones: validar en servidor contra MENTIONABLE_ROLES (no confiar en el
  // cliente), excluir auto-mención, deduplicar.
  const candidateIds = Array.from(new Set(mentionedUserIds ?? [])).filter((uid) => uid && uid !== user.id)
  if (candidateIds.length > 0) {
    const admin = createAdminClient()
    const { data: validUsers } = await admin
      .from('users')
      .select('id')
      .in('id', candidateIds)
      .in('role', MENTIONABLE_ROLES)
    const validIds = (validUsers ?? []).map((u) => u.id)
    if (validIds.length > 0) {
      const rows = validIds.map((uid) => ({
        comment_id: data.id,
        entry_id: entryId,
        mentioned_user_id: uid,
        mentioned_by_user_id: user.id,
      }))
      await admin.from('waitlist_comment_mentions').upsert(rows, { onConflict: 'comment_id,mentioned_user_id' })
    }
  }

  revalidatePath('/operacion/lista-de-espera')
  return { ok: true, comment: /* mapeo existente */ }
}

export async function markWaitlistMentionRead(mentionId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase } = await getActor()
  const { error } = await supabase
    .from('waitlist_comment_mentions')
    .update({ read_at: new Date().toISOString() })
    .eq('id', mentionId)
    .is('read_at', null)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function markAllWaitlistMentionsRead(): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, user } = await getActor()
  const { error } = await supabase
    .from('waitlist_comment_mentions')
    .update({ read_at: new Date().toISOString() })
    .eq('mentioned_user_id', user.id)
    .is('read_at', null)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
```

`isCoord()` ya existe en `waitlist.ts` (usado por `addWaitlistComment` hoy) —
se reutiliza sin cambios.

### 3. Frontend — `src/components/operacion/WaitlistComments.tsx`

Cambios sobre el componente actual:

- Agregar `const inputRef = useRef<HTMLTextAreaElement>(null)`.
- Agregar carga de usuarios mencionables al montar:
  ```typescript
  const [users, setUsers] = useState<MentionableUser[]>([])
  useEffect(() => {
    const supabase = createClient()
    supabase.from('users')
      .select('id, full_name, avatar_url, role')
      .neq('id', currentUserId)
      .in('role', ['admin', 'directora', 'coordinadora_familias', 'coordinadora_terapias', 'recepcion'])
      .then(({ data }) => setUsers((data ?? []) as MentionableUser[]))
  }, [currentUserId])
  ```
- Agregar `const [mentionIds, setMentionIds] = useState<string[]>([])`.
- Insertar `<MentionAutocomplete>` (importado de `src/components/requirements/MentionAutocomplete.tsx`, sin modificar) justo antes del `<textarea>`, con `ref={inputRef}` agregado al textarea.
- En `submit()`, pasar `mentionIds` a `addWaitlistComment(entryId, trimmed, mentionIds)` y resetear `mentionIds` tras éxito.

No se necesitan cambios en `MentionAutocomplete.tsx` — su API (`textareaRef`, `value`, `onChange`, `users`, `onMentionsChange`, `currentMentionIds`) ya es genérica y no tiene ninguna dependencia de `requirement_id`.

### 4. Notificaciones — campanita + deep-link

**`src/types/db.ts`** — extender `NotificationItem`:
```typescript
mention_source?: 'requirement' | 'review' | 'waitlist'
waitlist_entry_id?: string
```
(reutiliza `mentioned_by`, `message_preview`, `read` ya existentes en el tipo; `message_preview` para waitlist se arma como el nombre del niño/persona de la entrada, ej. "Santiago Andrés Saravia Portillo").

**`src/app/api/notifications/route.ts`** — agregar un tercer query en paralelo junto a `mentionsRes`/`reviewMentionsRes`:
```typescript
supabase.from('waitlist_comment_mentions')
  .select(`
    id, read_at, created_at, entry_id,
    mentioned_by:users!waitlist_comment_mentions_mentioned_by_user_id_fkey(id, full_name, avatar_url),
    entry:waitlist_entries(child_full_name),
    comment:waitlist_entry_comments(body)
  `)
  .eq('mentioned_user_id', user.id)
  .or(`read_at.is.null,created_at.gte.${mentionsSince}`)
  .order('created_at', { ascending: false })
  .limit(50)
```
Se mapea a `{ kind: 'mention', mention_source: 'waitlist', waitlist_entry_id: entry_id, message_preview: entry.child_full_name, ... }` y se concatena al arreglo `items` junto con los otros dos.

**`src/hooks/useNotifications.ts`** — agregar suscripción realtime a
`postgres_changes` sobre `waitlist_comment_mentions` (mismo patrón que las
otras dos tablas de menciones), para que la campanita refresque en vivo sin
hacer polling.

**`src/components/layout/NotificationsDropdown.tsx`** — agregar rama para
`mention_source === 'waitlist'`:
- Click → `markWaitlistMentionRead(item.id)` + navegar a
  `` `/operacion/lista-de-espera?entry=${item.waitlist_entry_id}` ``.

**Deep-link — `WaitlistPipelineBoard.tsx` y `WaitlistTable.tsx`** (ambas
vistas, ya que `WaitlistViewSwitcher` alterna entre las dos y cualquiera
puede estar activa cuando se llega desde la notificación):
- Leer `?entry=` con `useSearchParams()` en un `useEffect` al montar.
- Si el id existe en `entries`, hacer `setSelected(match)` (mismo estado que
  ya usa el click manual de una tarjeta) para abrir el modal automáticamente.
- No es necesario limpiar el query param después — el modal ya tiene su
  propio botón de cerrar (`X`), y recargar la página con el mismo link debe
  volver a abrir la misma tarjeta (comportamiento esperado de un deep-link).

## Flujo de datos end-to-end

1. Coordinadora escribe `@Ana` en el textarea del modal de una entrada →
   `MentionAutocomplete` sugiere usuarios de los 5 roles permitidos → al
   seleccionar, inserta `@Ana García ` en el texto y agrega el id a
   `mentionIds`.
2. Al enviar, `addWaitlistComment(entryId, body, mentionIds)` inserta el
   comentario y, con admin client, valida roles y hace upsert en
   `waitlist_comment_mentions`.
3. `useNotifications.ts` de Ana recibe el evento realtime → refetch de
   `/api/notifications` → aparece el badge en la campanita.
4. Ana hace click en la notificación → `markWaitlistMentionRead` +
   redirección a `/operacion/lista-de-espera?entry=<id>`.
5. La página carga, `WaitlistPipelineBoard`/`WaitlistTable` detecta el query
   param, encuentra la entrada en la lista ya cargada por el server component,
   y abre el modal automáticamente con el comentario de la coordinadora
   visible.

## Manejo de errores

- Si `entryId` del query param no existe en `entries` (por ejemplo, la
  entrada fue descartada y `includeHistorical` no está activo), el `useEffect`
  simplemente no encuentra match y no abre ningún modal — no se muestra error,
  la página se ve como si no hubiera deep-link.
- Si `addWaitlistComment` falla en el insert de menciones (error de red, rol
  inválido), **no debe abortar el comentario ya insertado** — el `upsert` de
  menciones va después del insert exitoso del comentario y sus errores no se
  propagan al usuario (mismo comportamiento no-bloqueante que
  `sendRequirementMessage`).
- `markWaitlistMentionRead` con un id que ya no pertenece al usuario (RLS)
  simplemente no actualiza ninguna fila — no es un error visible.

## Testing / verificación

- Insertar manualmente un comentario con mención vía SQL de prueba (dos
  usuarios reales de roles distintos) y confirmar que aparece en
  `GET /api/notifications` para el mencionado.
- Verificar en el navegador (preview): escribir `@` en el textarea, confirmar
  que el dropdown solo lista los 5 roles permitidos (no terapistas/maestras).
- Enviar un comentario con mención, cambiar de usuario (impersonar al
  mencionado) y confirmar: badge en campanita → click → aterriza en la
  entrada correcta con el modal abierto.
- Confirmar que recargar la URL con `?entry=<id>` directamente (sin pasar por
  la campanita) también abre el modal — valida que el deep-link no depende de
  estado de navegación previo.

## Migraciones pendientes

Esta feature agrega la migración **0173** (`waitlist_comment_mentions`) a la
lista de pendientes de aplicar manualmente en Supabase Dashboard, junto con
las ya pendientes **0168** y **0172** documentadas en `CLAUDE.md`.
