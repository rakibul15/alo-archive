import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { AppHeader } from '@/components/app-header';
import { Providers } from './providers';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Alo Archive',
  description:
    'Upload, track and review the Alo Relief Trust document archive.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      // `suppressHydrationWarning` is required by next-themes: the theme class
      // is written to <html> before React hydrates, so server and client markup
      // legitimately differ on this one attribute.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/*
        `h-full` rather than `min-h-full`: the documents page needs a bounded
        height so the virtualised list can own its own scroll container instead
        of scrolling the window.
      */}
      <body
        // Same reasoning as `<html>`'s, one tag down: browser extensions
        // (ColorZilla's `cz-shortcut-listen`, Grammarly, password managers)
        // routinely write attributes onto `<body>` before React hydrates.
        // That's a real DOM difference React would otherwise warn about,
        // but it's not a bug this app can fix or even detect — it depends
        // entirely on what a given visitor has installed, not on anything
        // rendered here. `suppressHydrationWarning` isn't inherited from
        // the `<html>` tag above, so it needs stating again on this one.
        suppressHydrationWarning
        className="flex h-full flex-col bg-background text-foreground"
      >
        <Providers>
          <AppHeader />
          {children}
        </Providers>
      </body>
    </html>
  );
}
