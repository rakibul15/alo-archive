'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDownIcon, ArrowUpIcon, FileSearchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { describeError } from '@/lib/api/errors';
import {
  type DocumentFilters,
  type DocumentSort,
  type DocumentSummary,
} from '@/lib/domain/document';
import { DOCUMENT_TYPE_LABELS } from '@/lib/domain/status-config';
import { documentListOptions } from '../api/queries';
import { useIsCompact } from '../hooks/use-media-query';
import { ConfidenceIndicator } from './confidence-indicator';
import { StatusBadge } from './status-badge';

/** Shared by the header and every row so the columns cannot drift apart. */
const COLUMN_TEMPLATE =
  'grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.5fr)_9rem_9.5rem_8rem] items-center gap-4 px-4';

const ROW_HEIGHT = 56;
const CARD_HEIGHT = 116;
/** Rows rendered beyond the viewport, so fast scrolling does not tear. */
const OVERSCAN = 8;

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});
const numberFormat = new Intl.NumberFormat('en-GB');

/**
 * `sort: null` marks a column the server cannot order by, so the header simply
 * has no button. Carrying the sort key in the column itself keeps that fact in
 * one place instead of in a boolean the type system cannot connect to the key.
 */
const COLUMNS: readonly {
  id: string;
  label: string;
  sort: DocumentSort | null;
}[] = [
  { id: 'document', label: 'Document', sort: 'fileName' },
  { id: 'person', label: 'Name / programme', sort: null },
  { id: 'status', label: 'Status', sort: 'status' },
  { id: 'confidence', label: 'Confidence', sort: 'confidence' },
  { id: 'uploaded', label: 'Uploaded', sort: 'uploadedAt' },
];

