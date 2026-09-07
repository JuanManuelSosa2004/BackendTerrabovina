const request = require('supertest');
const app = require('../src/app');

test('malformed JSON is a client error instead of a server error', async () => {
  const response = await request(app).post('/api/v2/auth/login')
    .set('Content-Type', 'application/json').send('{');
  expect(response.status).toBe(400);
  expect(response.body.error).toMatch(/JSON/);
});

test('oversized JSON preserves the payload-too-large status', async () => {
  const response = await request(app).post('/api/v2/auth/login').send({ value: 'x'.repeat(110000) });
  expect(response.status).toBe(413);
});

test('stock dates follow Argentina even after midnight UTC on the VPS', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-09-08T01:00:00Z'));
  try {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await require('../src/controllers/estimacion.controller').crearEstimacionStock({
      potrero: { id_potrero: 1 }, body: { fecha: '2026-09-08' },
    }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'La fecha de Stock no puede ser futura.' });
  } finally {
    jest.useRealTimers();
  }
});
