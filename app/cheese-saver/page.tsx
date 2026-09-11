import type { Metadata } from 'next';
import { CheeseSaver } from '@/components/cheese-saver';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Cheese Saver — Fondue Tour 2026',
  description: 'The password-protected photo and video gallery for the Fondue Tour 2026.',
  robots: { index: false, follow: false },
};

export default function CheeseSaverPage() {
  return <CheeseSaver />;
}
