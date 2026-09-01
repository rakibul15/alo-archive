import { Skeleton } from '@/components/ui/skeleton';

/**
 * Suspense fallback for the documents view.
 *
 * Required rather than decorative: the view reads its filters from the URL via
 * `useSearchParams`, which opts the subtree out of static prerendering. Without
 * a boundary the production build fails outright — `next dev` renders it
 * happily, so only `npm run build` catches it.
 */
export function DocumentsViewSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4" aria-busy>
      <span className="sr-only">Loading documents</span>

      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-full sm:max-w-xs" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-44" />
      </div>

      <div className="min-h-0 flex-1 space-y-px">
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: 10 }, (_, index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}
