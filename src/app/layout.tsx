import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { createClient } from "@/lib/supabase/server";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600", "700", "800"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1FA4DA",
};

export async function generateMetadata(): Promise<Metadata> {
  let agencyLogoUrl: string | null = null
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('app_settings')
      .select('value, updated_at')
      .eq('key', 'agency_logo_url')
      .maybeSingle()
    agencyLogoUrl = data?.value ?? null
  } catch {
    /* si falla el fetch (build sin env), usar fallback */
  }

  // Cache-bust: aseguramos que el URL del logo cambie cada vez que se actualiza
  // (uploadAgencyLogo ya añade ?v=timestamp; acá garantizamos el comportamiento).
  const iconUrl = agencyLogoUrl ?? '/icons/icon-192.png'
  const appleIconUrl = agencyLogoUrl ?? '/icons/apple-touch-icon.png'

  return {
    title: 'Kinetic — Centro de Estimulación y Desarrollo Intelectual',
    description: 'Plataforma de gestión clínica y educativa para niños neurodivergentes',
    manifest: '/manifest.json',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: 'Kinetic',
    },
    icons: {
      // Múltiples sizes para que el browser elija; cada entry usa la MISMA URL
      // pero browsers cachean por (rel + sizes), así que múltiples entries fuerzan
      // re-fetch cuando el URL cambia.
      icon: [
        { url: iconUrl, sizes: '32x32', type: 'image/png' },
        { url: iconUrl, sizes: '192x192', type: 'image/png' },
      ],
      shortcut: iconUrl,
      apple: appleIconUrl,
    },
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${manrope.variable} h-full`} suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        />
      </head>
      <body className="min-h-full bg-fm-background text-fm-on-surface font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
