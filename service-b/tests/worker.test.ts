import { prisma } from '../src/config/prisma';
import { envs } from '../src/config/envs';

let workerProcessor: (job: any) => Promise<void>;
let failedHandler: (job: any, error: Error) => Promise<void>;

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation((_, processor, __) => {
    workerProcessor = processor;
    return {
      on: jest.fn().mockImplementation((event, handler) => {
        if (event === 'failed') failedHandler = handler;
      }),
    };
  }),
}));

jest.mock('../src/config/prisma', () => ({
  prisma: {
    message: {
      update: jest.fn(),
    },
  },
}));

jest.mock('../src/config/envs', () => ({
  envs: {
    REDIS_HOST: 'localhost',
    REDIS_PORT: 6379,
    MOCK_C_URL: 'http://mock-provider.com',
  },
}));

import '../src/config/worker';

const mockJob = {
  data: { id: 'msg-1', content: 'Hello', recipient: 'user@example.com' },
  attemptsMade: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('messageWorker - processor', () => {
  test('debe actualizar el status a SENT', async () => {
    (prisma.message.update as jest.Mock).mockResolvedValue({});
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

    await workerProcessor(mockJob);

    expect(prisma.message.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'msg-1' },
      data: { status: 'RETRYING', updatedAt: expect.any(Date) },
    });
    expect(prisma.message.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'msg-1' },
      data: { status: 'SENT' },
    });
    expect(prisma.message.update).toHaveBeenCalledTimes(2);
  });

  test('debe lanzar error e incrementer reintentos con 429', async () => {
    (prisma.message.update as jest.Mock).mockResolvedValue({});
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429 });

    await expect(workerProcessor(mockJob)).rejects.toThrow('Rate limit exceeded');

    expect(prisma.message.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'msg-1' },
      data: { retries: { increment: 1 } },
    });
  });

  test('debe actualizar el status a FAILED y lanzar una respuesta de error', async () => {
    (prisma.message.update as jest.Mock).mockResolvedValue({});
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    await expect(workerProcessor(mockJob)).rejects.toThrow('Error enviando mensaje');

    expect(prisma.message.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'msg-1' },
      data: { status: 'FAILED', retries: { increment: 1 } },
    });
  });

  test('debe llamar fetch con los argumentos correctos', async () => {
    (prisma.message.update as jest.Mock).mockResolvedValue({});
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

    await workerProcessor(mockJob);

    expect(global.fetch).toHaveBeenCalledWith('http://mock-provider.com/send-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'msg-1', content: 'Hello', recipient: 'user@example.com' }),
      signal: expect.any(AbortSignal),
    });
  });

  test('debe tratar un error de red como un 5xx: cuenta el reintento y marca FAILED', async () => {
    (prisma.message.update as jest.Mock).mockResolvedValue({});
    global.fetch = jest.fn().mockRejectedValue(new TypeError('fetch failed'));
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(workerProcessor(mockJob)).rejects.toThrow('Error enviando mensaje');

    expect(log).toHaveBeenCalledWith(expect.stringContaining('fetch failed'));
    log.mockRestore();

    expect(prisma.message.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'msg-1' },
      data: { status: 'FAILED', retries: { increment: 1 } },
    });
  });

  test('debe cortar la petición a Mock C a los 5 s y tratarla como un 5xx', async () => {
    const timeout = jest.spyOn(AbortSignal, 'timeout');
    (prisma.message.update as jest.Mock).mockResolvedValue({});
    // What fetch rejects with when the signal from AbortSignal.timeout fires.
    global.fetch = jest.fn().mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));

    await expect(workerProcessor(mockJob)).rejects.toThrow('Error enviando mensaje');

    expect(timeout).toHaveBeenCalledWith(5000);
    expect(prisma.message.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'msg-1' },
      data: { status: 'FAILED', retries: { increment: 1 } },
    });
    timeout.mockRestore();
  });
});

describe('messageWorker - failed handler', () => {
  test('debe actualizar el status a FAILED despues de 5 intentos', async () => {
    (prisma.message.update as jest.Mock).mockResolvedValue({});

    await failedHandler({ ...mockJob, attemptsMade: 5 }, new Error('Rate limit exceeded'));

    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: { status: 'FAILED' },
    });
  });

  test('no debe de actualizar el status si los intentos < 5', async () => {
    await failedHandler({ ...mockJob, attemptsMade: 3 }, new Error('Rate limit exceeded'));

    expect(prisma.message.update).not.toHaveBeenCalled();
  });

  test('no debe de actualizar si el job es undefined', async () => {
    await failedHandler(undefined, new Error('something'));

    expect(prisma.message.update).not.toHaveBeenCalled();
  });
});