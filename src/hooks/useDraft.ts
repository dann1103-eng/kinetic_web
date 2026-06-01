'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Autoguardado de borradores en el dispositivo (localStorage).
 *
 * Objetivo: que el staff no pierda lo que lleva escrito en un formulario cuando
 * se va la luz o el internet. Todo es 100% local — no toca nuestra DB ni el
 * servidor. `localStorage` se escribe a disco al instante, por lo que sobrevive
 * un corte de energía abrupto (se pierde, a lo sumo, lo tecleado en los últimos
 * ~`debounceMs`).
 *
 * Uso típico en un formulario:
 *
 *   const user = useUser()
 *   const formState = useMemo(() => ({ nombre, notas, items }), [nombre, notas, items])
 *   const { draft, savedAt, online, clear } = useDraft(`plan:${childId}`, formState, {
 *     userId: user.id,
 *     serverUpdatedAt: existing?.updated_at ?? null,
 *   })
 *
 *   {draft && <DraftRestoreBanner savedAt={savedAt} onRestore={() => aplicar(draft)} onDiscard={clear} />}
 *   ...
 *   // en handleSave, tras éxito: clear()
 */

const PREFIX = 'kinetic:draft:'
const DEFAULT_DEBOUNCE_MS = 700
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 días

interface StoredDraft<T> {
  v: 1
  userId: string
  savedAt: number
  data: T
}

export interface UseDraftOptions {
  /** ID del usuario logueado — separa borradores en computadoras compartidas. */
  userId: string
  /**
   * `updated_at` del registro en el servidor (ISO). Si el borrador es más viejo
   * que esto, se considera obsoleto y NO se ofrece restaurar (otra persona/equipo
   * guardó después). `null` para registros nuevos.
   */
  serverUpdatedAt?: string | null
  /** ms de espera tras el último cambio antes de escribir (default 700). */
  debounceMs?: number
  /** ms de expiración del borrador (default 7 días). */
  ttlMs?: number
  /** Si es false, no autoguarda ni ofrece restaurar (ej. mientras carga). */
  enabled?: boolean
}

export interface UseDraftResult<T> {
  /** Borrador disponible para restaurar (mismo usuario, no expirado, más nuevo que el server). */
  draft: T | null
  /** Epoch ms del último guardado local, o null. */
  savedAt: number | null
  /** Estado de conexión del dispositivo. */
  online: boolean
  /** Borra el borrador del dispositivo. Llamar tras un envío exitoso o al descartar. */
  clear: () => void
}

function readStoredDraft<T>(storageKey: string): StoredDraft<T> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredDraft<T>
    if (!parsed || parsed.v !== 1) return null
    return parsed
  } catch {
    return null
  }
}

export function useDraft<T>(
  key: string,
  value: T,
  options: UseDraftOptions,
): UseDraftResult<T> {
  const { userId, serverUpdatedAt = null, debounceMs = DEFAULT_DEBOUNCE_MS, ttlMs = DEFAULT_TTL_MS, enabled = true } = options
  const storageKey = `${PREFIX}${key}:${userId}`

  // Snapshot del borrador presente al montar (lazy init: solo se lee una vez).
  // No se aplica automáticamente — el componente decide si restaurarlo. La
  // lectura NO depende de `enabled` (eso solo gobierna las escrituras): así, en
  // modales que se montan cerrados, el borrador sigue disponible al abrirlos.
  const [initialDraft] = useState<StoredDraft<T> | null>(() => {
    const stored = readStoredDraft<T>(storageKey)
    if (!stored || stored.userId !== userId) return null
    const nowMs = new Date().getTime()
    if (nowMs - stored.savedAt > ttlMs) return null // expirado
    if (serverUpdatedAt) {
      const serverMs = Date.parse(serverUpdatedAt)
      if (!Number.isNaN(serverMs) && stored.savedAt <= serverMs) return null // obsoleto
    }
    return stored
  })

  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [online, setOnline] = useState<boolean>(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  // Estado de conexión (escucha eventos, no setState en cuerpo de efecto).
  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  // Escritura con debounce. Se omite la primera ejecución (estado inicial del
  // formulario) para no pisar el borrador existente antes de que el usuario
  // decida restaurarlo. A partir del primer cambio real, autoguarda.
  const isFirstRun = useRef(true)
  const valueRef = useRef(value)
  // El ref se actualiza en efecto (no durante render) para el flush en pagehide.
  useEffect(() => {
    valueRef.current = value
  }, [value])

  useEffect(() => {
    if (!enabled) return
    if (isFirstRun.current) {
      isFirstRun.current = false
      return
    }
    const handle = window.setTimeout(() => {
      try {
        const payload: StoredDraft<T> = {
          v: 1,
          userId,
          savedAt: new Date().getTime(),
          data: value,
        }
        window.localStorage.setItem(storageKey, JSON.stringify(payload))
        setSavedAt(payload.savedAt)
      } catch {
        // localStorage lleno o deshabilitado — se ignora silenciosamente.
      }
    }, debounceMs)
    return () => window.clearTimeout(handle)
    // value se serializa por referencia; el efecto corre cuando cambia.
  }, [value, enabled, storageKey, userId, debounceMs])

  // Flush al cerrar/ocultar la pestaña (cierre ordenado, no corte de luz).
  useEffect(() => {
    if (!enabled) return
    const flush = () => {
      try {
        const payload: StoredDraft<T> = {
          v: 1,
          userId,
          savedAt: new Date().getTime(),
          data: valueRef.current,
        }
        window.localStorage.setItem(storageKey, JSON.stringify(payload))
      } catch {
        // ignore
      }
    }
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [enabled, storageKey, userId])

  const clear = useCallback(() => {
    try {
      window.localStorage.removeItem(storageKey)
    } catch {
      // ignore
    }
    setSavedAt(null)
  }, [storageKey])

  return {
    draft: initialDraft?.data ?? null,
    savedAt: savedAt ?? initialDraft?.savedAt ?? null,
    online,
    clear,
  }
}

/** Borra TODOS los borradores locales. Llamar al cerrar sesión (privacidad de pacientes). */
export function clearAllDrafts(): void {
  if (typeof window === 'undefined') return
  try {
    const keys: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (k && k.startsWith(PREFIX)) keys.push(k)
    }
    keys.forEach((k) => window.localStorage.removeItem(k))
  } catch {
    // ignore
  }
}
