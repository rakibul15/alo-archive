'use client';

import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import type { DocumentSummary } from '@/lib/domain/document';
import { documentListOptions } from '../api/queries';
import {
  useDocumentFilters,
  useSelectedDocument,
} from '../hooks/use-document-filters';
import { useArchiveStream } from '../hooks/use-archive-stream';
import { useRetryDocuments } from '../hooks/use-document-mutations';
import { useSelection } from '../hooks/use-selection';
import { BulkActionsBar } from './bulk-actions-bar';
import { DocumentDetailSheet } from './document-detail-sheet';
import { DocumentsFilters } from './documents-filters';
import { DocumentsTable } from './documents-table';

/**
 * Orchestrator. The list query lives here rather than inside the table so the
 * bulk action bar, the table and the detail panel all read the same page of
 * data instead of each holding their own copy of it.
 */
export function DocumentsView() {
  const { filters, isFiltered, setFilters, toggleSort, reset } =
    useDocumentFilters();
  const [selectedId, setSelectedId] = useSelectedDocument();

  useArchiveStream();

  const query = useInfiniteQuery(documentListOptions(filters));

  const items = useMemo<DocumentSummary[]>(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );
  const matchedCount = query.data?.pages[0]?.matchedCount ?? 0;
  const totalCount = query.data?.pages[0]?.totalCount ?? 0;

  const selection = useSelection(filters, matchedCount);
  const retry = useRetryDocuments();

  const onRetrySelection = () => {
    const request = selection.request;
    retry.mutate(
      request.kind === 'ids'
        ? { kind: 'ids', ids: request.ids }
        : { kind: 'filter', filter: filters, except: request.except },
    );
    selection.clear();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <DocumentsFilters
        filters={filters}
        isFiltered={isFiltered}
        setFilters={setFilters}
        reset={reset}
      />

      <BulkActionsBar
        count={selection.count}
        matchedCount={matchedCount}
        isAllMatching={selection.selection.mode === 'exclude'}
        isRetrying={retry.isPending}
        onRetry={onRetrySelection}
        onSelectAllMatching={() => {
          selection.setAllMatching();
        }}
        onClear={selection.clear}
      />

      {/*
        The table is wrapped on its own rather than the page as a whole: if the
        virtualiser throws, the filters above stay usable and the operator can
        change what they asked for instead of losing the screen.
        `QueryErrorResetBoundary` is what lets "Reload" actually retry the query
        rather than re-render the same failure.
      */}
      <QueryErrorResetBoundary>
        {({ reset: resetQueries }) => (
          <ErrorBoundary
            onReset={resetQueries}
            fallbackRender={({ resetErrorBoundary }) => (
              <Empty className="flex-1">
                <EmptyHeader>
                  <EmptyTitle>The document list stopped working</EmptyTitle>
                  <EmptyDescription>
                    This is a bug rather than a failed document. Your filters
                    are still applied.
                  </EmptyDescription>
                </EmptyHeader>
                <Button variant="outline" onClick={resetErrorBoundary}>
                  Reload the list
                </Button>
              </Empty>
            )}
          >
            <DocumentsTable
              query={query}
              items={items}
              matchedCount={matchedCount}
              totalCount={totalCount}
              filters={filters}
              toggleSort={toggleSort}
              isFiltered={isFiltered}
              onResetFilters={reset}
              selectedId={selectedId}
              onOpen={(id) => {
                void setSelectedId(id);
              }}
              selection={selection}
            />
          </ErrorBoundary>
        )}
      </QueryErrorResetBoundary>

      <DocumentDetailSheet
        documentId={selectedId}
        orderedIds={items.map((item) => item.id)}
        onNavigate={(id) => {
          void setSelectedId(id);
        }}
        onClose={() => {
          void setSelectedId(null);
        }}
      />
    </div>
  );
}
