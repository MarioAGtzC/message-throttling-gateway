export interface Limit {
  /** Requests allowed per window. */
  max: number;
  windowMs: number;
}

export interface Policy {
  /** Burst size Mock A sends by default. */
  messages: number;
  /** BullMQ worker limiter (service-b/src/config/worker.ts). */
  workerLimit: Limit;
  /** express-rate-limit in the provider (mock-c/src/index.ts). */
  providerLimit: Limit;
  /** Total tries per message, the first one included (service-b/src/config/queue.ts). */
  attempts: number;
  /** Retry n waits 2^(n-1) × delayMs (service-b/src/config/queue.ts). */
  backoff: { type: 'exponential'; delayMs: number };
  /** Jobs processed at once by the worker; BullMQ's default is 1. */
  concurrency: number;
}

/** Values in the gateway's code today; tests/policy.test.ts fails when they drift. */
export const DEFAULT_POLICY: Readonly<Policy> = Object.freeze({
  messages: 100_000,
  workerLimit: Object.freeze({ max: 100, windowMs: 1000 }),
  providerLimit: Object.freeze({ max: 100, windowMs: 1000 }),
  attempts: 5,
  backoff: Object.freeze({ type: 'exponential', delayMs: 1000 }),
  concurrency: 1,
});
