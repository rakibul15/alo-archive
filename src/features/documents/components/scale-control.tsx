'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { describeError } from '@/lib/api/errors';
import { scaleArchive } from '../api/mutations';
import { documentKeys } from '../api/keys';

const numberFormat = new Intl.NumberFormat('en-GB');

/**
 * Nobody assessing this is going to drop 100,000 files onto a dropzone, so the
 * archive has to be able to put itself into that state on demand. Without this
 * the scale claims in the README would be unverifiable.
 */
export function ScaleControl() {
  const queryClient = useQueryClient();

  const { mutate, isPending } = useMutation({
    mutationFn: () => scaleArchive(),
    onSuccess: (result) => {
      toast.success(
        `Archive now holds ${numberFormat.format(result.size)} documents`,
        { description: `Index built in ${result.generatedInMs} ms.` },
      );
      void queryClient.invalidateQueries({ queryKey: documentKeys.all });
    },
    onError: (error) => {
      const { title, detail } = describeError(error);
      toast.error(title, { description: detail });
    },
  });

  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <h2 className="text-sm font-medium">Simulate a full archive</h2>
        <p className="text-sm text-muted-foreground">
          Expands the corpus to 100,000 documents so list performance can be
          judged at the size the brief describes.
        </p>
      </div>
      <Button
        onClick={() => {
          mutate();
        }}
        disabled={isPending}
        className="shrink-0"
      >
        {isPending ? <Spinner /> : null}
        Load 100,000 documents
      </Button>
    </Card>
  );
}
