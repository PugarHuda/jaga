import type { Metadata } from 'next';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Jaga — Hedged-PLP Vault',
  description: 'PLP yield minus crash insurance, on DeepBook Predict.',
  icons: { icon: '/logo.svg', apple: '/logo.png' },
  openGraph: {
    title: 'Jaga — PLP yield minus crash insurance',
    description: 'An automated vault on DeepBook Predict that earns PLP yield and buys OTM binary puts as a crash hedge. Live on Sui testnet.',
    images: ['/logo.png'],
  },
  twitter: { card: 'summary_large_image', images: ['/logo.png'] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
