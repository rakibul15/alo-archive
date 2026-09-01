import type { NextRequest } from 'next/server';
import { env } from '@/env';
import { archive } from '@/server/archive';

export const dynamic = 'force-dynamic';

/**
 * Processing progress, as server-sent events.
 *
 * The important decision here is what is *not* sent. Broadcasting a full
 * document object every time one changes status is fine at 200 documents and
 * catastrophic at 100,000 — a burst would be thousands of messages a second,
 * each triggering a cache write on the client.
 *
 * So the stream carries two things and nothing else:
 *
 *   summary  aggregate counts, at most once per tick
 *   changed  the *ids* that moved, batched per tick
 *
 * The client decides what to do with those ids, and in practice patches only
 * the rows it currently has on screen. Bandwidth is bounded by the number of
 * documents in flight, not by the size of the archive.
 *
 * There is no timer outside this handler: the ticker lives and dies with the
 * connection, so a closed tab leaves nothing running.
 */
export function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  let revision = archive.currentRevision;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          // Already closed by the runtime — nothing to do.
        }
      };

      const tick = () => {
        if (closed) return;
        try {
          archive.advance();
          const { rev, ids } = archive.changesSince(revision);
          revision = rev;

          send('summary', archive.summary());
          if (ids.length > 0) send('changed', { ids });
        } catch {
          close();
        }
      };

      const timer = setInterval(tick, env.SIM_TICK_MS);
      tick();

      request.signal.addEventListener('abort', close);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Stops nginx-style proxies from buffering the stream into silence.
      'X-Accel-Buffering': 'no',
    },
  });
}
