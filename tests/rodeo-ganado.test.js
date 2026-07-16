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
      [-60.2, -34.7],
      [-60.0, -34.7],
      [-60.0, -34.5],
      [-60.2, -34.5],
      [-60.2, -34.7],
    ],
  ],
};

const potreroPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [-60.18, -34.68],
      [-60.12, -34.68],
      [-60.12, -34.62],
      [-60.18, -34.62],
      [-60.18, -34.68],
    ],
  ],
};

const otraEstanciaPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [-59.2, -33.7],
      [-59.0, -33.7],
      [-59.0, -33.5],
      [-59.2, -33.5],
      [-59.2, -33.7],
    ],
  ],
};

const potreroOtraEstanciaPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [-59.18, -33.68],
      [-59.12, -33.68],
      [-59.12, -33.62],
      [-59.18, -33.62],
      [-59.18, -33.68],
    ],
  ],
};

let usuarioId;
let usuarioOtroId;
let estanciaId;
let otraEstanciaId;
let potreroId;
let potreroOtraEstanciaId;

beforeAll(async () => {
  await sequelize.authenticate();

  const [insertId] = await sequelize.query(
    `INSERT INTO usuario (nombre, email, password_hash, created_at, updated_at)
     VALUES ('Test Rodeo User', 'test-rodeo@example.com', 'x', NOW(), NOW())`,
    { type: QueryTypes.INSERT }
  );
  usuarioId = insertId;

  const [otroInsertId] = await sequelize.query(
    `INSERT INTO usuario (nombre, email, password_hash, created_at, updated_at)
     VALUES ('Test Rodeo User 2', 'test-rodeo-2@example.com', 'x', NOW(), NOW())`,
    { type: QueryTypes.INSERT }
  );
  usuarioOtroId = otroInsertId;

  const estanciaRes = await request(app).post('/estancias').send({
    id_usuario: usuarioId,
    nombre: 'Estancia Rodeo Test',
  });
  estanciaId = estanciaRes.body.id_estancia;
  await request(app).patch(`/estancias/${estanciaId}/geometria`).send(estanciaPolygon);

  const otraEstanciaRes = await request(app).post('/estancias').send({
    id_usuario: usuarioOtroId,
    nombre: 'Otra Estancia Rodeo Test',
  });
  otraEstanciaId = otraEstanciaRes.body.id_estancia;
  await request(app).patch(`/estancias/${otraEstanciaId}/geometria`).send(otraEstanciaPolygon);

  const potreroRes = await request(app).post('/potreros').send({
    id_estancia: estanciaId,
    nombre: 'Potrero Rodeo Test',
    geom: potreroPolygon,
  });
  potreroId = potreroRes.body.id_potrero;

  const potreroOtraEstanciaRes = await request(app).post('/potreros').send({
    id_estancia: otraEstanciaId,
    nombre: 'Potrero Otra Estancia Test',
    geom: potreroOtraEstanciaPolygon,
  });
  potreroOtraEstanciaId = potreroOtraEstanciaRes.body.id_potrero;
});

afterAll(async () => {
  const estanciaIds = [estanciaId, otraEstanciaId];
  await sequelize.query(
    'DELETE FROM ganado WHERE id_rodeo IN (SELECT id_rodeo FROM rodeo WHERE id_estancia IN (:estanciaIds))',
    { replacements: { estanciaIds } }
  );
  await sequelize.query('DELETE FROM rodeo WHERE id_estancia IN (:estanciaIds)', {
    replacements: { estanciaIds },
  });
  await sequelize.query(
    'DELETE FROM zona_potrero WHERE id_potrero IN (SELECT id_potrero FROM potrero WHERE id_estancia IN (:estanciaIds))',
    { replacements: { estanciaIds } }
  );
  await sequelize.query('DELETE FROM potrero WHERE id_estancia IN (:estanciaIds)', {
    replacements: { estanciaIds },
  });
  await sequelize.query('DELETE FROM estancia WHERE id_estancia IN (:estanciaIds)', {
    replacements: { estanciaIds },
  });
  await sequelize.query('DELETE FROM usuario WHERE id_usuario IN (:ids)', {
    replacements: { ids: [usuarioId, usuarioOtroId] },
  });
  await sequelize.close();
});

describe('Rodeo', () => {
  let rodeoId;

  test('POST /rodeos crea un rodeo sin potrero', async () => {
    const res = await request(app).post('/rodeos').send({
      id_estancia: estanciaId,
      nombre: 'Rodeo Test',
      descripcion: 'Descripcion',
    });
    expect(res.status).toBe(201);
    expect(res.body.id_estancia).toBe(estanciaId);
    expect(res.body.id_potrero_actual).toBeNull();
    expect(res.body.activo).toBe(1);
    rodeoId = res.body.id_rodeo;
  });

  test('POST /rodeos rechaza sin id_estancia/nombre', async () => {
    const res = await request(app).post('/rodeos').send({ nombre: 'Sin estancia' });
    expect(res.status).toBe(400);
  });

  test('POST /rodeos rechaza potrero de otra estancia', async () => {
    const res = await request(app).post('/rodeos').send({
      id_estancia: estanciaId,
      nombre: 'Rodeo Invalido',
      id_potrero_actual: potreroOtraEstanciaId,
    });
    expect(res.status).toBe(400);
  });

  test('GET /rodeos/:id devuelve el rodeo creado', async () => {
    const res = await request(app).get(`/rodeos/${rodeoId}`);
    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe('Rodeo Test');
  });

  test('GET /rodeos/:id devuelve 404 para id inexistente', async () => {
    const res = await request(app).get('/rodeos/999999');
    expect(res.status).toBe(404);
  });

  test('PATCH /rodeos/:id actualiza campos parcialmente', async () => {
    const res = await request(app).patch(`/rodeos/${rodeoId}`).send({ activo: false });
    expect(res.status).toBe(200);
    expect(res.body.activo).toBe(0);
    expect(res.body.nombre).toBe('Rodeo Test');
  });

  test('PATCH /rodeos/:id/potrero asigna un potrero valido', async () => {
    const res = await request(app)
      .patch(`/rodeos/${rodeoId}/potrero`)
      .send({ id_potrero_actual: potreroId });
    expect(res.status).toBe(200);
    expect(res.body.id_potrero_actual).toBe(potreroId);
  });

  test('PATCH /rodeos/:id/potrero rechaza potrero de otra estancia', async () => {
    const res = await request(app)
      .patch(`/rodeos/${rodeoId}/potrero`)
      .send({ id_potrero_actual: potreroOtraEstanciaId });
    expect(res.status).toBe(400);
  });

  test('PATCH /rodeos/:id/potrero desasigna el potrero con null', async () => {
    const res = await request(app)
      .patch(`/rodeos/${rodeoId}/potrero`)
      .send({ id_potrero_actual: null });
    expect(res.status).toBe(200);
    expect(res.body.id_potrero_actual).toBeNull();
  });
});

