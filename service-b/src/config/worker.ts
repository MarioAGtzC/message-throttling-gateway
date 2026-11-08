import { Worker, Job } from 'bullmq';
import { prisma } from './prisma';
import { envs } from './envs';

const connection = {
  host: envs.REDIS_HOST || 'localhost',
  port: envs.REDIS_PORT || 6379,
};

export const messageWorker = new Worker('messages', async (job: Job) => {
  const { id, content, recipient } = job.data;

  await prisma.message.update({
    where: { id },
    data: { status: 'RETRYING', updatedAt: new Date() }
  });

  // A network error or no answer within 5 s counts as a failed send, like a 5xx.
  const response = await fetch(`${envs.MOCK_C_URL}/send-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, content, recipient }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);

  if (response?.status === 429) {
    await prisma.message.update({
      where: { id },
      data: { retries: { increment: 1 } }
    });
    throw new Error('Rate limit exceeded');
  }

  if (!response?.ok) {
    await prisma.message.update({
      where: { id },
      data: { status: 'FAILED', retries: { increment: 1 } }
    });
    throw new Error('Error enviando mensaje');
  }

  await prisma.message.update({
    where: { id },
    data: { status: 'SENT' }
  });

}, {
  connection,
  limiter: {
    max: 100,
    duration: 1000,
  },
});

messageWorker.on('failed', async (job, error) => {
  if (job && job.attemptsMade >= 5) {
    await prisma.message.update({
      where: { id: job.data.id },
      data: { status: 'FAILED' }
    });
  }
});