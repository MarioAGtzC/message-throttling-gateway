import express, { Request, Response } from 'express';
import { faker } from '@faker-js/faker';
import { query } from 'express-validator';
import validateFields from './validateFields';

const app = express();
app.use(express.json());

const MAX_CONCURRENT = 100;
const SERVICE_B_URL = process.env.SERVICE_B_URL || 'http://localhost:3000';
const PORT = process.env.PORT || 3002;

async function sendMessage(data: object) {
  await fetch(`${SERVICE_B_URL}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

app.post('/simulate-real', [
  query('count').optional().isInt({ min: 1 }).withMessage('count debe ser un entero mayor a 0'),
  validateFields,
], async (req: Request, res: Response) => {
  const count = parseInt(req.query.count as string) || 100000;
  
  res.status(202).json({ message: `Simulando ráfaga de ${count} mensajes` })

  console.time('rafaga');
  for (let i = 0; i < count; i++) {
    // No cap on requests in flight, unlike /simulate; a failed send is logged, not fatal.
    sendMessage({
      id: faker.string.uuid(),
      content: 'Test message',
      recipient: '+521234567890'
    }).catch((error) => console.error(`Send failed: ${error.message}`));
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  console.timeEnd('rafaga');
});

app.post('/simulate', [
  query('count').optional().isInt({ min: 1 }).withMessage('count debe ser un entero mayor a 0'),
  validateFields,
], async (req: Request, res: Response) => {
  const count = parseInt(req.query.count as string) || 100000;

  res.status(202).json({ message: `Simulando ráfaga de ${count} mensajes` });

  let active = 0;

  console.time('rafaga');
  for (let i = 0; i < count; i++) {
    while (active >= MAX_CONCURRENT) {
      await new Promise(resolve => setTimeout(resolve, 1));
    }

    active++;
    sendMessage({
      id: faker.string.uuid(),
      content: 'Test message',
      recipient: '+521234567890'
    })
      .catch((error) => console.error(`Send failed: ${error.message}`))
      .finally(() => active--);
  }
  console.timeEnd('rafaga');
});

app.listen(PORT, () => {
  console.log(`Mock A corriendo en puerto ${PORT}`)
});