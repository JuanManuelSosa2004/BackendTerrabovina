'use strict';

process.env.NODE_ENV = 'test';

const request = require('supertest');
const { QueryTypes } = require('sequelize');
const app = require('../src/app');
const { sequelize } = require('../src/database/sequelize');

function polygon(coords) {
  return { type: 'Polygon', coordinates: [coords] };
}

function bigPolygon() {
  return polygon([
    [-70, -40],
    [-60, -40],
    [-60, -30],
    [-70, -30],
    [-70, -40],
  ]);
}

function authHeader(req, token) {
  return req.set('Authorization', `Bearer ${token}`);
}

const usuariosCreados = [];
let contadorUsuarios = 0;

async function crearUsuario() {
  contadorUsuarios += 1;
  const email = `empleado-${Date.now()}-${contadorUsuarios}@example.com`;
  await request(app).post('/api/v2/auth/registro').send({ nombre: 'Empleado Test', email, password: 'password123' });
  const login = await request(app).post('/api/v2/auth/login').send({ email, password: 'password123' });
  usuariosCreados.push(login.body.usuario.id_usuario);
  return { token: login.body.token, id_usuario: login.body.usuario.id_usuario };
}

async function crearEstanciaPropia(token, overrides = {}) {
  return authHeader(request(app).post('/api/v2/estancia'), token).send({
    nombre: 'Estancia Empleado',
    geom: bigPolygon(),
    ...overrides,
  });
}

function crearEmpleadoEnEstancia(token, id_estancia, overrides = {}) {
  return authHeader(request(app).post(`/api/v2/estancia/${id_estancia}/empleado`), token).send({
    nombre: 'Juan Peon',
    rol: 'PEON',
    telefono: '3511234567',
    ...overrides,
  });
}

beforeAll(async () => {
  await sequelize.authenticate();
});

afterAll(async () => {
  try {
    if (usuariosCreados.length > 0) {
      const estancias = await sequelize.query('SELECT id_estancia FROM estancia WHERE id_usuario IN (:ids)', {
        replacements: { ids: usuariosCreados },
        type: QueryTypes.SELECT,
      });
      const estanciaIds = estancias.map((e) => e.id_estancia);
      if (estanciaIds.length > 0) {
        await sequelize.query('DELETE FROM empleado WHERE id_estancia IN (:estanciaIds)', {
          replacements: { estanciaIds },
        });
        await sequelize.query('DELETE FROM estancia WHERE id_estancia IN (:estanciaIds)', {
          replacements: { estanciaIds },
        });
      }
      await sequelize.query('DELETE FROM usuario WHERE id_usuario IN (:ids)', {
        replacements: { ids: usuariosCreados },
      });
    }
  } finally {
    await sequelize.close();
  }
});

