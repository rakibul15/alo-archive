'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { ThemeProvider } from 'next-themes';
import { toast } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { isRetryable } from '@/lib/api/errors';

/**
 * React error boundaries only catch errors thrown during render — a promise
 * that rejects and is never handled (a bug in a `.then()` chain, a
 * third-party library rejecting unexpectedly) reaches none of them. This is
 * the complementary safety net: not a substitute for fixing the bug, just a
 * guarantee that a silent failure surfaces instead of vanishing.
 */
function useUnhandledRejectionToast(): void {
  useEffect(() => {
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('[unhandled rejection]', event.reason);
      toast.error('Something went wrong', {
        description: 'An unexpected error occurred in the background.',
      });
    };
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);
}

export function Providers({ children }: { children: ReactNode }) {
  useUnhandledRejectionToast();

  // Created inside state, not at module scope: a module-level client would be
  // shared between requests on the server and leak one user's cache into the
  // next render.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // Retrying a 404 or a schema mismatch just delays the error state;
            // `isRetryable` is the same predicate the UI uses to decide whether
            // to offer a retry button.
            retry: (attempt, error) => attempt < 2 && isRetryable(error),
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <NuqsAdapter>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider delayDuration={200}>
            {children}
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </NuqsAdapter>
    </QueryClientProvider>
  );
}
