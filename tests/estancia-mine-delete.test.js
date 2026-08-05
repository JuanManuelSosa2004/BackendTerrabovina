'use strict';

process.env.NODE_ENV = 'test';

const request = require('supertest');
const { QueryTypes } = require('sequelize');
const app = require('../src/app');
const { sequelize } = require('../src/database/sequelize');

function polygon(coords) {
  return { type: 'Polygon', coordinates: [coords] };
}

async function crearUsuarioConToken(email) {
  await request(app).post('/api/v2/auth/registro').send({ nombre: 'Test User', email, password: 'password123' });
  const login = await request(app).post('/api/v2/auth/login').send({ email, password: 'password123' });
  return { token: login.body.token, id_usuario: login.body.usuario.id_usuario };
}

function auth(req, token) {
  return req.set('Authorization', `Bearer ${token}`);
}

const usuariosCreados = [];

beforeAll(async () => {
  await sequelize.authenticate();
});

afterAll(async () => {
  try {
    if (usuariosCreados.length > 0) {
      const estancias = await sequelize.query(
        'SELECT id_estancia FROM estancia WHERE id_usuario IN (:ids)',
        { replacements: { ids: usuariosCreados }, type: QueryTypes.SELECT }
      );
      const estanciaIds = estancias.map((e) => e.id_estancia);

      if (estanciaIds.length > 0) {
        await sequelize.query(
          'DELETE FROM asignacion_ganado WHERE id_ganado IN (SELECT id_ganado FROM ganado WHERE id_estancia IN (:estanciaIds))',
          { replacements: { estanciaIds } }
        );
        await sequelize.query('DELETE FROM ganado WHERE id_estancia IN (:estanciaIds)', {
          replacements: { estanciaIds },
        });
        await sequelize.query('DELETE FROM potrero WHERE id_estancia IN (:estanciaIds)', {
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

describe('GET /api/v2/estancia (mine)', () => {
  test('sin token de sesión devuelve 401', async () => {
    const res = await request(app).get('/api/v2/estancia');
    expect(res.status).toBe(401);
  });

  test('devuelve la estancia del usuario autenticado', async () => {
    const { token, id_usuario } = await crearUsuarioConToken('test-estancia-mine@example.com');
    usuariosCreados.push(id_usuario);

    const geom = polygon([
      [-61.2, -35.7],
      [-61.0, -35.7],
      [-61.0, -35.5],
      [-61.2, -35.5],
      [-61.2, -35.7],
    ]);
    const creada = await auth(request(app).post('/api/v2/estancia'), token).send({ nombre: 'Mi Estancia', geom });
    expect(creada.status).toBe(201);

    const res = await auth(request(app).get('/api/v2/estancia'), token);
    expect(res.status).toBe(200);
    expect(res.body.id_estancia).toBe(creada.body.id_estancia);
    expect(res.body.nombre).toBe('Mi Estancia');
    expect(res.body.geom).toEqual(geom);
  });
});

describe('DELETE /api/v2/estancia/:id', () => {
  test('sin token de sesión devuelve 401', async () => {
    const res = await request(app).delete('/api/v2/estancia/1');
    expect(res.status).toBe(401);
  });

  test('devuelve 404 para un id inexistente', async () => {
    const { token, id_usuario } = await crearUsuarioConToken('test-estancia-del-404@example.com');
    usuariosCreados.push(id_usuario);

    const res = await auth(request(app).delete('/api/v2/estancia/999999'), token);
    expect(res.status).toBe(404);
  });

  test('devuelve 404 para una estancia de otro usuario', async () => {
    const dueño = await crearUsuarioConToken('test-estancia-del-owner@example.com');
    const otro = await crearUsuarioConToken('test-estancia-del-otro@example.com');
    usuariosCreados.push(dueño.id_usuario, otro.id_usuario);

    const geom = polygon([
      [-61.4, -35.9],
      [-61.3, -35.9],
      [-61.3, -35.8],
      [-61.4, -35.8],
      [-61.4, -35.9],
    ]);
    const creada = await auth(request(app).post('/api/v2/estancia'), dueño.token).send({
      nombre: 'Estancia Ajena',
      geom,
    });

    const res = await auth(request(app).delete(`/api/v2/estancia/${creada.body.id_estancia}`), otro.token);
    expect(res.status).toBe(404);
  });

  test('sin potreros ni ganado elimina directamente sin requerir confirmación', async () => {
    const { token, id_usuario } = await crearUsuarioConToken('test-estancia-del-vacia@example.com');
    usuariosCreados.push(id_usuario);

    const geom = polygon([
      [-61.6, -36.1],
      [-61.5, -36.1],
      [-61.5, -36.0],
      [-61.6, -36.0],
      [-61.6, -36.1],
    ]);
    const creada = await auth(request(app).post('/api/v2/estancia'), token).send({ nombre: 'Estancia Vacía', geom });
    const estanciaId = creada.body.id_estancia;

    const res = await auth(request(app).delete(`/api/v2/estancia/${estanciaId}`), token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ deleted: true, potrerosEliminados: 0, ganadoEliminado: 0 });

    const getRes = await auth(request(app).get(`/api/v2/estancia/${estanciaId}`), token);
    expect(getRes.status).toBe(404);
  });

  test('con potreros y ganado, sin confirm, devuelve 409 con el detalle de lo afectado', async () => {
    const { token, id_usuario } = await crearUsuarioConToken('test-estancia-del-409@example.com');
    usuariosCreados.push(id_usuario);

    const geomEstancia = polygon([
      [-61.9, -36.4],
      [-61.6, -36.4],
      [-61.6, -36.1],
      [-61.9, -36.1],
      [-61.9, -36.4],
    ]);
    const estancia = await auth(request(app).post('/api/v2/estancia'), token).send({
      nombre: 'Estancia Con Potreros',
      geom: geomEstancia,
    });
    const estanciaId = estancia.body.id_estancia;

    const geomPotrero = polygon([
      [-61.85, -36.35],
      [-61.75, -36.35],
      [-61.75, -36.25],
      [-61.85, -36.25],
      [-61.85, -36.35],
    ]);
    const potrero = await auth(request(app).post(`/api/v2/estancia/${estanciaId}/potrero`), token).send({
      nombre: 'Potrero',
      geom: geomPotrero,
    });
    expect(potrero.status).toBe(201);

    const ganado = await auth(request(app).post(`/api/v2/estancia/${estanciaId}/ganado`), token).send({
      numero_identificacion: 'DEL-ESTANCIA-001',
      sexo: 'M',
      categoria: 'NOVILLO',
      peso_kg: 300,
    });
    expect(ganado.status).toBe(201);

    const res = await auth(request(app).delete(`/api/v2/estancia/${estanciaId}`), token);
    expect(res.status).toBe(409);
    expect(res.body.requiresConfirmation).toBe(true);
    expect(res.body.potrerosAfectados).toBe(1);
    expect(res.body.ganadoAfectado).toBe(1);

    // No debe haber eliminado nada: sigue existiendo tras el 409.
    const getRes = await auth(request(app).get(`/api/v2/estancia/${estanciaId}`), token);
    expect(getRes.status).toBe(200);
  });

  test('con ?confirm=true elimina la estancia junto con sus potreros y ganado', async () => {
    const { token, id_usuario } = await crearUsuarioConToken('test-estancia-del-confirm@example.com');
    usuariosCreados.push(id_usuario);

    const geomEstancia = polygon([
      [-62.2, -36.7],
      [-61.9, -36.7],
      [-61.9, -36.4],
      [-62.2, -36.4],
      [-62.2, -36.7],
    ]);
    const estancia = await auth(request(app).post('/api/v2/estancia'), token).send({
      nombre: 'Estancia A Confirmar',
      geom: geomEstancia,
    });
    const estanciaId = estancia.body.id_estancia;

    const geomPotrero = polygon([
      [-62.15, -36.65],
      [-62.05, -36.65],
      [-62.05, -36.55],
      [-62.15, -36.55],
      [-62.15, -36.65],
    ]);
    const potrero = await auth(request(app).post(`/api/v2/estancia/${estanciaId}/potrero`), token).send({
      nombre: 'Potrero A Confirmar',
      geom: geomPotrero,
    });
    const potreroId = potrero.body.id_potrero;

    const ganado = await auth(request(app).post(`/api/v2/potrero/${potreroId}/ganado`), token).send({
      numero_identificacion: 'DEL-ESTANCIA-CONFIRM-001',
      sexo: 'F',
      categoria: 'VAQUILLONA',
      peso_kg: 250,
    });
    expect(ganado.status).toBe(201);

    const res = await auth(request(app).delete(`/api/v2/estancia/${estanciaId}?confirm=true`), token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ deleted: true, potrerosEliminados: 1, ganadoEliminado: 1 });

    const getEstancia = await auth(request(app).get(`/api/v2/estancia/${estanciaId}`), token);
    expect(getEstancia.status).toBe(404);

    const getPotrero = await auth(request(app).get(`/api/v2/potrero/${potreroId}`), token);
    expect(getPotrero.status).toBe(404);

    const getGanado = await auth(request(app).get(`/api/v2/ganado/${ganado.body.id_ganado}`), token);
    expect(getGanado.status).toBe(404);

    // Con la estancia eliminada, el usuario vuelve a estar "sin estancia".
    const getMine = await auth(request(app).get('/api/v2/estancia'), token);
    expect(getMine.status).toBe(404);
  }, 15000);
});
