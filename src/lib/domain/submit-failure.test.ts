import { describe, it, expect } from 'vitest'
import {
  reportFromServerFailure,
  reportFromThrown,
  serverFailureFromDbError,
  serverFailureFromException,
  type FailureContext,
} from './submit-failure'

const ctx: FailureContext = {
  action: 'Crear entrada de lista de espera',
  now: new Date('2026-10-17T21:15:30Z'),
  online: true,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130',
  userRef: 'Usuaria Ejemplo (admin)',
}

describe('serverFailureFromDbError', () => {
  it('un CHECK que rechaza el valor se reporta como error de base de datos con su código', () => {
    const f = serverFailureFromDbError({
      message: 'new row for relation "waitlist_entries" violates check constraint "x"',
      code: '23514',
      details: 'Failing row contains (...)',
      hint: null,
    })

    expect(f.kind).toBe('database')
    expect(f.code).toBe('23514')
    expect(f.error).toContain('violates check constraint')
    expect(f.detail).toContain('Failing row contains')
  })

  it('un rechazo de RLS (42501) es de permisos, no de base de datos', () => {
    const f = serverFailureFromDbError({
      message: 'new row violates row-level security policy for table "waitlist_entries"',
      code: '42501',
    })

    expect(f.kind).toBe('permission')
  })

  it('no deja pasar datos del paciente que Postgres mete en el mensaje ni en el detalle', () => {
    const f = serverFailureFromDbError({
      message: 'invalid input syntax for type date: "Rosales Ejemplo"',
      code: '22007',
      details: 'Failing row contains (a1b2, ZELAYA EJEMPLO, 7777-7777, lenguaje).',
    })

    expect(f.error).toContain('invalid input syntax for type date')
    expect(f.error).not.toContain('Rosales')
    expect(f.detail).not.toContain('ZELAYA')
    expect(f.detail).not.toContain('7777')
  })

  it('oculta el valor de una llave duplicada pero deja ver qué columna es', () => {
    const f = serverFailureFromDbError({
      message: 'duplicate key value violates unique constraint "x"',
      code: '23505',
      details: 'Key (child_full_name)=(MOLINA EJEMPLO) already exists.',
    })

    expect(f.detail).toContain('child_full_name')
    expect(f.detail).not.toContain('MOLINA')
  })

  it('une details y hint en un solo detalle y omite los vacíos', () => {
    const f = serverFailureFromDbError({
      message: 'm',
      code: '23503',
      details: 'Key is not present',
      hint: 'revisar fk',
    })

    expect(f.detail).toBe('Key is not present — revisar fk')
    expect(serverFailureFromDbError({ message: 'm', details: '', hint: null }).detail).toBeUndefined()
  })
})

describe('serverFailureFromException', () => {
  it('"No autenticado" es una sesión vencida', () => {
    expect(serverFailureFromException(new Error('No autenticado')).kind).toBe('session')
  })

  it('cualquier otra excepción conserva su mensaje y se marca desconocida', () => {
    const f = serverFailureFromException(new TypeError('boom'))

    expect(f.kind).toBe('unknown')
    expect(f.error).toBe('boom')
  })

  it('un valor lanzado que no es Error no truena', () => {
    expect(serverFailureFromException('texto suelto').error).toBe('texto suelto')
    expect(serverFailureFromException(undefined).error).toBeTruthy()
  })
})

describe('reportFromServerFailure', () => {
  it('una validación muestra el mensaje tal cual y deja claro que no se guardó', () => {
    const r = reportFromServerFailure(
      { kind: 'validation', error: 'El teléfono de contacto es requerido.' },
      ctx,
    )

    expect(r.kind).toBe('validation')
    expect(r.headline).toBe('El teléfono de contacto es requerido.')
    expect(r.outcomeUnknown).toBe(false)
  })

  it('un error de base de datos traduce el código y conserva el mensaje original en el detalle', () => {
    const r = reportFromServerFailure(
      {
        kind: 'database',
        code: '23514',
        error: 'new row violates check constraint "waitlist_entries_requested_service_type_check"',
      },
      ctx,
    )

    expect(r.headline).toMatch(/base de datos/i)
    expect(r.technical).toContain('Código: 23514')
    expect(r.technical).toContain('waitlist_entries_requested_service_type_check')
    expect(r.outcomeUnknown).toBe(false)
  })

  it('un error de base de datos con código desconocido igual se explica', () => {
    const r = reportFromServerFailure({ kind: 'database', code: '99999', error: 'algo raro' }, ctx)

    expect(r.headline).toBeTruthy()
    expect(r.technical).toContain('algo raro')
  })

  it('un error de permisos incluye el rol efectivo en el detalle (por si se está suplantando)', () => {
    const r = reportFromServerFailure(
      { kind: 'permission', error: 'No autorizado.', detail: 'rol: terapista' },
      ctx,
    )

    expect(r.kind).toBe('permission')
    expect(r.technical).toContain('rol: terapista')
  })

  it('una sesión vencida pide volver a entrar y avisa que el borrador queda en el equipo', () => {
    const r = reportFromServerFailure({ kind: 'session', error: 'No autenticado' }, ctx)

    expect(r.hint).toMatch(/sesión/i)
    expect(r.hint).toMatch(/borrador/i)
  })

  it('un error desconocido del servidor advierte que PUEDE haberse guardado', () => {
    const r = reportFromServerFailure({ kind: 'unknown', error: 'boom' }, ctx)

    expect(r.outcomeUnknown).toBe(true)
    expect(r.hint).toMatch(/revis/i)
  })
})

