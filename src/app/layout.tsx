import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { SITE_URL } from './lib/config';

const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['500'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Muloo | HubSpot audit',
  description: 'A read only technical audit of your HubSpot portal, run live against your own data.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={mono.variable}>
      <body>
        <div className="app">
          <header className="topbar">
            <a href={SITE_URL} className="brand" aria-label="Muloo home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/muloo-wordmark.svg" alt="Muloo" width={104} height={30} />
            </a>
            <span className="mono topbar__tag">HubSpot audit</span>
          </header>
          {children}
          <footer className="footer mono">
            <span>Read only. We keep your score and headline findings, never your records.</span>
            <a href={SITE_URL}>wearemuloo.com</a>
          </footer>
        </div>
      </body>
    </html>
  );
}
