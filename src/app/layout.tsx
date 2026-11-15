import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/archivo/standard.css';
import './globals.css';

export const metadata: Metadata = {
  // Absolute URLs for the share image. Set NEXT_PUBLIC_SITE_URL to the deployed address (Vercel fills it in).
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : 'http://localhost:3000'),
  ),
  title: 'Ventis-75 — a mechanical keyboard you can take apart in the browser',
  description:
    'Interactive 3D product page for the Ventis-75, a 75% aluminium mechanical keyboard. Type on it, pull it apart, change its finish.',
  applicationName: 'Ventis-75',
  openGraph: {
    title: 'Ventis-75',
    description: 'A 75% aluminium keyboard you can type on, pull apart and refinish, right in the browser.',
    type: 'website',
  },
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = { themeColor: '#3b4046' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
