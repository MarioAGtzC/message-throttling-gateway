import type { Limit } from './policy';

/** Message status in PostgreSQL (service-b/prisma/schema.prisma). */
export type Status = 'PENDING' | 'RETRYING' | 'SENT' | 'FAILED';

/** Diagram hops: Mock A → Service B, Service B's queue → worker, worker → Mock C. */
export type Hop = 'intake' | 'queue' | 'provider';

export interface Row {
  status: Status;
  /** The `retries` column: +1 on every 429 or other provider failure. */
  retries: number;
  /** Tries the queue has started for this message, the current one included. */
  attempts: number;
}

export interface DelayedJob {
  id: string;
  /** Clock time when the job goes back to the end of the waiting list. */
  dueMs: number;
  /** Which retry this wait comes before (1 = the first retry). */
  retry: number;
}

export interface Step {
  clockMs: number;
  narration: string;
  /** Hop highlighted in the diagram, or null when nothing travels. */
  hop: Hop | null;
  /** HTTP answer on the highlighted hop, when the step shows one request. */
  call?: { id: string; status: number };
  /** Job ids in the waiting list, first in line first. */
  waiting: string[];
  delayed: DelayedJob[];
  /** Requests counted in the worker limiter's current window. */
  workerWindow: number;
  /** Requests counted in Mock C's current window. */
  providerWindow: number;
  /** Rows in PostgreSQL, by message id. */
  rows: Record<string, Row>;
}

export interface Scenario {
  id: string;
  title: string;
  /** Scaled-down limit used by both windows so a scenario fits in a few steps. */
  limit: Limit;
  steps: Step[];
}

type StepChange = Pick<Step, 'clockMs' | 'narration'> &
  Partial<
    Pick<Step, 'hop' | 'call' | 'waiting' | 'delayed' | 'workerWindow' | 'providerWindow'>
  > & {
    rows?: Record<string, Partial<Row>>;
  };

/** Each step lists only what changed; hop and call apply to that step alone. */
function steps(changes: StepChange[]): Step[] {
  let prev: Step = {
    clockMs: 0,
    narration: '',
    hop: null,
    waiting: [],
    delayed: [],
    workerWindow: 0,
    providerWindow: 0,
    rows: {},
  };
  return changes.map(({ rows = {}, hop = null, call, ...change }) => {
    const next: Step = { ...prev, ...change, hop, rows: { ...prev.rows } };
    delete next.call;
    if (call) next.call = call;
    for (const [id, row] of Object.entries(rows)) {
      next.rows[id] = { status: 'PENDING', retries: 0, attempts: 0, ...prev.rows[id], ...row };
    }
    return (prev = next);
  });
}

const LIMIT: Limit = { max: 3, windowMs: 1000 };

