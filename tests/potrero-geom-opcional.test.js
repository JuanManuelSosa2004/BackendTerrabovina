'use strict';

process.env.NODE_ENV = 'test';

const request = require('supertest');
const { QueryTypes } = require('sequelize');
const app = require('../src/app');
const { sequelize } = require('../src/database/sequelize');

const estanciaPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [-61.2, -35.7],
      [-61.0, -35.7],
      [-61.0, -35.5],
      [-61.2, -35.5],
      [-61.2, -35.7],
    ],
  ],
};

const potreroAPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [-61.18, -35.68],
      [-61.12, -35.68],
      [-61.12, -35.62],
      [-61.18, -35.62],
      [-61.18, -35.68],
    ],
  ],
};

const potreroBOverlapPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [-61.15, -35.65],
      [-61.1, -35.65],
      [-61.1, -35.6],
      [-61.15, -35.6],
      [-61.15, -35.65],
    ],
  ],
};

const potreroBLibrePolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [-61.08, -35.68],
      [-61.02, -35.68],
      [-61.02, -35.62],
      [-61.08, -35.62],
      [-61.08, -35.68],
    ],
  ],
};

let usuarioId;
let estanciaId;
let potreroAId;
let potreroBId;

beforeAll(async () => {
  await sequelize.authenticate();

  const [insertId] = await sequelize.query(
    `INSERT INTO usuario (nombre, email, password_hash, created_at, updated_at)
     VALUES ('Test Potrero Geom Opcional', 'test-potrero-geom-opcional@example.com', 'x', NOW(), NOW())`,
    { type: QueryTypes.INSERT }
  );
  usuarioId = insertId;

  const estanciaRes = await request(app).post('/estancias').send({
    id_usuario: usuarioId,
    nombre: 'Estancia Geom Opcional Test',
  });
  estanciaId = estanciaRes.body.id_estancia;
  await request(app).patch(`/estancias/${estanciaId}/geometria`).send(estanciaPolygon);

  const potreroARes = await request(app).post('/potreros').send({
    id_estancia: estanciaId,
    nombre: 'Potrero A',
    geom: potreroAPolygon,
  });
  potreroAId = potreroARes.body.id_potrero;
});

afterAll(async () => {
  await sequelize.query('DELETE FROM potrero WHERE id_estancia = :estanciaId', {
    replacements: { estanciaId },
  });
  await sequelize.query('DELETE FROM estancia WHERE id_estancia = :estanciaId', {
    replacements: { estanciaId },
  });
  await sequelize.query('DELETE FROM usuario WHERE id_usuario = :id', {
    replacements: { id: usuarioId },
  });
  await sequelize.close();
});

describe('POST /potreros con geom opcional', () => {
  test('crea el potrero sin geom (queda null, no rompe el flujo de dibujar despues)', async () => {
    const res = await request(app).post('/potreros').send({
      id_estancia: estanciaId,
      nombre: 'Potrero B',
    });
    expect(res.status).toBe(201);
    expect(res.body.geom).toBeNull();
    potreroBId = res.body.id_potrero;
  });

  test('GET conserva el potrero sin geom', async () => {
    const res = await request(app).get(`/potreros/${potreroBId}`);
    expect(res.status).toBe(200);
    expect(res.body.geom).toBeNull();
  });

  test('sigue rechazando un potrero creado con geom que se solapa con otro', async () => {
    const res = await request(app).post('/potreros').send({
      id_estancia: estanciaId,
      nombre: 'Potrero Solapado',
      geom: potreroBOverlapPolygon,
    });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /potreros/:id/geometria valida solape (gap arreglado)', () => {
  test('rechaza asignar una geometria que se solapa con otro potrero de la misma estancia', async () => {
    const res = await request(app)
      .patch(`/potreros/${potreroBId}/geometria`)
      .send(potreroBOverlapPolygon);
    expect(res.status).toBe(400);
  });

  test('acepta una geometria que no se solapa y queda dentro de la estancia', async () => {
    const res = await request(app)
      .patch(`/potreros/${potreroBId}/geometria`)
      .send(potreroBLibrePolygon);
    expect(res.status).toBe(200);
    expect(res.body.geom).toEqual(potreroBLibrePolygon);
  });

  test('rechaza re-asignar la geometria de potrero A al mismo lugar donde ya esta (no se autoexcluye mal)', async () => {
    const res = await request(app)
      .patch(`/potreros/${potreroAId}/geometria`)
      .send(potreroAPolygon);
    expect(res.status).toBe(200);
  });
});
