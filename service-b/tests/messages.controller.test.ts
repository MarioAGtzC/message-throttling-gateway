import { createRequest, createResponse } from 'node-mocks-http';
import { prisma } from '../src/config/prisma';
import { messageQueue } from '../src/config/queue';
import { processMessage, getMessage, getStats } from '../src/controllers/messages.controller';

jest.mock('../src/config/prisma', () => ({
  prisma: {
    message: {
      findUnique: jest.fn(),
      create: jest.fn(),
      groupBy: jest.fn(),
    }
  }
}));

jest.mock('../src/config/queue', () => ({
  messageQueue: {
    add: jest.fn(),
  },
}));

const mockMessage = {
  id: 'msg-1',
  content: 'Hello',
  recipient: 'user@example.com'
};

const mockMessageResponse = {
  id: 'msg-1',
  content: 'Hello',
  recipient: 'user@example.com',
  status: 'PENDING',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('processMessage', () => {
  test('debe regresar 200 si el mensaje ya existe', async () => {
    (prisma.message.findUnique as jest.Mock).mockResolvedValue(mockMessageResponse);

    const req = createRequest({ body: mockMessage});
    const res = createResponse();
  
    await processMessage(req, res);

    expect(res.statusCode).toBe(200);
    expect(res._getJSONData()).toEqual({ message: 'Mensaje ya recibido anteriormente' });
    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(messageQueue.add).not.toHaveBeenCalled();
  });

  test('debe crear el mensaje y mandarlo a la queue si es nuevo', async () => {
    (prisma.message.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.message.create as jest.Mock).mockResolvedValue(mockMessage);
    (messageQueue.add as jest.Mock).mockResolvedValue(undefined);
    
    const req = createRequest({ body: mockMessage});
    const res = createResponse();

    await processMessage(req, res);

    expect(prisma.message.create).toHaveBeenCalledWith({ data: mockMessage });
    expect(messageQueue.add).toHaveBeenCalledWith('send', mockMessage, { jobId: 'message-msg-1' });
    expect(res.statusCode).toBe(202);
    expect(res._getJSONData()).toEqual({ message: 'Mensaje recibido' });
  });

  test('debe regresar 200 si un duplicado simultáneo choca con la llave primaria (P2002)', async () => {
    (prisma.message.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.message.create as jest.Mock).mockRejectedValue(
      Object.assign(new Error('Unique constraint failed on the fields: (`id`)'), { code: 'P2002' })
    );

    const req = createRequest({ body: mockMessage });
    const res = createResponse();

    await processMessage(req, res);

    expect(res.statusCode).toBe(200);
    expect(res._getJSONData()).toEqual({ message: 'Mensaje ya recibido anteriormente' });
    expect(messageQueue.add).not.toHaveBeenCalled();
  });

  test('debe propagar cualquier otro error al guardar', async () => {
    (prisma.message.findUnique as jest.Mock).mockResolvedValue(null);
    const dbDown = Object.assign(new Error('Can\'t reach database server'), { code: 'P1001' });
    (prisma.message.create as jest.Mock).mockRejectedValue(dbDown);

    const req = createRequest({ body: mockMessage });
    const res = createResponse();

    await expect(processMessage(req, res)).rejects.toBe(dbDown);
    expect(messageQueue.add).not.toHaveBeenCalled();
  });
});

describe('getMessage', () => {
  test('debe regresar 404 si el mensaje no se encuentra', async () => {
    (prisma.message.findUnique as jest.Mock).mockResolvedValue(null);

    const req = createRequest({ params: { id: 'msg-1' }});
    const res = createResponse();

    await getMessage(req, res);

    expect(res.statusCode).toBe(404);
    expect(res._getJSONData()).toEqual({ error: 'Mensaje no encontrado' })
  });

  test('debe regresar el mensaje si se encuentra', async () => {
    (prisma.message.findUnique as jest.Mock).mockResolvedValue(mockMessageResponse);

    const req = createRequest({ params: { id: 'msg-1' }});
    const res = createResponse();

    await getMessage(req, res);

    expect(res.statusCode).toBe(200);
    expect(res._getJSONData()).toEqual(mockMessageResponse)
  });
});

describe('getStats', () => {
  test('debe regresar las estadisticas agrupadas por status', async () => {
    (prisma.message.groupBy as jest.Mock).mockResolvedValue([
      { status: 'PENDING', _count: { status: 2 } },
      { status: 'SENT',    _count: { status: 5 } },
      { status: 'FAILED',  _count: { status: 1 } },
    ]);

    const req = createRequest();
    const res = createResponse();

    await getStats(req, res);

    expect(res.statusCode).toBe(200);
    expect(res._getJSONData()).toEqual({ pending: 2, sent: 5, failed: 1 });
  });
});