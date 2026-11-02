import type { Metadata, Viewport } from 'next';
import './globals.css';
import Nav from '@/components/Nav';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://shade-gateway.vercel.app'),
  title: 'SHADE · Private AI gateway',
  description: 'Use top AI models and pay per use in SOL. No account, no email, no card.',
  icons: { icon: '/shade-mark.svg' },
  openGraph: { title: 'SHADE · Private AI gateway', description: 'Top AI models, paid in SOL. No account, no card.', images: ['/shade-mark.svg'] },
};
export const viewport: Viewport = { themeColor: '#07110d' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const support = process.env.NEXT_PUBLIC_SUPPORT_URL;
  return (
    <html lang="en">
      <body>
        <Nav />
        {children}
        <footer className="footer">
          <div className="footerInner">
            <span>© {new Date().getFullYear()} SHADE · Beta</span>
            <span>
              <a href="/pricing">Pricing</a>
              <a href="/docs">API docs</a>
              {support && <a href={support} target="_blank" rel="noreferrer">Support</a>}
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
