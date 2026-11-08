import { prisma } from './prisma';
import { messageQueue } from './queue';
import { jobIdFor } from './jobId';

const STALE_AFTER_MS = 60_000;
const PAGE_SIZE = 1000;

// Queues again every message still PENDING after a minute: one saved but never queued
// (crash or Redis error between the two writes). Messages still waiting in a long burst are
// PENDING too, but their job already exists under the same job id, so BullMQ skips them.
// shortcut: during a large burst every run re-checks the whole backlog; add a "queued" flag if that gets slow.
export const requeueStalePending = async (now = Date.now()) => {
  let checked = 0;
  let lastId: string | undefined;

  for (;;) {
    const page = await prisma.message.findMany({
      where: {
        status: 'PENDING',
        createdAt: { lt: new Date(now - STALE_AFTER_MS) },
        ...(lastId && { id: { gt: lastId } }),
      },
      select: { id: true, content: true, recipient: true },
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
    });
    if (page.length === 0) return checked;

    await messageQueue.addBulk(
      page.map((message) => ({ name: 'send', data: message, opts: { jobId: jobIdFor(message.id) } })),
    );
    checked += page.length;
    lastId = page[page.length - 1]!.id;
  }
};

export const startPendingSweep = (intervalMs = 60_000) => {
  let timer: NodeJS.Timeout;

  // A new run is scheduled only after the previous one ends, so runs never overlap.
  const run = async () => {
    try {
      await requeueStalePending();
    } catch (error) {
      console.error('Pending sweep failed', error);
    }
    timer = setTimeout(run, intervalMs);
  };

  timer = setTimeout(run, intervalMs);
  return () => clearTimeout(timer);
};