export function DocumentsTable({
  filters,
  toggleSort,
  isFiltered,
  onResetFilters,
  selectedId,
  onOpen,
}: {
  filters: DocumentFilters;
  toggleSort: (sort: DocumentSort) => void;
  isFiltered: boolean;
  onResetFilters: () => void;
  selectedId: string | null;
  onOpen: (id: string) => void;
}) {
  const isCompact = useIsCompact();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const {
    data,
    error,
    isPending,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery(documentListOptions(filters));

  const items: DocumentSummary[] =
    data?.pages.flatMap((page) => page.items) ?? [];
  const matchedCount = data?.pages[0]?.matchedCount ?? 0;
  const totalCount = data?.pages[0]?.totalCount ?? 0;

  const rowHeight = isCompact ? CARD_HEIGHT : ROW_HEIGHT;

  // React Compiler cannot memoize a component that consumes `useVirtualizer` —
  // the hook hands back fresh function identities every render by design, and
  // memoizing them would serve stale measurements. The compiler therefore skips
  // this component, which is the correct outcome rather than a problem to fix:
  // the component is already cheap because only ~30 rows exist in the DOM.
  // eslint-disable-next-line react-hooks/incompatible-library -- see above
  const virtualizer = useVirtualizer({
    // The extra row is the "loading more" sentinel at the bottom.
    count: hasNextPage ? items.length + 1 : items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: OVERSCAN,
  });

  // Crossing the breakpoint changes every row's height, so the cached
  // measurements have to be thrown away or the list scrolls to the wrong place.
  useEffect(() => {
    virtualizer.measure();
  }, [isCompact, virtualizer]);

  const virtualRows = virtualizer.getVirtualItems();

  useEffect(() => {
    const last = virtualRows.at(-1);
    if (!last) return;
    if (last.index >= items.length - 1 && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [
    virtualRows,
    items.length,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  ]);

  // Held arrow keys fire faster than React commits state, so the handler reads
  // the position from a ref rather than from the render closure — otherwise
  // every repeat computes from the same stale index and the cursor moves once.
  const activeIndexRef = useRef(0);

  const moveActive = useCallback(
    (next: number) => {
      const clamped = Math.min(
        Math.max(next, 0),
        Math.max(items.length - 1, 0),
      );
      activeIndexRef.current = clamped;
      setActiveIndex(clamped);
      virtualizer.scrollToIndex(clamped, { align: 'auto' });
    },
    [items.length, virtualizer],
  );

  // A new filter is a new result set; keeping the old cursor position would
  // scroll to an unrelated row.
  useEffect(() => {
    activeIndexRef.current = 0;
    setActiveIndex(0);
  }, [filters]);

  /**
   * Arrow-key navigation over a virtualised grid. Rows that are not rendered
   * cannot be focused, so movement goes through the virtualiser first and the
   * row picks up focus when it mounts.
   */
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const current = activeIndexRef.current;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveActive(current + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveActive(current - 1);
        break;
      case 'PageDown':
        event.preventDefault();
        moveActive(current + 10);
        break;
      case 'PageUp':
        event.preventDefault();
        moveActive(current - 10);
        break;
      case 'Home':
        event.preventDefault();
        moveActive(0);
        break;
      case 'End':
        event.preventDefault();
        moveActive(items.length - 1);
        break;
      case 'Enter':
      case ' ': {
        const row = items[current];
        if (row) {
          event.preventDefault();
          onOpen(row.id);
        }
        break;
      }
      default:
        break;
    }
  };

  if (isError) {
    const { title, detail } = describeError(error);
    return (
      <Empty className="flex-1">
        <EmptyHeader>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{detail}</EmptyDescription>
        </EmptyHeader>
        <Button
          variant="outline"
          onClick={() => {
            void refetch();
          }}
        >
          Try again
        </Button>
      </Empty>
    );
  }

  if (isPending) {
    return <TableSkeleton isCompact={isCompact} />;
  }

  if (items.length === 0) {
    return (
      <Empty className="flex-1">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileSearchIcon aria-hidden />
          </EmptyMedia>
          <EmptyTitle>No documents match these filters</EmptyTitle>
          <EmptyDescription>
            {totalCount > 0
              ? `The archive holds ${numberFormat.format(totalCount)} documents — none of them match.`
              : 'The archive is empty. Upload something to get started.'}
          </EmptyDescription>
        </EmptyHeader>
        {isFiltered ? (
          <Button variant="outline" onClick={onResetFilters}>
            Clear filters
          </Button>
        ) : null}
      </Empty>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!isCompact && (
        <div
          role="presentation"
          className={cn(
            COLUMN_TEMPLATE,
            'h-10 shrink-0 border-y border-border bg-muted/40 text-xs font-medium text-muted-foreground',
          )}
        >
          {COLUMNS.map((column) => {
            const sortKey = column.sort;
            if (sortKey === null) {
              return <span key={column.id}>{column.label}</span>;
            }
            const active = filters.sort === sortKey;
            const SortIcon =
              filters.dir === 'asc' ? ArrowUpIcon : ArrowDownIcon;
            return (
              <button
                key={column.id}
                type="button"
                onClick={() => {
                  toggleSort(sortKey);
                }}
                className="flex items-center gap-1 rounded-sm text-left hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-label={`Sort by ${column.label}`}
              >
                {column.label}
                {active ? (
                  <SortIcon aria-hidden className="size-3" />
                ) : (
                  <span aria-hidden className="size-3" />
                )}
              </button>
            );
          })}
        </div>
      )}

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto"
        tabIndex={0}
        role="grid"
        // Screen readers are told the size of the whole result set, not the
        // thirty-odd rows that happen to exist in the DOM.
        aria-rowcount={matchedCount}
        aria-colcount={COLUMNS.length}
        aria-label="Documents"
        onKeyDown={onKeyDown}
      >
        <div
          style={{ height: virtualizer.getTotalSize() }}
          className="relative w-full"
        >
          {virtualRows.map((virtualRow) => {
            const item = items[virtualRow.index];

            if (!item) {
              return (
                <div
                  key="loader"
                  className="absolute inset-x-0 flex items-center justify-center gap-2 text-sm text-muted-foreground"
                  style={{
                    height: virtualRow.size,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <Spinner className="size-4" />
                  Loading more…
                </div>
              );
            }

            return (
              <DocumentRow
                key={item.id}
                item={item}
                rowIndex={virtualRow.index}
                isCompact={isCompact}
                isActive={virtualRow.index === activeIndex}
                isSelected={item.id === selectedId}
                height={virtualRow.size}
                offset={virtualRow.start}
                onOpen={() => {
                  activeIndexRef.current = virtualRow.index;
                  setActiveIndex(virtualRow.index);
                  onOpen(item.id);
                }}
              />
            );
          })}
        </div>
      </div>

      <footer
        className="flex shrink-0 items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground"
        aria-live="polite"
      >
        <span>
          Showing {numberFormat.format(items.length)} of{' '}
          {numberFormat.format(matchedCount)}
          {matchedCount !== totalCount
            ? ` (filtered from ${numberFormat.format(totalCount)})`
            : ''}
        </span>
        {isFetchingNextPage ? <span>Loading more…</span> : null}
      </footer>
    </div>
  );
}

function DocumentRow({
  item,
  rowIndex,
  isCompact,
  isActive,
  isSelected,
  height,
  offset,
  onOpen,
}: {
  item: DocumentSummary;
  rowIndex: number;
  isCompact: boolean;
  isActive: boolean;
  isSelected: boolean;
  height: number;
  offset: number;
  onOpen: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Roving tabindex: exactly one row is in the tab order, and focus follows the
  // active index as rows mount and unmount underneath it.
  useEffect(() => {
    if (isActive && ref.current && document.activeElement !== ref.current) {
      const scroller = ref.current.closest('[role="grid"]');
      if (scroller && scroller.contains(document.activeElement)) {
        ref.current.focus({ preventScroll: true });
      }
    }
  }, [isActive]);

  const shared = cn(
    'absolute inset-x-0 cursor-pointer border-b border-border text-sm',
    'hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset',
    isSelected && 'bg-muted',
  );

  const common = {
    ref,
    role: 'row' as const,
    // +1 because aria-rowindex is 1-based and the header occupies row 1.
    'aria-rowindex': rowIndex + 2,
    'aria-selected': isSelected,
    tabIndex: isActive ? 0 : -1,
    style: { height, transform: `translateY(${offset}px)` },
    onClick: onOpen,
  };

  if (isCompact) {
    return (
      <div
        {...common}
        className={cn(shared, 'flex flex-col gap-1.5 px-4 py-3')}
      >
        <div className="flex items-start justify-between gap-2">
          <span role="gridcell" className="truncate font-medium">
            {item.personName ?? item.fileName}
          </span>
          <span role="gridcell">
            <StatusBadge status={item.status} />
          </span>
        </div>
        <span
          role="gridcell"
          className="truncate font-mono text-xs text-muted-foreground"
        >
          {item.fileName}
        </span>
        <div className="flex items-center justify-between gap-2">
          <span role="gridcell">
            <ConfidenceIndicator value={item.confidence} />
          </span>
          <span role="gridcell" className="text-xs text-muted-foreground">
            {dateFormat.format(new Date(item.uploadedAt))}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div {...common} className={cn(shared, COLUMN_TEMPLATE)}>
      <span role="gridcell" className="min-w-0">
        <span className="block truncate font-medium">{item.fileName}</span>
        <span className="block truncate font-mono text-xs text-muted-foreground">
          {item.id} · {DOCUMENT_TYPE_LABELS[item.documentType]}
        </span>
      </span>
      <span role="gridcell" className="min-w-0">
        <span className="block truncate">
          {item.personName ?? (
            <span className="text-muted-foreground">Not extracted</span>
          )}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {item.programName ?? '—'}
        </span>
      </span>
      <span role="gridcell">
        <StatusBadge status={item.status} />
      </span>
      <span role="gridcell">
        <ConfidenceIndicator value={item.confidence} />
      </span>
      <span role="gridcell" className="text-xs text-muted-foreground">
        {dateFormat.format(new Date(item.uploadedAt))}
      </span>
    </div>
  );
}

function TableSkeleton({ isCompact }: { isCompact: boolean }) {
  return (
    <div className="min-h-0 flex-1 space-y-px" aria-busy>
      <span className="sr-only">Loading documents</span>
      {Array.from({ length: 12 }, (_, index) => (
        <div
          key={index}
          className={cn(
            'border-b border-border',
            isCompact ? 'space-y-2 px-4 py-3' : COLUMN_TEMPLATE,
          )}
          style={{ height: isCompact ? CARD_HEIGHT : ROW_HEIGHT }}
        >
          <Skeleton className="h-4 w-full max-w-[16rem]" />
          {!isCompact && (
            <>
              <Skeleton className="h-4 w-full max-w-[10rem]" />
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </>
          )}
          {isCompact && <Skeleton className="h-4 w-40" />}
        </div>
      ))}
    </div>
  );
}
