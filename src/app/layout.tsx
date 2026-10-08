import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { SITE_URL } from './lib/config';

const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['500'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Free HubSpot portal score | Muloo',
  description: 'A read only technical audit of your HubSpot portal, run live against your own data.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={mono.variable}>
      <body>
        <div className="app">
          <header className="topbar-wrap">
            <div className="burst" />
            <div className="topbar">
              <a href={SITE_URL} className="wordmark" aria-label="Muloo home">muloo</a>
              <span className="mono topbar__tag">Free portal score</span>
            </div>
          </header>
          {children}
          <footer className="footer mono">
            <span>Read only. We keep your score and headline findings, never your records. Access ends when the run finishes.</span>
            <a href={SITE_URL}>wearemuloo.com</a>
          </footer>
        </div>
      </body>
    </html>
  );
}
