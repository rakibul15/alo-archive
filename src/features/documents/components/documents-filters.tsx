'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ListFilterIcon, SearchIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  confidenceFilterSchema,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  type ConfidenceFilter,
} from '@/lib/domain/document';
import {
  DOCUMENT_TYPE_LABELS,
  STATUS_CONFIG,
} from '@/lib/domain/status-config';
import { StatusBadge } from './status-badge';
import type { useDocumentFilters } from '../hooks/use-document-filters';

/** Long enough to stop typing mid-word costing a request, short enough to feel live. */
const SEARCH_DEBOUNCE_MS = 300;

const CONFIDENCE_LABELS: Record<ConfidenceFilter, string> = {
  any: 'Any confidence',
  high: 'High (90%+)',
  medium: 'Medium (75–89%)',
  low: 'Low (under 75%)',
};

type FilterApi = ReturnType<typeof useDocumentFilters>;

export function DocumentsFilters({
  filters,
  isFiltered,
  setFilters,
  reset,
}: Pick<FilterApi, 'filters' | 'isFiltered' | 'setFilters' | 'reset'>) {
  const searchId = useId();

  // The input is uncontrolled by the URL while the user is typing: pushing
  // every keystroke into the address bar would spam history and refetch on
  // every character. The URL is the source of truth, the local value is a
  // buffer in front of it.
  const [draft, setDraft] = useState(filters.q);
  const committed = useRef(filters.q);

  useEffect(() => {
    if (filters.q !== committed.current) {
      committed.current = filters.q;
      setDraft(filters.q);
    }
  }, [filters.q]);

  useEffect(() => {
    if (draft === committed.current) return;
    const timer = setTimeout(() => {
      committed.current = draft;
      void setFilters({ q: draft === '' ? null : draft });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [draft, setFilters]);

  const toggleValue = <T extends string>(
    current: readonly T[],
    value: T,
  ): T[] | null => {
    const next = current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value];
    return next.length === 0 ? null : next;
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1 sm:max-w-xs">
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <label htmlFor={searchId} className="sr-only">
          Search documents by name, location, programme or file name
        </label>
        <Input
          id={searchId}
          type="search"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          placeholder="Search name, location, file…"
          className="pl-8"
        />
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <ListFilterIcon aria-hidden />
            Status
            {filters.status.length > 0 ? ` (${filters.status.length})` : ''}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuLabel>Processing status</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {DOCUMENT_STATUSES.map((status) => (
            <DropdownMenuCheckboxItem
              key={status}
              checked={filters.status.includes(status)}
              onCheckedChange={() => {
                void setFilters({
                  status: toggleValue(filters.status, status),
                });
              }}
            >
              {STATUS_CONFIG[status].label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <ListFilterIcon aria-hidden />
            Type
            {filters.type.length > 0 ? ` (${filters.type.length})` : ''}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuLabel>Document type</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {DOCUMENT_TYPES.map((type) => (
            <DropdownMenuCheckboxItem
              key={type}
              checked={filters.type.includes(type)}
              onCheckedChange={() => {
                void setFilters({ type: toggleValue(filters.type, type) });
              }}
            >
              {DOCUMENT_TYPE_LABELS[type]}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Select
        value={filters.confidence}
        onValueChange={(value) => {
          // Radix hands back a plain string; narrow it through the schema
          // rather than asserting, so a renamed band fails loudly here.
          const parsed = confidenceFilterSchema.safeParse(value);
          void setFilters({
            confidence:
              !parsed.success || parsed.data === 'any' ? null : parsed.data,
          });
        }}
      >
        <SelectTrigger size="sm" className="w-[11rem]" aria-label="Confidence">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(CONFIDENCE_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isFiltered ? (
        <Button variant="ghost" size="sm" onClick={reset}>
          <XIcon aria-hidden />
          Clear
        </Button>
      ) : null}

      {filters.status.length > 0 ? (
        <ul className="flex w-full flex-wrap gap-1.5 sm:w-auto">
          {filters.status.map((status) => (
            <li key={status}>
              <StatusBadge status={status} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
