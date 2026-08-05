'use strict';

process.env.NODE_ENV = 'test';

const crypto = require('crypto');

jest.mock('../src/services/mailer', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));

const request = require('supertest');
const app = require('../src/app');
const { sequelize } = require('../src/database/sequelize');
const { sendPasswordResetEmail } = require('../src/services/mailer');
const passwordResetTokenRepository = require('../src/database/sql/passwordResetToken.repository');

let usuarioId;
const email = 'test-recovery@example.com';
const passwordOriginal = 'password123';

beforeAll(async () => {
  await sequelize.authenticate();
  const registro = await request(app).post('/api/v2/auth/registro').send({
    nombre: 'Test Recovery User',
    email,
    password: passwordOriginal,
  });
  usuarioId = registro.body.usuario.id_usuario;
});

beforeEach(() => {
  sendPasswordResetEmail.mockClear();
});

afterAll(async () => {
  await sequelize.query('DELETE FROM password_reset_token WHERE id_usuario = :id', {
    replacements: { id: usuarioId },
  });
  await sequelize.query('DELETE FROM usuario WHERE id_usuario = :id', { replacements: { id: usuarioId } });
  await sequelize.close();
});

describe('POST /api/v2/auth/recuperar-contrasena', () => {
  test('rechaza sin email', async () => {
    const res = await request(app).post('/api/v2/auth/recuperar-contrasena').send({});
    expect(res.status).toBe(400);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  test('responde 200 genérico para un email inexistente, sin enviar correo', async () => {
    const res = await request(app)
      .post('/api/v2/auth/recuperar-contrasena')
      .send({ email: 'no-existe@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.mensaje).toMatch(/Si el correo está registrado/);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  test('responde 200 genérico para un email existente y envía el correo', async () => {
    const res = await request(app).post('/api/v2/auth/recuperar-contrasena').send({ email });
    expect(res.status).toBe(200);
    expect(res.body.mensaje).toMatch(/Si el correo está registrado/);
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(sendPasswordResetEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: email, rawToken: expect.any(String) })
    );
  });

  test('la contraseña original sigue funcionando (solicitar recuperación no la cambia)', async () => {
    const res = await request(app).post('/api/v2/auth/login').send({ email, password: passwordOriginal });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/v2/auth/restablecer-contrasena', () => {
  test('rechaza sin token', async () => {
    const res = await request(app).post('/api/v2/auth/restablecer-contrasena').send({ password: 'nuevaPass123' });
    expect(res.status).toBe(400);
  });

  test('rechaza sin password', async () => {
    const res = await request(app).post('/api/v2/auth/restablecer-contrasena').send({ token: 'cualquiera' });
    expect(res.status).toBe(400);
  });

  test('rechaza password menor a 8 caracteres', async () => {
    const res = await request(app)
      .post('/api/v2/auth/restablecer-contrasena')
      .send({ token: 'cualquiera', password: 'corta' });
    expect(res.status).toBe(400);
  });

  test('rechaza un token inexistente', async () => {
    const res = await request(app)
      .post('/api/v2/auth/restablecer-contrasena')
      .send({ token: 'token-que-no-existe', password: 'nuevaPass123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/inválido o venció/);
  });

  test('rechaza un token vencido', async () => {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const token_hash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await passwordResetTokenRepository.createToken({
      id_usuario: usuarioId,
      token_hash,
      expira_en: new Date(Date.now() - 60 * 1000), // vencido hace 1 minuto
    });

    const res = await request(app)
      .post('/api/v2/auth/restablecer-contrasena')
      .send({ token: rawToken, password: 'nuevaPass123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/inválido o venció/);
  });

  test('con un token válido actualiza la contraseña, y el token no puede reutilizarse', async () => {
    const recuperar = await request(app).post('/api/v2/auth/recuperar-contrasena').send({ email });
    expect(recuperar.status).toBe(200);
    const { rawToken } = sendPasswordResetEmail.mock.calls[sendPasswordResetEmail.mock.calls.length - 1][0];

    const nuevaPassword = 'nuevaPassSegura123';
    const restablecer = await request(app)
      .post('/api/v2/auth/restablecer-contrasena')
      .send({ token: rawToken, password: nuevaPassword });
    expect(restablecer.status).toBe(200);
    expect(restablecer.body.mensaje).toMatch(/actualizada/);

    const loginViejaPassword = await request(app).post('/api/v2/auth/login').send({ email, password: passwordOriginal });
    expect(loginViejaPassword.status).toBe(401);

    const loginNuevaPassword = await request(app).post('/api/v2/auth/login').send({ email, password: nuevaPassword });
    expect(loginNuevaPassword.status).toBe(200);

    const reutilizarToken = await request(app)
      .post('/api/v2/auth/restablecer-contrasena')
      .send({ token: rawToken, password: 'otraPassMas123' });
    expect(reutilizarToken.status).toBe(400);
    expect(reutilizarToken.body.error).toMatch(/inválido o venció/);
  });
});
