import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@react-pdf/renderer'],
  experimental: {
    serverActions: {
      // Default de Next.js 16 es 1 MB — insuficiente para fotos de móvil
      // (las cámaras de iPhone y Android generan 5-12 MB en HEIC/JPEG).
      // Subimos a 25 MB. La validación per-archivo (10 MB) sigue en los
      // server actions (child-attachments.ts, report-files.ts, agencySettings.ts).
      bodySizeLimit: '25mb',
    },
  },
  async headers() {
    // CSP en modo Report-Only: NO bloquea nada, solo reporta violaciones a la
    // consola del navegador. Es un punto de partida — hay que afinarlo mirando los
    // reportes antes de pasarlo a enforcing (renombrar a 'Content-Security-Policy').
    // Next inyecta scripts inline (hidratación) y base-ui/shadcn estilos inline, por
    // eso 'unsafe-inline'; al endurecer, migrar a nonces. (H9 del audit)
    const cspReportOnly = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https:",
      "connect-src 'self' https: wss:",
      "frame-src 'self' https:",
      "frame-ancestors 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')

    return [
      {
        source: '/:path*',
        headers: [
          {
            // Permite a la app capturar mic/cámara/screen share para llamadas LiveKit.
            key: 'Permissions-Policy',
            value: 'microphone=(self), camera=(self), display-capture=(self)',
          },
          // Anti-clickjacking. SAMEORIGIN (no DENY) porque el flujo de pago n1co
          // enmarca /n1co-callback en un iframe del MISMO origen.
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains',
          },
          { key: 'Content-Security-Policy-Report-Only', value: cspReportOnly },
        ],
      },
    ]
  },
};

export default nextConfig;
