'use client'

import { useCallback } from 'react'

export interface BrowserNotifPayload {
  title: string
  body: string
  /** ID único — si se repite, el navegador deduplica. */
  tag?: string
  /** URL relativa o absoluta a navegar al click. */
  href?: string | null
  /** Forzar disparo aunque la pestaña tenga foco (default: false). */
  force?: boolean
}

/**
 * Helper para Web Notifications API.
 * - `requestPermission()` se llama tras una interacción del usuario (constraint del navegador).
 * - `dispatch()` solo dispara si el permiso está concedido y la pestaña NO tiene foco
 *   (a menos que `force=true`), para no spamear cuando el toast in-app ya se ve.
 */
export function useBrowserNotifications() {
  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'denied'
    if (Notification.permission === 'granted' || Notification.permission === 'denied') {
      return Notification.permission
    }
    try {
      const result = await Notification.requestPermission()
      return result
    } catch {
      return 'denied'
    }
  }, [])

  const dispatch = useCallback((payload: BrowserNotifPayload) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission !== 'granted') return
    if (!payload.force && document.hasFocus()) return

    try {
      const n = new Notification(payload.title, {
        body: payload.body,
        icon: '/icon.png',
        tag: payload.tag,
      })
      n.onclick = () => {
        try {
          window.focus()
          if (payload.href) window.location.href = payload.href
        } finally {
          n.close()
        }
      }
    } catch {
      /* navegadores antiguos / iOS bloquean el constructor sin SW */
    }
  }, [])

  return { requestPermission, dispatch }
}
