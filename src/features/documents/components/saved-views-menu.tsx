'use client';

import { useId, useState } from 'react';
import { BookmarkIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import type { DocumentFilters } from '@/lib/domain/document';
import { useSavedViews } from '../hooks/use-saved-views';

/**
 * Names and reuses a filter combination.
 *
 * There's nothing server-side to save to — no accounts, no per-user state
 * (see ASSUMPTIONS.md) — so this is a `localStorage` list, scoped to this
 * browser. Saving already lives in the URL (filters are query params), so a
 * saved view is really just a name for a URL an operator would otherwise
 * have had to bookmark or paste into a message themselves.
 */
export function SavedViewsMenu({
  filters,
  isFiltered,
  onApply,
}: {
  filters: DocumentFilters;
  isFiltered: boolean;
  onApply: (filters: DocumentFilters) => void;
}) {
  const { views, save, remove } = useSavedViews();
  const [isSaveOpen, setIsSaveOpen] = useState(false);
  const [name, setName] = useState('');
  const nameId = useId();

  const handleSave = () => {
    if (name.trim() === '') return;
    save(name, filters);
    setName('');
    setIsSaveOpen(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <BookmarkIcon aria-hidden />
            Views
            {views.length > 0 ? ` (${views.length})` : ''}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuItem
            disabled={!isFiltered}
            onSelect={(event) => {
              // The dialog needs to survive this menu closing; letting Radix
              // close the dropdown on its own timing (rather than
              // preventing it) and opening the dialog from state is what
              // keeps the two from fighting over focus.
              event.preventDefault();
              setIsSaveOpen(true);
            }}
          >
            <BookmarkIcon aria-hidden />
            Save current view…
          </DropdownMenuItem>

          {views.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Saved views</DropdownMenuLabel>
              {views.map((view) => (
                <div key={view.id} className="flex items-center gap-1 pr-1">
                  <DropdownMenuItem
                    className="flex-1"
                    onSelect={() => {
                      onApply(view.filters);
                    }}
                  >
                    <span className="truncate">{view.name}</span>
                  </DropdownMenuItem>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0"
                    onClick={(event) => {
                      // A sibling of the menu item, not a descendant, so this
                      // is a plain click handler rather than an `onSelect` —
                      // deleting a view should not also apply it.
                      event.stopPropagation();
                      remove(view.id);
                    }}
                  >
                    <Trash2Icon aria-hidden className="size-3.5" />
                    <span className="sr-only">Delete “{view.name}”</span>
                  </Button>
                </div>
              ))}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isSaveOpen} onOpenChange={setIsSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save this view</DialogTitle>
            <DialogDescription>
              Saves the current filters, search and sort. Not the selection, and
              not which document is open.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label htmlFor={nameId} className="sr-only">
              View name
            </label>
            <Input
              id={nameId}
              autoFocus
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
              placeholder="e.g. Needs review — Kurigram"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleSave();
                }
              }}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsSaveOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={name.trim() === ''}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