describe('POST /api/v2/estancia/:estanciaId/empleado', () => {
  let token, tokenOtro, id_estancia;

  beforeAll(async () => {
    ({ token } = await crearUsuario());
    ({ token: tokenOtro } = await crearUsuario());
    const estancia = await crearEstanciaPropia(token);
    id_estancia = estancia.body.id_estancia;
  });

  test('crea un empleado', async () => {
    const res = await crearEmpleadoEnEstancia(token, id_estancia, { nombre: 'Carlos Capataz', rol: 'CAPATAZ' });
    expect(res.status).toBe(201);
    expect(res.body.id_estancia).toBe(id_estancia);
    expect(res.body.nombre).toBe('Carlos Capataz');
    expect(res.body.rol).toBe('CAPATAZ');
    expect(res.body.telefono).toBe('3511234567');
    expect(res.body.activo).toBe(1);
  });

  test('rechaza campos obligatorios faltantes', async () => {
    const res = await authHeader(request(app).post(`/api/v2/estancia/${id_estancia}/empleado`), token).send({
      nombre: 'Sin Rol',
    });
    expect(res.status).toBe(400);
  });

  test('sin token de sesión devuelve 401', async () => {
    const res = await request(app).post(`/api/v2/estancia/${id_estancia}/empleado`).send({ nombre: 'X', rol: 'PEON' });
    expect(res.status).toBe(401);
  });

  test('devuelve 404 para una estancia ajena', async () => {
    const res = await crearEmpleadoEnEstancia(tokenOtro, id_estancia);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v2/estancia/:estanciaId/empleado', () => {
  let token, id_estancia;

  beforeAll(async () => {
    ({ token } = await crearUsuario());
    const estancia = await crearEstanciaPropia(token);
    id_estancia = estancia.body.id_estancia;

    await crearEmpleadoEnEstancia(token, id_estancia, { nombre: 'Ana Peona', rol: 'PEON' });
    await crearEmpleadoEnEstancia(token, id_estancia, { nombre: 'Beto Capataz', rol: 'CAPATAZ' });
  });

  test('lista sólo los empleados activos de la estancia, ordenados por nombre', async () => {
    const res = await authHeader(request(app).get(`/api/v2/estancia/${id_estancia}/empleado`), token);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.map((e) => e.nombre)).toEqual(['Ana Peona', 'Beto Capataz']);
  });
});

describe('GET/PATCH/DELETE /api/v2/empleado/:empleadoId', () => {
  let token, tokenOtro, id_estancia, id_empleado;

  beforeAll(async () => {
    ({ token } = await crearUsuario());
    ({ token: tokenOtro } = await crearUsuario());
    const estancia = await crearEstanciaPropia(token);
    id_estancia = estancia.body.id_estancia;
    const empleado = await crearEmpleadoEnEstancia(token, id_estancia);
    id_empleado = empleado.body.id_empleado;
  });

  test('GET devuelve el empleado', async () => {
    const res = await authHeader(request(app).get(`/api/v2/empleado/${id_empleado}`), token);
    expect(res.status).toBe(200);
    expect(res.body.id_empleado).toBe(id_empleado);
  });

  test('GET devuelve 404 para un empleado ajeno', async () => {
    const res = await authHeader(request(app).get(`/api/v2/empleado/${id_empleado}`), tokenOtro);
    expect(res.status).toBe(404);
  });

  test('GET devuelve 404 para un id inexistente', async () => {
    const res = await authHeader(request(app).get('/api/v2/empleado/999999'), token);
    expect(res.status).toBe(404);
  });

  test('PATCH actualiza campos parciales', async () => {
    const res = await authHeader(request(app).patch(`/api/v2/empleado/${id_empleado}`), token).send({
      rol: 'CAPATAZ',
      telefono: '3510000000',
    });
    expect(res.status).toBe(200);
    expect(res.body.rol).toBe('CAPATAZ');
    expect(res.body.telefono).toBe('3510000000');
    expect(res.body.nombre).toBe('Juan Peon');
  });

  test('PATCH sin campos reconocidos devuelve 400', async () => {
    const res = await authHeader(request(app).patch(`/api/v2/empleado/${id_empleado}`), token).send({});
    expect(res.status).toBe(400);
  });

  test('PATCH de un empleado ajeno devuelve 404', async () => {
    const res = await authHeader(request(app).patch(`/api/v2/empleado/${id_empleado}`), tokenOtro).send({
      nombre: 'Hackeado',
    });
    expect(res.status).toBe(404);
  });

  test('DELETE da de baja el empleado (no aparece más en el listado)', async () => {
    const res = await authHeader(request(app).delete(`/api/v2/empleado/${id_empleado}`), token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true });

    const listado = await authHeader(request(app).get(`/api/v2/estancia/${id_estancia}/empleado`), token);
    expect(listado.body.find((e) => e.id_empleado === id_empleado)).toBeUndefined();

    const getRes = await authHeader(request(app).get(`/api/v2/empleado/${id_empleado}`), token);
    expect(getRes.status).toBe(200);
    expect(getRes.body.activo).toBe(0);
  });
});
