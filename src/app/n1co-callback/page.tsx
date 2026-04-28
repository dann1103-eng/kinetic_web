/**
 * Callback público para el flujo de pago embebido vía iframe.
 *
 * Cuando un cliente paga (o cancela) un payment link de n1co dentro del iframe del
 * CRM, n1co redirige el iframe a esta página. Aquí le mandamos un postMessage al
 * parent window para que cierre el modal y refresque la factura.
 *
 * Esta ruta NO requiere auth — debe estar en la lista de bypass de proxy.ts.
 */

import { Suspense } from 'react'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{
    status?: string
    invoice?: string
    paid?: string
  }>
}

export default async function N1coCallbackPage({ searchParams }: Props) {
  const params = await searchParams
  const status = params.status === 'cancel' ? 'cancel' : 'success'
  const invoiceId = params.invoice ?? params.paid ?? ''

  return (
    <Suspense>
      <CallbackUI status={status} invoiceId={invoiceId} />
    </Suspense>
  )
}

function CallbackUI({ status, invoiceId }: { status: 'success' | 'cancel'; invoiceId: string }) {
  const isSuccess = status === 'success'
  const title = isSuccess ? '¡Pago recibido!' : 'Pago cancelado'
  const subtitle = isSuccess
    ? 'Estamos confirmando con n1co. Esta ventana se cerrará automáticamente.'
    : 'No se realizó ningún cobro. Puedes cerrar esta ventana.'
  const color = isSuccess ? '#00675c' : '#b31b25'

  // Inline script: postMessage al parent y mostrar UI de éxito.
  // No hay React state porque la página puede cerrarse por sí misma — el padre la cierra al recibir el mensaje.
  const messagePayload = {
    source: 'fm-crm-n1co-callback' as const,
    type: isSuccess ? 'payment_success' : 'payment_cancel',
    invoiceId: invoiceId || null,
  }
  const inlineScript = `
    (function() {
      try {
        var msg = ${JSON.stringify(messagePayload)};
        msg.ts = Date.now();
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(msg, '*');
        }
        if (window.top && window.top !== window) {
          window.top.postMessage(msg, '*');
        }
      } catch (err) {
        console.error('[n1co-callback] error posting message', err);
      }
    })();
  `

  return (
    <html lang="es">
      <head>
        <title>{title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{`
          html, body { margin: 0; padding: 0; height: 100%; font-family: system-ui, -apple-system, sans-serif; }
          .wrap { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; padding: 24px; text-align: center; }
          .icon { width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 16px; background: ${color}1a; color: ${color}; font-size: 40px; }
          h1 { margin: 0 0 8px; color: ${color}; font-size: 22px; font-weight: 600; }
          p { margin: 0; color: #666; font-size: 14px; max-width: 320px; line-height: 1.5; }
          .pulse { animation: pulse 1.5s ease-in-out infinite; }
          @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
        `}</style>
      </head>
      <body>
        <div className="wrap">
          <div className={`icon ${isSuccess ? 'pulse' : ''}`}>
            {isSuccess ? '✓' : '✕'}
          </div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script dangerouslySetInnerHTML={{ __html: inlineScript }} />
      </body>
    </html>
  )
}
