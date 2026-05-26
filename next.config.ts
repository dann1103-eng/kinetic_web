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
    return [
      {
        // Permite a la app capturar mic/cámara/screen share para llamadas LiveKit.
        source: '/:path*',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'microphone=(self), camera=(self), display-capture=(self)',
          },
        ],
      },
    ]
  },
};

export default nextConfig;
