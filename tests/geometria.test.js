'use strict';

process.env.NODE_ENV = 'test';

const request = require('supertest');
const { QueryTypes } = require('sequelize');
const app = require('../src/app');
const { sequelize } = require('../src/database/sequelize');

const samplePolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [-60.1234, -34.5678],
      [-60.1201, -34.5682],
      [-60.1196, -34.5651],
      [-60.1229, -34.5647],
      [-60.1234, -34.5678],
    ],
  ],
};

// Debe quedar dentro del triangulo (-60,-34)-(-59.9,-34)-(-59.9,-33.9) al que
// termina la estancia luego del test "cierra automaticamente un anillo...".
const potreroPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [-59.935, -33.975],
      [-59.925, -33.975],
      [-59.925, -33.965],
      [-59.935, -33.965],
      [-59.935, -33.975],
    ],
  ],
};

let token;
let usuarioId;
let estanciaId;
let potreroId;

function auth(req) {
  return req.set('Authorization', `Bearer ${token}`);
}

beforeAll(async () => {
  await sequelize.authenticate();
  await request(app).post('/api/v2/auth/registro').send({
    nombre: 'Test User',
    email: 'test-geom@example.com',
    password: 'password123',
  });
  const login = await request(app)
    .post('/api/v2/auth/login')
    .send({ email: 'test-geom@example.com', password: 'password123' });
  token = login.body.token;
  usuarioId = login.body.usuario.id_usuario;
});

afterAll(async () => {
  await sequelize.query('DELETE FROM potrero WHERE id_estancia = :id', { replacements: { id: estanciaId } });
  await sequelize.query('DELETE FROM estancia WHERE id_estancia = :id', { replacements: { id: estanciaId } });
  await sequelize.query('DELETE FROM usuario WHERE id_usuario = :id', { replacements: { id: usuarioId } });
  await sequelize.close();
});

describe('Conexión', () => {
  test('sequelize.authenticate() conecta contra MySQL', async () => {
    await expect(sequelize.authenticate()).resolves.toBeUndefined();
  });
});