// Clock values, backoff (1000 ms × 2^(n-1)) and attempts (5) follow service-b/src/config/queue.ts and worker.ts.
export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'fifo',
    title: 'Normal delivery in FIFO order',
    limit: LIMIT,
    steps: steps([
      {
        clockMs: 0,
        narration:
          'Mock A sends m1 to m6. Service B saves each one as PENDING, adds it to the queue and answers 202.',
        hop: 'intake',
        waiting: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'],
        rows: { m1: {}, m2: {}, m3: {}, m4: {}, m5: {}, m6: {} },
      },
      {
        clockMs: 0,
        narration:
          'The worker takes m1, the first in line, and marks it RETRYING. It does this on every try, the first one included.',
        hop: 'queue',
        waiting: ['m2', 'm3', 'm4', 'm5', 'm6'],
        workerWindow: 1,
        rows: { m1: { status: 'RETRYING', attempts: 1 } },
      },
      {
        clockMs: 0,
        narration: 'Mock C answers 200 and m1 is marked SENT.',
        hop: 'provider',
        call: { id: 'm1', status: 200 },
        providerWindow: 1,
        rows: { m1: { status: 'SENT' } },
      },
      {
        clockMs: 10,
        narration: 'm2 goes the same way: taken, sent, 200, SENT.',
        hop: 'provider',
        call: { id: 'm2', status: 200 },
        waiting: ['m3', 'm4', 'm5', 'm6'],
        workerWindow: 2,
        providerWindow: 2,
        rows: { m2: { status: 'SENT', attempts: 1 } },
      },
      {
        clockMs: 20,
        narration:
          'm3 is SENT. The worker window is full (3 of 3), so m4 waits until it resets even though it is first in line.',
        hop: 'provider',
        call: { id: 'm3', status: 200 },
        waiting: ['m4', 'm5', 'm6'],
        workerWindow: 3,
        providerWindow: 3,
        rows: { m3: { status: 'SENT', attempts: 1 } },
      },
      {
        clockMs: 1000,
        narration: 'At 1 s both windows reset. m4 is taken and SENT.',
        hop: 'provider',
        call: { id: 'm4', status: 200 },
        waiting: ['m5', 'm6'],
        workerWindow: 1,
        providerWindow: 1,
        rows: { m4: { status: 'SENT', attempts: 1 } },
      },
      {
        clockMs: 1010,
        narration: 'm5 is SENT.',
        hop: 'provider',
        call: { id: 'm5', status: 200 },
        waiting: ['m6'],
        workerWindow: 2,
        providerWindow: 2,
        rows: { m5: { status: 'SENT', attempts: 1 } },
      },
      {
        clockMs: 1020,
        narration:
          'm6 is SENT. Six messages were delivered in the order they arrived, in two windows: ceil(6 / 3) × 1 s, with no 429.',
        hop: 'provider',
        call: { id: 'm6', status: 200 },
        waiting: [],
        workerWindow: 3,
        providerWindow: 3,
        rows: { m6: { status: 'SENT', attempts: 1 } },
      },
    ]),
  },
  {
    id: 'rate-limit',
    title: '429 at a window edge',
    limit: LIMIT,
    steps: steps([
      {
        clockMs: 0,
        narration: 'Mock A sends m1 to m4. All four are saved as PENDING and queued.',
        hop: 'intake',
        waiting: ['m1', 'm2', 'm3', 'm4'],
        rows: { m1: {}, m2: {}, m3: {}, m4: {} },
      },
      {
        clockMs: 50,
        narration:
          "The worker takes m1 at 0 ms, which opens its window until 1000 ms. The request reaches Mock C at 50 ms, so Mock C's window runs until 1050 ms. 200, SENT.",
        hop: 'provider',
        call: { id: 'm1', status: 200 },
        waiting: ['m2', 'm3', 'm4'],
        workerWindow: 1,
        providerWindow: 1,
        rows: { m1: { status: 'SENT', attempts: 1 } },
      },
      {
        clockMs: 70,
        narration: 'm2 is SENT.',
        hop: 'provider',
        call: { id: 'm2', status: 200 },
        waiting: ['m3', 'm4'],
        workerWindow: 2,
        providerWindow: 2,
        rows: { m2: { status: 'SENT', attempts: 1 } },
      },
      {
        clockMs: 90,
        narration: 'm3 is SENT. Both windows are full: the worker waits until 1000 ms.',
        hop: 'provider',
        call: { id: 'm3', status: 200 },
        waiting: ['m4'],
        workerWindow: 3,
        providerWindow: 3,
        rows: { m3: { status: 'SENT', attempts: 1 } },
      },
      {
        clockMs: 1020,
        narration:
          "The worker window resets at 1000 ms and m4 is taken, but Mock C's window still has 30 ms left and already counts 3. Mock C answers 429. The worker adds a retry, m4 stays RETRYING and waits 1 s.",
        hop: 'provider',
        call: { id: 'm4', status: 429 },
        waiting: [],
        delayed: [{ id: 'm4', dueMs: 2020, retry: 1 }],
        workerWindow: 1,
        providerWindow: 4,
        rows: { m4: { status: 'RETRYING', retries: 1, attempts: 1 } },
      },
      {
        clockMs: 2020,
        narration:
          'The wait is over: m4 goes back to the end of the waiting list and the worker takes it right away in a new window.',
        hop: 'queue',
        delayed: [],
        workerWindow: 1,
        providerWindow: 0,
        rows: { m4: { attempts: 2 } },
      },
      {
        clockMs: 2040,
        narration:
          "Mock C's window reset at 1050 ms, so this request opens a new one. 200, m4 is SENT with 1 retry recorded.",
        hop: 'provider',
        call: { id: 'm4', status: 200 },
        providerWindow: 1,
        rows: { m4: { status: 'SENT' } },
      },
    ]),
  },
  {
    id: 'retries',
    title: '503 retried until FAILED',
    limit: LIMIT,
    steps: steps([
      {
        clockMs: 0,
        narration:
          'Mock A sends m1. It is saved as PENDING and queued. Mock C is down and answers 503 to everything.',
        hop: 'intake',
        waiting: ['m1'],
        rows: { m1: {} },
      },
      {
        clockMs: 0,
        narration: 'Try 1 of 5: the worker takes m1 and marks it RETRYING.',
        hop: 'queue',
        waiting: [],
        workerWindow: 1,
        rows: { m1: { status: 'RETRYING', attempts: 1 } },
      },
      {
        clockMs: 0,
        narration:
          'Mock C answers 503. The worker marks m1 FAILED and adds a retry, but the job still has tries left: it waits 1 s.',
        hop: 'provider',
        call: { id: 'm1', status: 503 },
        delayed: [{ id: 'm1', dueMs: 1000, retry: 1 }],
        providerWindow: 1,
        rows: { m1: { status: 'FAILED', retries: 1 } },
      },
      {
        clockMs: 1000,
        narration: 'Try 2 of 5: m1 is back in line, taken and marked RETRYING again.',
        hop: 'queue',
        delayed: [],
        workerWindow: 1,
        providerWindow: 0,
        rows: { m1: { status: 'RETRYING', attempts: 2 } },
      },
      {
        clockMs: 1000,
        narration: '503 again: FAILED, 2 retries. The wait doubles to 2 s.',
        hop: 'provider',
        call: { id: 'm1', status: 503 },
        delayed: [{ id: 'm1', dueMs: 3000, retry: 2 }],
        providerWindow: 1,
        rows: { m1: { status: 'FAILED', retries: 2 } },
      },
      {
        clockMs: 3000,
        narration: 'Try 3 of 5: RETRYING.',
        hop: 'queue',
        delayed: [],
        workerWindow: 1,
        providerWindow: 0,
        rows: { m1: { status: 'RETRYING', attempts: 3 } },
      },
      {
        clockMs: 3000,
        narration: '503: FAILED, 3 retries. Next wait: 4 s.',
        hop: 'provider',
        call: { id: 'm1', status: 503 },
        delayed: [{ id: 'm1', dueMs: 7000, retry: 3 }],
        providerWindow: 1,
        rows: { m1: { status: 'FAILED', retries: 3 } },
      },
      {
        clockMs: 7000,
        narration: 'Try 4 of 5: RETRYING.',
        hop: 'queue',
        delayed: [],
        workerWindow: 1,
        providerWindow: 0,
        rows: { m1: { status: 'RETRYING', attempts: 4 } },
      },
      {
        clockMs: 7000,
        narration: '503: FAILED, 4 retries. Next wait: 8 s.',
        hop: 'provider',
        call: { id: 'm1', status: 503 },
        delayed: [{ id: 'm1', dueMs: 15000, retry: 4 }],
        providerWindow: 1,
        rows: { m1: { status: 'FAILED', retries: 4 } },
      },
      {
        clockMs: 15000,
        narration: 'Try 5 of 5, the last one: RETRYING.',
        hop: 'queue',
        delayed: [],
        workerWindow: 1,
        providerWindow: 0,
        rows: { m1: { status: 'RETRYING', attempts: 5 } },
      },
      {
        clockMs: 15000,
        narration:
          "503 on the last try. No tries are left, so the job leaves the queue and the worker's failed handler sets FAILED for good, 15 s after the first try.",
        hop: 'provider',
        call: { id: 'm1', status: 503 },
        providerWindow: 1,
        rows: { m1: { status: 'FAILED', retries: 5 } },
      },
    ]),
  },
  {
    id: 'duplicate',
    title: 'Duplicate id',
    limit: LIMIT,
    steps: steps([
      {
        clockMs: 0,
        narration: 'Mock A sends m1. It is new: saved as PENDING, queued, 202.',
        hop: 'intake',
        call: { id: 'm1', status: 202 },
        waiting: ['m1'],
        rows: { m1: {} },
      },
      {
        clockMs: 5,
        narration:
          'Mock A sends m1 again. Service B finds the row and answers 200 "already received": nothing is saved or queued.',
        hop: 'intake',
        call: { id: 'm1', status: 200 },
      },
      {
        clockMs: 10,
        narration: 'The worker takes the only m1 job and marks it RETRYING.',
        hop: 'queue',
        waiting: [],
        workerWindow: 1,
        rows: { m1: { status: 'RETRYING', attempts: 1 } },
      },
      {
        clockMs: 10,
        narration: 'Mock C answers 200 and m1 is SENT.',
        hop: 'provider',
        call: { id: 'm1', status: 200 },
        providerWindow: 1,
        rows: { m1: { status: 'SENT' } },
      },
      {
        clockMs: 500,
        narration:
          'A third copy arrives after delivery: 200 again, nothing changes. Three requests, one delivery. Two copies at the very same instant are the exception: both miss the lookup and the second one gets 500 (see known limitations).',
        hop: 'intake',
        call: { id: 'm1', status: 200 },
      },
    ]),
  },
  {
    id: 'restart',
    title: 'Restart with a message stuck in PENDING',
    limit: LIMIT,
    steps: steps([
      {
        clockMs: 0,
        narration: 'Mock A sends m1: saved as PENDING, queued, 202.',
        hop: 'intake',
        call: { id: 'm1', status: 202 },
        waiting: ['m1'],
        rows: { m1: {} },
      },
      {
        clockMs: 0,
        narration: 'The worker takes m1, Mock C answers 200, m1 is SENT.',
        hop: 'provider',
        call: { id: 'm1', status: 200 },
        waiting: [],
        workerWindow: 1,
        providerWindow: 1,
        rows: { m1: { status: 'SENT', attempts: 1 } },
      },
      {
        clockMs: 10,
        narration: 'Mock A sends m2: saved as PENDING, queued, 202.',
        hop: 'intake',
        call: { id: 'm2', status: 202 },
        waiting: ['m2'],
        rows: { m2: {} },
      },
      {
        clockMs: 10,
        narration:
          'Mock A sends m3 at the same moment. The row is saved, then the process crashes before the job is added to the queue. The API and the worker go down together; Mock A gets no answer.',
        hop: 'intake',
        rows: { m3: {} },
      },
      {
        clockMs: 3000,
        narration:
          'Service B restarts. PostgreSQL kept the rows and Redis kept the queue, so the worker finds m2 waiting, takes it and marks it RETRYING.',
        hop: 'queue',
        waiting: [],
        workerWindow: 1,
        providerWindow: 0,
        rows: { m2: { status: 'RETRYING', attempts: 1 } },
      },
      {
        clockMs: 3000,
        narration: 'Mock C answers 200 and m2 is SENT.',
        hop: 'provider',
        call: { id: 'm2', status: 200 },
        providerWindow: 1,
        rows: { m2: { status: 'SENT' } },
      },
      {
        clockMs: 3500,
        narration:
          'Mock A sends m3 again. Service B finds the row and answers 200 "already received" without queuing it. m3 has no job and nothing re-queues it: it stays PENDING forever (see known limitations).',
        hop: 'intake',
        call: { id: 'm3', status: 200 },
      },
    ]),
  },
];
