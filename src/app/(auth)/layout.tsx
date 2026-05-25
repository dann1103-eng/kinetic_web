'use client'

import { useEffect } from 'react'

/**
 * Layout para rutas de autenticación (/login, etc).
 *
 * Fuerza modo claro mientras este layout esté montado, sin importar la
 * preferencia del usuario en localStorage. Razón: el login tiene un fondo
 * con shader / gradient pensado para fondo claro y el card del form está
 * diseñado en modo claro. Cambiarlo a dark se ve mal.
 *
 * Implementación:
 *   1. Script inline en el render: quita `.dark` del <html> en el primer paint
 *      (antes de que React hidrate, para evitar flash de oscuro).
 *   2. useEffect + MutationObserver: si next-themes intenta re-aplicar `.dark`
 *      (después de hidratar), lo volvemos a quitar.
 *   3. Cleanup: al desmontar (cuando el usuario hace login y navega al
 *      dashboard) restauramos la clase `dark` si la tenía originalmente —
 *      el resto de la app respeta la preferencia normal del usuario.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const html = document.documentElement
    const wasDark = html.classList.contains('dark')

    if (wasDark) html.classList.remove('dark')

    // Mantener .dark fuera mientras este layout esté montado.
    const observer = new MutationObserver(() => {
      if (html.classList.contains('dark')) {
        html.classList.remove('dark')
      }
    })
    observer.observe(html, { attributes: true, attributeFilter: ['class'] })

    return () => {
      observer.disconnect()
      if (wasDark) html.classList.add('dark')
    }
  }, [])

  return (
    <>
      {/* Quita .dark sincrónicamente para evitar flash de oscuro en el primer paint. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `try { document.documentElement.classList.remove('dark'); } catch(e) {}`,
        }}
      />
      {children}
    </>
  )
}