describe('Estancia - usuario sin estancia', () => {
  let otroToken;
  let otroUsuarioId;

  beforeAll(async () => {
    await request(app).post('/api/v2/auth/registro').send({
      nombre: 'Sin Estancia',
      email: 'test-geom-sin-estancia@example.com',
      password: 'password123',
    });
    const login = await request(app)
      .post('/api/v2/auth/login')
      .send({ email: 'test-geom-sin-estancia@example.com', password: 'password123' });
    otroToken = login.body.token;
    otroUsuarioId = login.body.usuario.id_usuario;
  });

  afterAll(async () => {
    await sequelize.query('DELETE FROM usuario WHERE id_usuario = :id', { replacements: { id: otroUsuarioId } });
  });

  test('GET /api/v2/estancia devuelve 404 si el usuario no tiene estancia registrada', async () => {
    const res = await request(app).get('/api/v2/estancia').set('Authorization', `Bearer ${otroToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('El usuario no tiene una estancia registrada.');
  });
});

describe('Estancia', () => {
  test('POST /api/v2/estancia crea una estancia con su geometría', async () => {
    const res = await auth(request(app).post('/api/v2/estancia')).send({
      nombre: 'Estancia Test',
      departamento: 'Depto',
      provincia: 'Provincia',
      superficie_total_ha: 120.5,
      geom: samplePolygon,
    });
    expect(res.status).toBe(201);
    expect(res.body.id_estancia).toBeDefined();
    expect(res.body.geom).toEqual(samplePolygon);
    estanciaId = res.body.id_estancia;
  });

  test('GET /api/v2/estancia/:id recupera el mismo polígono como GeoJSON', async () => {
    const res = await auth(request(app).get(`/api/v2/estancia/${estanciaId}`));
    expect(res.status).toBe(200);
    expect(res.body.geom).toEqual(samplePolygon);
  });

  test('cierra automáticamente un anillo que llega abierto', async () => {
    const open = {
      type: 'Polygon',
      coordinates: [
        [
          [-60, -34],
          [-59.9, -34],
          [-59.9, -33.9],
        ],
      ],
    };
    const res = await auth(request(app).patch(`/api/v2/estancia/${estanciaId}`)).send({ geom: open });
    expect(res.status).toBe(200);
    const ring = res.body.geom.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(ring).toHaveLength(4);
  });

  test('rechaza coordenadas con latitud fuera de rango', async () => {
    const invalid = {
      type: 'Polygon',
      coordinates: [
        [
          [-60, -100],
          [-59.9, -34],
          [-59.9, -33.9],
          [-60, -100],
        ],
      ],
    };
    const res = await auth(request(app).patch(`/api/v2/estancia/${estanciaId}`)).send({ geom: invalid });
    expect(res.status).toBe(400);
  });

  test('rechaza un GeoJSON que no es Polygon', async () => {
    const res = await auth(request(app).patch(`/api/v2/estancia/${estanciaId}`)).send({
      geom: { type: 'Point', coordinates: [1, 2] },
    });
    expect(res.status).toBe(400);
  });

  test('GET /api/v2/estancia/:id devuelve 404 para un id inexistente', async () => {
    const res = await auth(request(app).get('/api/v2/estancia/999999'));
    expect(res.status).toBe(404);
  });

  test('sin token de sesión devuelve 401', async () => {
    const res = await request(app).get(`/api/v2/estancia/${estanciaId}`);
    expect(res.status).toBe(401);
  });
});

describe('Potrero', () => {
  test('POST /api/v2/estancia/:id/potrero crea un potrero asociado a la estancia', async () => {
    const res = await auth(request(app).post(`/api/v2/estancia/${estanciaId}/potrero`)).send({
      nombre: 'Potrero Test',
      superficie_ha: 10,
      geom: potreroPolygon,
    });
    expect(res.status).toBe(201);
    expect(res.body.id_estancia).toBe(estanciaId);
    potreroId = res.body.id_potrero;
  });

  test('PATCH + GET conservan el polígono del potrero', async () => {
    const patchRes = await auth(request(app).patch(`/api/v2/potrero/${potreroId}`)).send({ geom: potreroPolygon });
    expect(patchRes.status).toBe(200);

    const getRes = await auth(request(app).get(`/api/v2/potrero/${potreroId}`));
    expect(getRes.status).toBe(200);
    expect(getRes.body.geom).toEqual(potreroPolygon);
  });

  test('GET /api/v2/estancia/:id/potrero lista los potreros de la estancia', async () => {
    const res = await auth(request(app).get(`/api/v2/estancia/${estanciaId}/potrero`));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id_potrero: potreroId, id_estancia: estanciaId })])
    );
  });
});

describe('Potrero - validaciones espaciales', () => {
  test('POST /api/v2/estancia/:id/potrero rechaza un polígono auto-intersectante', async () => {
    const bowtie = {
      type: 'Polygon',
      coordinates: [
        [
          [-59.93, -33.97],
          [-59.92, -33.96],
          [-59.92, -33.97],
          [-59.93, -33.96],
          [-59.93, -33.97],
        ],
      ],
    };
    const res = await auth(request(app).post(`/api/v2/estancia/${estanciaId}/potrero`)).send({
      nombre: 'Potrero Bowtie',
      superficie_ha: 1,
      geom: bowtie,
    });
    expect(res.status).toBe(400);
  });

  test('POST /api/v2/estancia/:id/potrero rechaza un polígono fuera de la estancia', async () => {
    const fueraDeEstancia = {
      type: 'Polygon',
      coordinates: [
        [
          [-58, -34],
          [-57.9, -34],
          [-57.9, -33.9],
          [-58, -33.9],
          [-58, -34],
        ],
      ],
    };
    const res = await auth(request(app).post(`/api/v2/estancia/${estanciaId}/potrero`)).send({
      nombre: 'Potrero Afuera',
      superficie_ha: 1,
      geom: fueraDeEstancia,
    });
    expect(res.status).toBe(400);
  });

  test('POST /api/v2/estancia/:id/potrero rechaza un polígono que se solapa con un potrero existente', async () => {
    const res = await auth(request(app).post(`/api/v2/estancia/${estanciaId}/potrero`)).send({
      nombre: 'Potrero Solapado',
      superficie_ha: 1,
      geom: potreroPolygon,
    });
    expect(res.status).toBe(400);
  });
});

describe('Estancia con potreros existentes', () => {
  test('PATCH /api/v2/estancia/:id rechaza un polígono que deja afuera un potrero existente', async () => {
    const shrunk = {
      type: 'Polygon',
      coordinates: [
        [
          [-58, -34],
          [-57.9, -34],
          [-57.9, -33.9],
          [-58, -33.9],
          [-58, -34],
        ],
      ],
    };
    const res = await auth(request(app).patch(`/api/v2/estancia/${estanciaId}`)).send({ geom: shrunk });
    expect(res.status).toBe(400);
    expect(res.body.potrerosAfectados).toEqual(
      expect.arrayContaining([expect.objectContaining({ id_potrero: potreroId })])
    );
  });
});

describe('Estancia - eliminación', () => {
  test('DELETE /api/v2/estancia/:id devuelve 409 si tiene potreros y no se confirma', async () => {
    const res = await auth(request(app).delete(`/api/v2/estancia/${estanciaId}`));
    expect(res.status).toBe(409);
    expect(res.body.requiresConfirmation).toBe(true);
    expect(res.body.potrerosAfectados).toBeGreaterThan(0);
  });
});

describe('Relaciones', () => {
  test('el potrero conserva su FK a la estancia luego de las operaciones anteriores', async () => {
    const rows = await sequelize.query('SELECT id_estancia FROM potrero WHERE id_potrero = :id', {
      replacements: { id: potreroId },
      type: QueryTypes.SELECT,
    });
    expect(rows[0].id_estancia).toBe(estanciaId);
  });
});
