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

let usuarioId;
let estanciaId;
let potreroId;

beforeAll(async () => {
  await sequelize.authenticate();
  const [insertId] = await sequelize.query(
    `INSERT INTO usuario (nombre, email, password_hash, created_at, updated_at)
     VALUES ('Test User', 'test-geom@example.com', 'x', NOW(), NOW())`,
    { type: QueryTypes.INSERT }
  );
  usuarioId = insertId;
});

afterAll(async () => {
  await sequelize.query('DELETE FROM usuario WHERE id_usuario = :id', {
    replacements: { id: usuarioId },
  });
  await sequelize.close();
});

describe('Conexión', () => {
  test('sequelize.authenticate() conecta contra MySQL', async () => {
    await expect(sequelize.authenticate()).resolves.toBeUndefined();
  });
});

describe('Estancia', () => {
  test('POST /estancias crea una estancia sin geometría', async () => {
    const res = await request(app).post('/estancias').send({
      id_usuario: usuarioId,
      nombre: 'Estancia Test',
      departamento: 'Depto',
      provincia: 'Provincia',
      superficie_total_ha: 120.5,
    });
    expect(res.status).toBe(201);
    expect(res.body.id_estancia).toBeDefined();
    expect(res.body.geom).toBeNull();
    estanciaId = res.body.id_estancia;
  });

  test('PATCH /estancias/:id/geometria persiste el POLYGON', async () => {
    const res = await request(app).patch(`/estancias/${estanciaId}/geometria`).send(samplePolygon);
    expect(res.status).toBe(200);
    expect(res.body.geom.type).toBe('Polygon');
    expect(res.body.geom.coordinates[0]).toHaveLength(5);
  });

  test('GET /estancias/:id recupera el mismo polígono como GeoJSON', async () => {
    const res = await request(app).get(`/estancias/${estanciaId}`);
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
    const res = await request(app).patch(`/estancias/${estanciaId}/geometria`).send(open);
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
    const res = await request(app).patch(`/estancias/${estanciaId}/geometria`).send(invalid);
    expect(res.status).toBe(400);
  });

  test('rechaza un GeoJSON que no es Polygon', async () => {
    const res = await request(app)
      .patch(`/estancias/${estanciaId}/geometria`)
      .send({ type: 'Point', coordinates: [1, 2] });
    expect(res.status).toBe(400);
  });

  test('GET /estancias/:id devuelve 404 para un id inexistente', async () => {
    const res = await request(app).get('/estancias/999999');
    expect(res.status).toBe(404);
  });
});

describe('Potrero', () => {
  test('POST /potreros crea un potrero asociado a la estancia', async () => {
    const res = await request(app).post('/potreros').send({
      id_estancia: estanciaId,
      nombre: 'Potrero Test',
      superficie_ha: 10,
    });
    expect(res.status).toBe(201);
    expect(res.body.id_estancia).toBe(estanciaId);
    potreroId = res.body.id_potrero;
  });

  test('PATCH + GET conservan el polígono del potrero', async () => {
    const patchRes = await request(app).patch(`/potreros/${potreroId}/geometria`).send(samplePolygon);
    expect(patchRes.status).toBe(200);

    const getRes = await request(app).get(`/potreros/${potreroId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.geom).toEqual(samplePolygon);
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
