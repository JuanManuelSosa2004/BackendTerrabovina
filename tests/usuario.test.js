'use strict';

process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../src/app');
const { sequelize } = require('../src/database/sequelize');

let usuarioId;
let token;
const email = 'test-usuario-me@example.com';

function auth(req) {
  return req.set('Authorization', `Bearer ${token}`);
}

beforeAll(async () => {
  await sequelize.authenticate();
  await request(app).post('/api/v2/auth/registro').send({
    nombre: 'Usuario Me',
    email,
    password: 'password123',
    telefono: '1122334455',
  });
  const login = await request(app).post('/api/v2/auth/login').send({ email, password: 'password123' });
  token = login.body.token;
  usuarioId = login.body.usuario.id_usuario;
});

afterAll(async () => {
  await sequelize.query('DELETE FROM usuario WHERE id_usuario = :id', { replacements: { id: usuarioId } });
  await sequelize.close();
});

describe('GET /api/v2/usuarios/me', () => {
  test('sin token de sesión devuelve 401', async () => {
    const res = await request(app).get('/api/v2/usuarios/me');
    expect(res.status).toBe(401);
  });

  test('con token inválido devuelve 401', async () => {
    const res = await request(app).get('/api/v2/usuarios/me').set('Authorization', 'Bearer token-invalido');
    expect(res.status).toBe(401);
  });

  test('con token válido devuelve los datos del usuario autenticado sin password_hash', async () => {
    const res = await auth(request(app).get('/api/v2/usuarios/me'));
    expect(res.status).toBe(200);
    expect(res.body.id_usuario).toBe(usuarioId);
    expect(res.body.email).toBe(email);
    expect(res.body.nombre).toBe('Usuario Me');
    expect(res.body.telefono).toBe('1122334455');
    expect(res.body.password_hash).toBeUndefined();
  });
});

describe('PATCH /api/v2/usuarios/me', () => {
  test('sin token de sesión devuelve 401', async () => {
    const res = await request(app).patch('/api/v2/usuarios/me').send({ nombre: 'Nuevo Nombre' });
    expect(res.status).toBe(401);
  });

  test('actualiza nombre y teléfono', async () => {
    const res = await auth(request(app).patch('/api/v2/usuarios/me')).send({
      nombre: 'Nombre Actualizado',
      telefono: '5566778899',
    });
    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe('Nombre Actualizado');
    expect(res.body.telefono).toBe('5566778899');

    const getRes = await auth(request(app).get('/api/v2/usuarios/me'));
    expect(getRes.body.nombre).toBe('Nombre Actualizado');
    expect(getRes.body.telefono).toBe('5566778899');
  });

  test('ignora campos no editables como email', async () => {
    const res = await auth(request(app).patch('/api/v2/usuarios/me')).send({
      email: 'otro-email@example.com',
    });
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(email);
  });

  test('body vacío no modifica al usuario', async () => {
    const antes = await auth(request(app).get('/api/v2/usuarios/me'));
    const res = await auth(request(app).patch('/api/v2/usuarios/me')).send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual(antes.body);
  });
});