describe('Ganado', () => {
  let rodeoAId;
  let rodeoBId;
  let rodeoOtraEstanciaId;
  let ganadoId;

  beforeAll(async () => {
    const rodeoARes = await request(app).post('/rodeos').send({
      id_estancia: estanciaId,
      nombre: 'Rodeo A',
    });
    rodeoAId = rodeoARes.body.id_rodeo;

    const rodeoBRes = await request(app).post('/rodeos').send({
      id_estancia: estanciaId,
      nombre: 'Rodeo B',
    });
    rodeoBId = rodeoBRes.body.id_rodeo;

    const rodeoOtraEstanciaRes = await request(app).post('/rodeos').send({
      id_estancia: otraEstanciaId,
      nombre: 'Rodeo Otra Estancia',
    });
    rodeoOtraEstanciaId = rodeoOtraEstanciaRes.body.id_rodeo;
  });

  test('POST /ganados crea un animal valido', async () => {
    const res = await request(app).post('/ganados').send({
      id_rodeo: rodeoAId,
      numero_identificacion: 'CARAVANA-001',
      sexo: 'F',
      categoria: 'VACA',
      peso_kg: 420.5,
    });
    expect(res.status).toBe(201);
    expect(res.body.estado).toBe('ACTIVO');
    ganadoId = res.body.id_ganado;
  });

  test('POST /ganados rechaza campos obligatorios faltantes', async () => {
    const res = await request(app).post('/ganados').send({ id_rodeo: rodeoAId });
    expect(res.status).toBe(400);
  });

  test('POST /ganados rechaza id_rodeo inexistente', async () => {
    const res = await request(app).post('/ganados').send({
      id_rodeo: 999999,
      numero_identificacion: 'CARAVANA-002',
      sexo: 'M',
      categoria: 'TORO',
    });
    expect(res.status).toBe(400);
  });

  test('POST /ganados rechaza numero_identificacion duplicado', async () => {
    const res = await request(app).post('/ganados').send({
      id_rodeo: rodeoAId,
      numero_identificacion: 'CARAVANA-001',
      sexo: 'M',
      categoria: 'TORO',
    });
    expect(res.status).toBe(409);
  });

  test('GET /ganados/:id devuelve el animal creado', async () => {
    const res = await request(app).get(`/ganados/${ganadoId}`);
    expect(res.status).toBe(200);
    expect(res.body.numero_identificacion).toBe('CARAVANA-001');
  });

  test('GET /ganados/:id devuelve 404 para id inexistente', async () => {
    const res = await request(app).get('/ganados/999999');
    expect(res.status).toBe(404);
  });

  test('PATCH /ganados/:id actualiza peso y estado', async () => {
    const res = await request(app)
      .patch(`/ganados/${ganadoId}`)
      .send({ peso_kg: 450, estado: 'VENDIDO' });
    expect(res.status).toBe(200);
    expect(Number(res.body.peso_kg)).toBe(450);
    expect(res.body.estado).toBe('VENDIDO');
  });

  test('PATCH /ganados/:id/rodeo transfiere dentro de la misma estancia', async () => {
    const res = await request(app)
      .patch(`/ganados/${ganadoId}/rodeo`)
      .send({ id_rodeo: rodeoBId });
    expect(res.status).toBe(200);
    expect(res.body.id_rodeo).toBe(rodeoBId);
  });

  test('PATCH /ganados/:id/rodeo rechaza transferencia entre estancias', async () => {
    const res = await request(app)
      .patch(`/ganados/${ganadoId}/rodeo`)
      .send({ id_rodeo: rodeoOtraEstanciaId });
    expect(res.status).toBe(400);
  });

  test('GET /rodeos/:id/ganado refleja la transferencia', async () => {
    const rodeoARes = await request(app).get(`/rodeos/${rodeoAId}/ganado`);
    expect(rodeoARes.status).toBe(200);
    expect(rodeoARes.body.find((g) => g.id_ganado === ganadoId)).toBeUndefined();

    const rodeoBRes = await request(app).get(`/rodeos/${rodeoBId}/ganado`);
    expect(rodeoBRes.status).toBe(200);
    expect(rodeoBRes.body.find((g) => g.id_ganado === ganadoId)).toBeDefined();
  });

  test('GET /rodeos/:id/ganado devuelve 404 para rodeo inexistente', async () => {
    const res = await request(app).get('/rodeos/999999/ganado');
    expect(res.status).toBe(404);
  });
});
