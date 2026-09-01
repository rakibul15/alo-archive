'use client';

import { ErrorBoundary } from 'react-error-boundary';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  useDocumentFilters,
  useSelectedDocument,
} from '../hooks/use-document-filters';
import { useArchiveStream } from '../hooks/use-archive-stream';
import { DocumentDetailSheet } from './document-detail-sheet';
import { DocumentsFilters } from './documents-filters';
import { DocumentsTable } from './documents-table';

export function DocumentsView() {
  const { filters, isFiltered, setFilters, toggleSort, reset } =
    useDocumentFilters();
  const [selectedId, setSelectedId] = useSelectedDocument();

  useArchiveStream();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <DocumentsFilters
        filters={filters}
        isFiltered={isFiltered}
        setFilters={setFilters}
        reset={reset}
      />

      {/*
        The table is wrapped on its own rather than the page being wrapped as a
        whole: if the virtualiser throws, the filters above it stay usable and
        the operator can change what they asked for instead of losing the
        screen. `QueryErrorResetBoundary` lets "Try again" actually retry the
        query rather than just re-rendering the same failure.
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
              filters={filters}
              toggleSort={toggleSort}
              isFiltered={isFiltered}
              onResetFilters={reset}
              selectedId={selectedId}
              onOpen={(id) => {
                void setSelectedId(id);
              }}
            />
          </ErrorBoundary>
        )}
      </QueryErrorResetBoundary>

      <DocumentDetailSheet
        documentId={selectedId}
        onClose={() => {
          void setSelectedId(null);
        }}
      />
    </div>
  );
}
