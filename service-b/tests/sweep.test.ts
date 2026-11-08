import { prisma } from '../src/config/prisma';
import { messageQueue } from '../src/config/queue';
import { jobIdFor } from '../src/config/jobId';
import { requeueStalePending, startPendingSweep } from '../src/config/sweep';

jest.mock('../src/config/prisma', () => ({
  prisma: {
    message: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../src/config/queue', () => ({
  messageQueue: {
    addBulk: jest.fn(),
  },
}));

const m = (id: string) => ({ id, content: 'Hello', recipient: 'user@example.com' });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('jobIdFor', () => {
  test('prefixes the message id', () => {
    expect(jobIdFor('msg-1')).toBe('message-msg-1');
  });

  test('never returns an integer or a colon, which BullMQ rejects', () => {
    expect(jobIdFor('123')).toBe('message-123');
    expect(jobIdFor('a:b')).not.toContain(':');
  });

  test('keeps different ids apart after escaping', () => {
    expect(jobIdFor('a:b')).not.toBe(jobIdFor('a%3Ab'));
  });
});

describe('requeueStalePending', () => {
  test('queues every message PENDING for over a minute, with its own job id', async () => {
    (prisma.message.findMany as jest.Mock).mockResolvedValueOnce([m('m1'), m('m2')]).mockResolvedValueOnce([]);

    const now = Date.parse('2026-11-08T10:00:00Z');
    const count = await requeueStalePending(now);

    expect(count).toBe(2);
    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'PENDING', createdAt: { lt: new Date(now - 60_000) } },
      }),
    );
    expect(messageQueue.addBulk).toHaveBeenCalledWith([
      { name: 'send', data: m('m1'), opts: { jobId: 'message-m1' } },
      { name: 'send', data: m('m2'), opts: { jobId: 'message-m2' } },
    ]);
  });

  test('walks the table in pages after the last id seen', async () => {
    (prisma.message.findMany as jest.Mock).mockResolvedValueOnce([m('m1')]).mockResolvedValueOnce([m('m2')]).mockResolvedValueOnce([]);

    expect(await requeueStalePending()).toBe(2);
    expect((prisma.message.findMany as jest.Mock).mock.calls[0][0].where.id).toBeUndefined();
    expect((prisma.message.findMany as jest.Mock).mock.calls[1][0].where).toEqual(
      expect.objectContaining({ status: 'PENDING', id: { gt: 'm1' } }),
    );
    expect(messageQueue.addBulk).toHaveBeenCalledTimes(2);
  });

  test('queues nothing when no message is stuck', async () => {
    (prisma.message.findMany as jest.Mock).mockResolvedValue([]);

    expect(await requeueStalePending()).toBe(0);
    expect(messageQueue.addBulk).not.toHaveBeenCalled();
  });
});

describe('startPendingSweep', () => {
  test('runs every interval and keeps running after a failed run', async () => {
    jest.useFakeTimers();
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    (prisma.message.findMany as jest.Mock).mockRejectedValueOnce(new Error('db down')).mockResolvedValue([]);

    const stop = startPendingSweep(60_000);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(error).toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(prisma.message.findMany).toHaveBeenCalledTimes(2);

    stop();
    await jest.advanceTimersByTimeAsync(120_000);
    expect(prisma.message.findMany).toHaveBeenCalledTimes(2);

    error.mockRestore();
    jest.useRealTimers();
  });
});
