/**
 * Cuando un formulario no se pudo guardar, la persona tiene que ver QUÉ pasó y
 * qué hacer — y quien da soporte tiene que poder reconstruirlo sin adivinar.
 *
 * Contexto: el 17-oct-2026 tres niños "agregados" a la lista de espera no
 * quedaron en la base ni dejaron rastro, y no hubo forma de saber si el envío
 * falló, si ni siquiera se envió, o si el servidor no respondió. Este módulo
 * convierte cualquier falla (la que devuelve el servidor y la que se lanza en
 * el cliente) en un reporte con tres partes: qué pasó, qué hacer, y un detalle
 * técnico copiable.
 *
 * Es PURO a propósito (sin React ni Supabase): se prueba en `submit-failure.test.ts`
 * y el servidor y el cliente comparten el mismo vocabulario de tipos de falla.
 *
 * PRIVACIDAD: el contexto no admite datos del paciente (nombre, teléfono,
 * diagnóstico). Solo la acción, la hora y quién la hizo.
 */

import { formatSvDateTime } from '@/lib/format/datetime-sv'

export type SubmitFailureKind =
  | 'validation' // el servidor rechazó un dato del formulario
  | 'permission' // el rol (o la suplantación) no puede hacerlo
  | 'session' // sesión vencida
  | 'database' // la base de datos no aceptó el registro
  | 'outdated' // la página es de una versión vieja del sistema
  | 'offline' // el equipo no tiene internet
  | 'unreachable' // hay internet pero el request no llegó o no volvió
  | 'badResponse' // el servidor respondió algo que no es una respuesta de la acción
  | 'unknown'

/** Lo que devuelve el servidor cuando una acción no se pudo completar. */
export interface ServerFailure {
  kind: SubmitFailureKind
  /** Mensaje corto: el texto de validación o el mensaje original de Postgres. */
  error: string
  /** Código de Postgres (`23514`, `42501`, …) cuando aplica. */
  code?: string
  /** Información extra para soporte (details/hint de Postgres, rol efectivo, …). */
  detail?: string
}

export interface DbErrorLike {
  message: string
  code?: string
  details?: string | null
  hint?: string | null
}

export interface FailureContext {
  /** Qué se estaba haciendo, p. ej. "Crear entrada de lista de espera". */
  action: string
  now: Date
  online: boolean
  userAgent?: string
  /** Quién lo hizo, p. ej. "Nombre Apellido (admin)". */
  userRef?: string
}

export interface SubmitFailureReport {
  kind: SubmitFailureKind
  /** Qué pasó, en una frase. */
  headline: string
  /** Qué hacer ahora. */
  hint: string
  /** Texto multilínea para copiar y mandar a soporte. */
  technical: string
  /**
   * true si el servidor PUDO haber guardado igual (el request salió pero no
   * sabemos qué pasó). Reintentar a ciegas en ese caso duplica el registro.
   */
  outcomeUnknown: boolean
}

// ──────────────────────────────────────────────────────────────────────────
// Del servidor (se arma dentro de la Server Action)
// ──────────────────────────────────────────────────────────────────────────

export function serverFailureFromDbError(e: DbErrorLike): ServerFailure {
  const extra = [e.details, e.hint]
    .filter((s): s is string => !!s && s.trim() !== '')
    .map(redactPatientData)
  return {
    // 42501 = insufficient_privilege, que es lo que lanza una política RLS.
    kind: e.code === '42501' ? 'permission' : 'database',
    error: redactPatientData(e.message),
    code: e.code || undefined,
    detail: extra.length ? extra.join(' — ') : undefined,
  }
}

/**
 * Postgres copia en sus mensajes lo que el usuario escribió: la fila completa
 * (`Failing row contains (...)`), el valor de una llave (`Key (col)=(valor)`) o
 * el valor que no pudo convertir (`invalid input syntax for type date: "..."`).
 * En esta app esos valores son el nombre y el teléfono de un niño, así que se
 * quitan antes de que el texto llegue a los logs o al portapapeles de soporte.
 */
function redactPatientData(text: string): string {
  return text
    .replace(/Failing row contains \([\s\S]*\)/g, 'Failing row contains (datos omitidos)')
    .replace(/Key \(([^)]*)\)=\([\s\S]*?\)/g, 'Key ($1)=(…)')
    .replace(/(invalid input syntax for type [^:]+): "[\s\S]*?"/g, '$1: "…"')
}

export function serverFailureFromException(err: unknown): ServerFailure {
  const message = errorMessage(err)
  if (/no autenticado/i.test(message)) {
    return { kind: 'session', error: message }
  }
  return { kind: 'unknown', error: message }
}

// ──────────────────────────────────────────────────────────────────────────
// Del cliente (se arma en el modal)
// ──────────────────────────────────────────────────────────────────────────

