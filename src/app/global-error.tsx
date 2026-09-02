'use client';

import { useEffect } from 'react';

/**
 * Catches errors thrown by the root layout itself — `Providers`,
 * `AppHeader`, a `next-themes`/hydration failure — which sit *above* where a
 * normal `error.tsx` can reach. This is the only file conventionally allowed
 * to replace `<html>`/`<body>`, and per the Next.js docs it does not inherit
 * globals.css or the app's Tailwind setup, so the markup below is
 * intentionally plain, inline-styled CSS rather than any app component or
 * class name. It also can't read the `next-themes` class on `<html>` (that
 * provider is itself inside the tree this file replaces), so it follows the
 * OS colour scheme directly via `prefers-color-scheme`.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error('[global error]', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
          colorScheme: 'light dark',
          backgroundColor: 'light-dark(#ffffff, #0a0a0a)',
          color: 'light-dark(#0a0a0a, #fafafa)',
        }}
      >
        <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>
            The archive couldn&apos;t load
          </h1>
          <p
            style={{
              marginTop: '0.5rem',
              fontSize: '0.875rem',
              color: 'light-dark(#525252, #a3a3a3)',
            }}
          >
            Something broke outside a single page. Nothing in the archive has
            been lost.
            {error.digest ? ` Reference: ${error.digest}` : ''}
          </p>
          <button
            onClick={retry}
            style={{
              marginTop: '1.25rem',
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              borderRadius: '0.375rem',
              border: '1px solid light-dark(#d4d4d4, #404040)',
              backgroundColor: 'transparent',
              color: 'inherit',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
