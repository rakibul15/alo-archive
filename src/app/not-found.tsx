import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Page not found</EmptyTitle>
          <EmptyDescription>
            There&apos;s nothing at this address.
          </EmptyDescription>
        </EmptyHeader>
        <Button asChild>
          <Link href="/">Back to overview</Link>
        </Button>
      </Empty>
    </main>
  );
}