export function reportFromServerFailure(
  f: ServerFailure,
  ctx: FailureContext,
): SubmitFailureReport {
  const technicalLines: [string, string | undefined][] = [
    ['Tipo', f.kind],
    ['Código', f.code],
    ['Mensaje', f.error],
    ['Detalle', f.detail],
  ]

  switch (f.kind) {
    case 'validation':
      return build(f.kind, f.error, 'Corregí el dato y volvé a intentar. No se guardó nada.', false, technicalLines, ctx)
    case 'permission':
      return build(
        f.kind,
        'No tenés permiso para crear esta entrada.',
        'No se guardó. Si estás suplantando a otro usuario o tu rol cambió, avisá a administración con el detalle de abajo.',
        false,
        technicalLines,
        ctx,
      )
    case 'session':
      return build(
        f.kind,
        'Tu sesión venció.',
        'No se guardó. Volvé a iniciar sesión: lo que escribiste queda como borrador en este equipo.',
        false,
        technicalLines,
        ctx,
      )
    case 'database':
      return build(
        f.kind,
        databaseHeadline(f.code),
        'No se guardó. Copiá el detalle técnico y mandáselo a quien da soporte del sistema.',
        false,
        technicalLines,
        ctx,
      )
    default:
      // Cualquier otro tipo que llegue del servidor: no sabemos el desenlace.
      return build(f.kind, 'Ocurrió un error inesperado en el servidor.', UNCERTAIN_HINT, true, technicalLines, ctx)
  }
}

export function reportFromThrown(err: unknown, ctx: FailureContext): SubmitFailureReport {
  const message = errorMessage(err)
  const name = errorName(err)
  const technicalLines: [string, string | undefined][] = [
    ['Error', name],
    ['Mensaje', message],
  ]

  if (!ctx.online) {
    return build(
      'offline',
      'Sin conexión a internet.',
      'No se guardó. Lo que escribiste está a salvo en este equipo — reintentá cuando vuelva el internet.',
      false,
      technicalLines,
      ctx,
    )
  }
  if (/failed to find server action|older or newer deployment|unrecognizedaction/i.test(message)) {
    return build(
      'outdated',
      'La página quedó desactualizada.',
      'Se publicó una versión nueva del sistema mientras la tenías abierta. No se guardó. Copiá el detalle, recargá la página (F5) y volvé a abrir "Nueva entrada": lo que escribiste queda como borrador.',
      false,
      technicalLines,
      ctx,
    )
  }
  if (/no autenticado/i.test(message)) {
    return reportFromServerFailure({ kind: 'session', error: message }, ctx)
  }
  if (/unexpected response was received from the server/i.test(message)) {
    return build(
      'badResponse',
      'El servidor respondió algo inesperado.',
      'Suele ser una sesión vencida o una falla momentánea del servicio. Puede que SÍ se haya guardado: revisá la lista de espera antes de reintentar, para no duplicarla.',
      true,
      technicalLines,
      ctx,
    )
  }
  if (/failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(message)) {
    return build(
      'unreachable',
      'No se pudo contactar al servidor.',
      'Puede que SÍ se haya guardado. Antes de reintentar revisá la lista de espera, para no duplicarla.',
      true,
      technicalLines,
      ctx,
    )
  }
  return build('unknown', 'Ocurrió un error inesperado al guardar.', UNCERTAIN_HINT, true, technicalLines, ctx)
}

// ──────────────────────────────────────────────────────────────────────────
// Internos
// ──────────────────────────────────────────────────────────────────────────

const UNCERTAIN_HINT =
  'No sabemos si se guardó. Revisá la lista de espera antes de reintentar, para no duplicar la entrada, y mandá el detalle técnico a quien da soporte.'

const MAX_USER_AGENT = 200

function databaseHeadline(code?: string): string {
  switch (code) {
    case '23514':
      return 'La base de datos rechazó un valor del formulario.'
    case '23503':
      return 'Se eligió un dato que ya no existe (por ejemplo una terapista o una fuente de referencia).'
    case '23502':
      return 'Falta un dato obligatorio.'
    case '22P02':
    case '22007':
    case '22008':
      return 'Un valor tiene un formato que la base de datos no entiende (por ejemplo la fecha).'
    default:
      return 'La base de datos no aceptó el registro.'
  }
}

function build(
  kind: SubmitFailureKind,
  headline: string,
  hint: string,
  outcomeUnknown: boolean,
  specific: [string, string | undefined][],
  ctx: FailureContext,
): SubmitFailureReport {
  const iso = ctx.now.toISOString()
  const lines: [string, string | undefined][] = [
    ['Acción', ctx.action],
    ['Hora', `${formatSvDateTime(iso)} (hora de El Salvador) · ${iso}`],
    ...specific,
    ['Usuario', ctx.userRef],
    ['Conexión', ctx.online ? 'en línea' : 'sin conexión'],
    ['Navegador', ctx.userAgent ? ctx.userAgent.slice(0, MAX_USER_AGENT) : undefined],
  ]
  const technical = lines
    .filter((l): l is [string, string] => l[1] !== undefined && l[1] !== '')
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n')

  return { kind, headline, hint, technical, outcomeUnknown }
}

function errorName(err: unknown): string | undefined {
  if (err instanceof Error) return err.name
  return undefined
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message || err.name
  if (typeof err === 'string') return err
  if (err === null || err === undefined) return 'Error sin información (el valor lanzado estaba vacío)'
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}
