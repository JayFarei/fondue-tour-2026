import type { Metadata } from 'next';
import { Barlow_Condensed, Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { assetPath, siteUrl } from '@/lib/asset-path';
import { WeatherProvider } from '@/components/stop-weather';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const barlowCondensed = Barlow_Condensed({
  variable: '--font-barlow',
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Fondue Tour 2026 — Alpine Roadbook',
  description: 'A mobile roadbook with interactive routes, restart navigation and TomTom GPX downloads for the 2026 Fondue Tour.',
  openGraph: {
    title: 'Fondue Tour 2026',
    description: 'Five days. One Alpine line. Restart navigation and TomTom routes included.',
    images: [{ url: assetPath('/og.png'), width: 1731, height: 909, alt: 'Fondue Tour 2026 — Five days. One Alpine line.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Fondue Tour 2026',
    description: 'Five days. One Alpine line. Restart navigation and TomTom routes included.',
    images: [assetPath('/og.png')],
  },
  icons: {
    icon: assetPath('/brand/fondue-tour-mark.png'),
    apple: assetPath('/brand/fondue-tour-mark.png'),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${barlowCondensed.variable} antialiased`}
      >
        <WeatherProvider>{children}</WeatherProvider>
      </body>
    </html>
  );
}
