import { DEFAULT_POLICY } from '../src/model/policy';
import { SCENARIOS, type Scenario, type Step } from '../src/model/scenarios';

const byId = (id: string): Scenario => {
  const scenario = SCENARIOS.find((s) => s.id === id);
  if (!scenario) throw new Error(`missing scenario ${id}`);
  return scenario;
};

const lastStep = (steps: readonly Step[]): Step => {
  const step = steps.at(-1);
  if (!step) throw new Error('no steps');
  return step;
};

describe('SCENARIOS', () => {
  test('five scenarios with unique ids, in the spec order', () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual([
      'fifo',
      'rate-limit',
      'retries',
      'duplicate',
      'restart',
    ]);
  });

  describe.each(SCENARIOS.map((s) => [s.id, s] as const))('%s', (_id, scenario) => {
    test('has steps with narration and a clock that never goes back', () => {
      expect(scenario.steps.length).toBeGreaterThan(1);
      scenario.steps.forEach((step, i) => {
        expect(step.narration.length).toBeGreaterThan(0);
        if (i > 0) expect(step.clockMs).toBeGreaterThanOrEqual(scenario.steps[i - 1]?.clockMs ?? 0);
      });
    });

    test('every status matches where the message is in the queue', () => {
      for (const step of scenario.steps) {
        const delayed = step.delayed.map((job) => job.id);
        const queued = [...step.waiting, ...delayed];
        expect(new Set(queued).size).toBe(queued.length);
        for (const id of queued) expect(step.rows[id]).toBeDefined();

        for (const [id, row] of Object.entries(step.rows)) {
          const where = { id, status: row.status };
          const waits = step.waiting.includes(id);
          const isDelayed = delayed.includes(id);
          if (row.status === 'SENT')
            expect({ ...where, queued: waits || isDelayed }).toEqual({ ...where, queued: false });
          // The one exception: saved, then the process crashed before the job was added.
          if (row.status === 'PENDING' && !(scenario.id === 'restart' && id === 'm3'))
            expect({ ...where, waits }).toEqual({ ...where, waits: true });
          if (row.status === 'RETRYING')
            expect({ ...where, waits }).toEqual({ ...where, waits: false });
          if (row.status === 'FAILED')
            expect({
              ...where,
              delayedOrDone: isDelayed || row.attempts === DEFAULT_POLICY.attempts,
            }).toEqual({
              ...where,
              delayedOrDone: true,
            });
        }
      }
    });

    test('no window exceeds its max except the step that shows the 429', () => {
      for (const step of scenario.steps) {
        expect(step.workerWindow).toBeLessThanOrEqual(scenario.limit.max);
        if (step.providerWindow > scenario.limit.max) {
          expect(step.hop).toBe('provider');
          expect(step.call?.status).toBe(429);
        }
      }
    });

    test('backoff delays equal 2^(n-1) × the default backoff', () => {
      const seen = new Set<string>();
      for (const step of scenario.steps) {
        for (const job of step.delayed) {
          const key = `${job.id}#${job.retry}`;
          if (seen.has(key)) continue;
          seen.add(key);
          expect(job.dueMs - step.clockMs).toBe(
            2 ** (job.retry - 1) * DEFAULT_POLICY.backoff.delayMs,
          );
        }
      }
    });

    test('attempts never exceed the default attempts', () => {
      for (const step of scenario.steps) {
        for (const row of Object.values(step.rows)) {
          expect(row.attempts).toBeLessThanOrEqual(DEFAULT_POLICY.attempts);
        }
        for (const job of step.delayed) {
          expect(job.retry).toBeLessThan(DEFAULT_POLICY.attempts);
        }
      }
    });
  });

  test('fifo: messages are delivered in the order they arrived', () => {
    const delivered = byId('fifo')
      .steps.filter((s) => s.hop === 'provider' && s.call?.status === 200)
      .map((s) => s.call?.id);
    expect(delivered).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6']);
  });

  test('rate-limit: one 429, the message is retried and ends SENT', () => {
    const steps = byId('rate-limit').steps;
    expect(steps.filter((s) => s.call?.status === 429)).toHaveLength(1);
    expect(Object.values(lastStep(steps).rows).every((row) => row.status === 'SENT')).toBe(true);
  });

  test('retries: 503 on every attempt shows FAILED between tries and ends FAILED after all attempts', () => {
    const steps = byId('retries').steps;
    const dues = steps.flatMap((s) => s.delayed.map((job) => job.dueMs - s.clockMs));
    expect([...new Set(dues)]).toEqual([1000, 2000, 4000, 8000]);
    expect(steps.some((s) => s.rows.m1?.status === 'FAILED' && s.delayed.length > 0)).toBe(true);
    const last = lastStep(steps);
    expect(last.rows.m1).toEqual({
      status: 'FAILED',
      retries: DEFAULT_POLICY.attempts,
      attempts: DEFAULT_POLICY.attempts,
    });
    expect(last.waiting).toEqual([]);
    expect(last.delayed).toEqual([]);
  });

  test('duplicate: answered 200 at intake, never enqueued twice, delivered once', () => {
    const steps = byId('duplicate').steps;
    const intakes = steps
      .filter((s) => s.hop === 'intake' && s.call?.id === 'm1')
      .map((s) => s.call?.status);
    expect(intakes).toEqual([202, 200, 200]);
    const deliveries = steps.filter(
      (s) => s.hop === 'provider' && s.call?.id === 'm1' && s.call.status === 200,
    );
    expect(deliveries).toHaveLength(1);
  });

  test('restart: the queued message is sent after the restart and the unqueued one stays PENDING', () => {
    const last = lastStep(byId('restart').steps);
    expect(last.rows.m2?.status).toBe('SENT');
    expect(last.rows.m3?.status).toBe('PENDING');
    expect(last.waiting).not.toContain('m3');
  });
});
