import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@react-pdf/renderer'],
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