describe('reportFromThrown', () => {
  it('sin internet al fallar: no se guardó y los datos siguen en el equipo', () => {
    const r = reportFromThrown(new TypeError('Failed to fetch'), { ...ctx, online: false })

    expect(r.kind).toBe('offline')
    expect(r.outcomeUnknown).toBe(false)
    expect(r.hint).toMatch(/equipo/i)
  })

  it('"Failed to fetch" con internet: no se pudo contactar al servidor y PUEDE haberse guardado', () => {
    const r = reportFromThrown(new TypeError('Failed to fetch'), ctx)

    expect(r.kind).toBe('unreachable')
    expect(r.outcomeUnknown).toBe(true)
    expect(r.hint).toMatch(/duplic/i)
  })

  it('"Load failed" (Safari) se trata igual que "Failed to fetch"', () => {
    expect(reportFromThrown(new TypeError('Load failed'), ctx).kind).toBe('unreachable')
  })

  it('una acción que ya no existe en el servidor significa página desactualizada tras un deploy', () => {
    const r = reportFromThrown(
      new Error('Failed to find Server Action "7f3a". This request might be from an older or newer deployment.'),
      ctx,
    )

    expect(r.kind).toBe('outdated')
    expect(r.outcomeUnknown).toBe(false)
    expect(r.hint).toMatch(/recarg/i)
  })

  it('"An unexpected response was received from the server" es una respuesta inesperada', () => {
    const r = reportFromThrown(new Error('An unexpected response was received from the server.'), ctx)

    expect(r.kind).toBe('badResponse')
    expect(r.outcomeUnknown).toBe(true)
  })

  it('"No autenticado" lanzado desde el servidor es sesión vencida', () => {
    expect(reportFromThrown(new Error('No autenticado'), ctx).kind).toBe('session')
  })

  it('un error cualquiera queda como desconocido con su nombre y mensaje en el detalle', () => {
    const r = reportFromThrown(new RangeError('algo se rompió'), ctx)

    expect(r.kind).toBe('unknown')
    expect(r.technical).toContain('RangeError')
    expect(r.technical).toContain('algo se rompió')
  })

  it('un valor lanzado que no es Error no truena y queda en el detalle', () => {
    expect(reportFromThrown('texto suelto', ctx).technical).toContain('texto suelto')
    expect(reportFromThrown(null, ctx).technical).toBeTruthy()
    expect(reportFromThrown({ foo: 1 }, ctx).technical).toContain('foo')
  })
})

describe('detalle técnico (lo que se copia y se manda a soporte)', () => {
  const r = reportFromThrown(new Error('boom'), ctx)

  it('lleva acción, hora, usuaria, conexión y navegador', () => {
    expect(r.technical).toContain('Acción: Crear entrada de lista de espera')
    expect(r.technical).toContain('Usuario: Usuaria Ejemplo (admin)')
    expect(r.technical).toContain('Conexión: en línea')
    expect(r.technical).toContain('Navegador: Mozilla/5.0')
  })

  it('la hora va en hora de El Salvador y también en UTC para cruzar con logs', () => {
    // 21:15 UTC = 3:15 p. m. en El Salvador (UTC-6).
    expect(r.technical).toMatch(/Hora: .*3:15/)
    expect(r.technical).toContain('2026-10-17T21:15:30.000Z')
  })

  it('no imprime "undefined" ni "null" cuando faltan datos opcionales', () => {
    const bare = reportFromThrown(new Error('boom'), {
      action: 'Crear entrada de lista de espera',
      now: ctx.now,
      online: false,
    })

    expect(bare.technical).not.toMatch(/undefined|null/)
    expect(bare.technical).toContain('Conexión: sin conexión')
    expect(bare.technical).not.toContain('Usuario:')
    expect(bare.technical).not.toContain('Navegador:')
  })

  it('recorta un user agent larguísimo', () => {
    const long = reportFromThrown(new Error('boom'), { ...ctx, userAgent: 'x'.repeat(1000) })

    expect(long.technical.length).toBeLessThan(900)
  })
})
