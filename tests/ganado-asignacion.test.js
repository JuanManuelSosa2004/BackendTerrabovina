'use strict';

process.env.NODE_ENV = 'test';

const request = require('supertest');
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

const otroPotreroPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [-60.11, -34.68],
      [-60.05, -34.68],
      [-60.05, -34.62],
      [-60.11, -34.62],
      [-60.11, -34.68],
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
let tokenA;
let tokenB;
let estanciaId;
let otraEstanciaId;
let potreroId;
let otroPotreroId;
let potreroOtraEstanciaId;

function authA(req) {
  return req.set('Authorization', `Bearer ${tokenA}`);
}
function authB(req) {
  return req.set('Authorization', `Bearer ${tokenB}`);
}

beforeAll(async () => {
  await sequelize.authenticate();

  await request(app).post('/api/v2/auth/registro').send({
    nombre: 'Test Ganado User',
    email: 'test-ganado@example.com',
    password: 'password123',
  });
  const loginA = await request(app)
    .post('/api/v2/auth/login')
    .send({ email: 'test-ganado@example.com', password: 'password123' });
  tokenA = loginA.body.token;
  usuarioId = loginA.body.usuario.id_usuario;

  await request(app).post('/api/v2/auth/registro').send({
    nombre: 'Test Ganado User 2',
    email: 'test-ganado-2@example.com',
    password: 'password123',
  });
  const loginB = await request(app)
    .post('/api/v2/auth/login')
    .send({ email: 'test-ganado-2@example.com', password: 'password123' });
  tokenB = loginB.body.token;
  usuarioOtroId = loginB.body.usuario.id_usuario;

  const estanciaRes = await authA(request(app).post('/api/v2/estancia')).send({
    nombre: 'Estancia Ganado Test',
    geom: estanciaPolygon,
  });
  estanciaId = estanciaRes.body.id_estancia;

  const otraEstanciaRes = await authB(request(app).post('/api/v2/estancia')).send({
    nombre: 'Otra Estancia Ganado Test',
    geom: otraEstanciaPolygon,
  });
  otraEstanciaId = otraEstanciaRes.body.id_estancia;

  const potreroRes = await authA(request(app).post(`/api/v2/estancia/${estanciaId}/potrero`)).send({
    nombre: 'Potrero Ganado Test',
    geom: potreroPolygon,
  });
  potreroId = potreroRes.body.id_potrero;

  const otroPotreroRes = await authA(request(app).post(`/api/v2/estancia/${estanciaId}/potrero`)).send({
    nombre: 'Otro Potrero Ganado Test',
    geom: otroPotreroPolygon,
  });
  otroPotreroId = otroPotreroRes.body.id_potrero;

  const potreroOtraEstanciaRes = await authB(request(app).post(`/api/v2/estancia/${otraEstanciaId}/potrero`)).send({
    nombre: 'Potrero Otra Estancia Test',
    geom: potreroOtraEstanciaPolygon,
  });
  potreroOtraEstanciaId = potreroOtraEstanciaRes.body.id_potrero;
});

afterAll(async () => {
  const estanciaIds = [estanciaId, otraEstanciaId];
  await sequelize.query(
    'DELETE FROM asignacion_ganado WHERE id_ganado IN (SELECT id_ganado FROM ganado WHERE id_estancia IN (:estanciaIds))',
    { replacements: { estanciaIds } }
  );
  await sequelize.query('DELETE FROM ganado WHERE id_estancia IN (:estanciaIds)', { replacements: { estanciaIds } });
  await sequelize.query('DELETE FROM potrero WHERE id_estancia IN (:estanciaIds)', { replacements: { estanciaIds } });
  await sequelize.query('DELETE FROM estancia WHERE id_estancia IN (:estanciaIds)', { replacements: { estanciaIds } });
  await sequelize.query('DELETE FROM usuario WHERE id_usuario IN (:ids)', {
    replacements: { ids: [usuarioId, usuarioOtroId] },
  });
  await sequelize.close();
});

describe('Ganado', () => {
  let ganadoId;

  test('POST /api/v2/estancia/:id/ganado crea un animal sin potrero', async () => {
    const res = await authA(request(app).post(`/api/v2/estancia/${estanciaId}/ganado`)).send({
      numero_identificacion: 'CARAVANA-001',
      sexo: 'F',
      categoria: 'VACA',
      peso_kg: 420.5,
      condicion_corporal: 3.5,
    });
    expect(res.status).toBe(201);
    expect(res.body.id_estancia).toBe(estanciaId);
    expect(res.body.id_potrero_actual).toBeNull();
    expect(res.body.activo).toBe(1);
    ganadoId = res.body.id_ganado;
  });

  test('rechaza campos obligatorios faltantes', async () => {
    const res = await authA(request(app).post(`/api/v2/estancia/${estanciaId}/ganado`)).send({
      sexo: 'F',
    });
    expect(res.status).toBe(400);
  });

  test('exige condicion_corporal para categoria VACA', async () => {
    const res = await authA(request(app).post(`/api/v2/estancia/${estanciaId}/ganado`)).send({
      numero_identificacion: 'CARAVANA-VACA-SIN-CC',
      sexo: 'F',
      categoria: 'VACA',
      peso_kg: 400,
    });
    expect(res.status).toBe(400);
  });

  test('rechaza numero_identificacion duplicado', async () => {
    const res = await authA(request(app).post(`/api/v2/estancia/${estanciaId}/ganado`)).send({
      numero_identificacion: 'CARAVANA-001',
      sexo: 'M',
      categoria: 'TORO',
      peso_kg: 600,
    });
    expect(res.status).toBe(409);
  });

  test('GET /api/v2/ganado/:id devuelve el animal creado', async () => {
    const res = await authA(request(app).get(`/api/v2/ganado/${ganadoId}`));
    expect(res.status).toBe(200);
    expect(res.body.numero_identificacion).toBe('CARAVANA-001');
  });

  test('GET /api/v2/ganado/:id devuelve 404 para id inexistente', async () => {
    const res = await authA(request(app).get('/api/v2/ganado/999999'));
    expect(res.status).toBe(404);
  });

  test('GET /api/v2/ganado/:id devuelve 404 para un animal de otro usuario', async () => {
    const res = await authB(request(app).get(`/api/v2/ganado/${ganadoId}`));
    expect(res.status).toBe(404);
  });

  test('PATCH /api/v2/ganado/:id actualiza peso y estado fisiológico', async () => {
    const res = await authA(request(app).patch(`/api/v2/ganado/${ganadoId}`)).send({
      peso_kg: 450,
      estado_fisiologico: 'L',
    });
    expect(res.status).toBe(200);
    expect(Number(res.body.peso_kg)).toBe(450);
    expect(res.body.estado_fisiologico).toBe('L');
  });

  test('POST /api/v2/potrero/:id/ganado crea el animal ya asignado', async () => {
    const res = await authA(request(app).post(`/api/v2/potrero/${potreroId}/ganado`)).send({
      numero_identificacion: 'CARAVANA-002',
      sexo: 'M',
      categoria: 'NOVILLO',
      peso_kg: 300,
    });
    expect(res.status).toBe(201);
    expect(res.body.id_potrero_actual).toBe(potreroId);
  });

  test('DELETE /api/v2/ganado/:id da de baja el animal', async () => {
    const res = await authA(request(app).delete(`/api/v2/ganado/${ganadoId}`));
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);

    const listado = await authA(request(app).get(`/api/v2/estancia/${estanciaId}/ganado`));
    expect(listado.body.find((g) => g.id_ganado === ganadoId)).toBeUndefined();
  });
});

describe('Asignación de ganado', () => {
  let ganadoAId;
  let ganadoBId;
  let ganadoOtraEstanciaId;

  beforeAll(async () => {
    const ganadoA = await authA(request(app).post(`/api/v2/estancia/${estanciaId}/ganado`)).send({
      numero_identificacion: 'ASIG-001',
      sexo: 'F',
      categoria: 'VAQUILLONA',
      peso_kg: 250,
    });
    ganadoAId = ganadoA.body.id_ganado;

    const ganadoB = await authA(request(app).post(`/api/v2/potrero/${potreroId}/ganado`)).send({
      numero_identificacion: 'ASIG-002',
      sexo: 'F',
      categoria: 'VAQUILLONA',
      peso_kg: 260,
    });
    ganadoBId = ganadoB.body.id_ganado;

    const ganadoOtraEstancia = await authB(request(app).post(`/api/v2/estancia/${otraEstanciaId}/ganado`)).send({
      numero_identificacion: 'ASIG-OTRA-001',
      sexo: 'F',
      categoria: 'VAQUILLONA',
      peso_kg: 240,
    });
    ganadoOtraEstanciaId = ganadoOtraEstancia.body.id_ganado;
  });

  test('POST /api/v2/asignacion-ganado mueve un animal sin potrero', async () => {
    const res = await authA(request(app).post('/api/v2/asignacion-ganado')).send({
      id_ganado: ganadoAId,
      id_potrero: potreroId,
    });
    expect(res.status).toBe(201);
    expect(res.body.id_ganado).toBe(ganadoAId);
    expect(res.body.id_potrero).toBe(potreroId);
    expect(res.body.fecha_hasta).toBeNull();
  });

  test('rechaza mover un animal de otra estancia', async () => {
    const res = await authA(request(app).post('/api/v2/asignacion-ganado')).send({
      id_ganado: ganadoOtraEstanciaId,
      id_potrero: potreroId,
    });
    expect(res.status).toBe(400);
  });

  test('rechaza un potrero que no pertenece al usuario', async () => {
    const res = await authA(request(app).post('/api/v2/asignacion-ganado')).send({
      id_ganado: ganadoAId,
      id_potrero: potreroOtraEstanciaId,
    });
    expect(res.status).toBe(400);
  });

  test('mover a un segundo potrero cierra la asignación anterior', async () => {
    const res = await authA(request(app).post('/api/v2/asignacion-ganado')).send({
      id_ganado: ganadoAId,
      id_potrero: otroPotreroId,
    });
    expect(res.status).toBe(201);
    expect(res.body.id_potrero).toBe(otroPotreroId);

    const enPotreroOriginal = await authA(request(app).get(`/api/v2/potrero/${potreroId}/ganado`));
    expect(enPotreroOriginal.body.find((g) => g.id_ganado === ganadoAId)).toBeUndefined();

    const enPotreroNuevo = await authA(request(app).get(`/api/v2/potrero/${otroPotreroId}/ganado`));
    expect(enPotreroNuevo.body.find((g) => g.id_ganado === ganadoAId)).toBeDefined();
  });

  test('el historial de la estancia refleja los movimientos', async () => {
    const res = await authA(request(app).get(`/api/v2/estancia/${estanciaId}/asignaciones-ganado`));
    expect(res.status).toBe(200);
    const movimientosDeA = res.body.filter((a) => a.id_ganado === ganadoAId);
    expect(movimientosDeA.length).toBe(2);
    expect(movimientosDeA.filter((a) => a.fecha_hasta === null).length).toBe(1);
  });

  test('GET /api/v2/asignacion-ganado/:id devuelve 404 para otro usuario', async () => {
    const historial = await authA(request(app).get(`/api/v2/estancia/${estanciaId}/asignaciones-ganado`));
    const asignacionId = historial.body[0].id_asignacion;

    const propia = await authA(request(app).get(`/api/v2/asignacion-ganado/${asignacionId}`));
    expect(propia.status).toBe(200);

    const ajena = await authB(request(app).get(`/api/v2/asignacion-ganado/${asignacionId}`));
    expect(ajena.status).toBe(404);
  });

  test('GET /api/v2/potrero/:id/ganado lista sólo el ganado con asignación vigente', async () => {
    const res = await authA(request(app).get(`/api/v2/potrero/${potreroId}/ganado`));
    expect(res.status).toBe(200);
    expect(res.body.find((g) => g.id_ganado === ganadoBId)).toBeDefined();
    expect(res.body.find((g) => g.id_ganado === ganadoAId)).toBeUndefined();
  });
});

describe('Potrero - baja lógica y desvinculación de ganado', () => {
  const potreroBajaPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [-60.19, -34.52],
        [-60.15, -34.52],
        [-60.15, -34.51],
        [-60.19, -34.51],
        [-60.19, -34.52],
      ],
    ],
  };

  let potreroBajaId;
  let ganadoLigadoId;

  beforeAll(async () => {
    const potreroRes = await authA(request(app).post(`/api/v2/estancia/${estanciaId}/potrero`)).send({
      nombre: 'Potrero A Eliminar',
      geom: potreroBajaPolygon,
    });
    potreroBajaId = potreroRes.body.id_potrero;

    const ganadoRes = await authA(request(app).post(`/api/v2/potrero/${potreroBajaId}/ganado`)).send({
      numero_identificacion: 'BAJA-001',
      sexo: 'F',
      categoria: 'VAQUILLONA',
      peso_kg: 230,
    });
    ganadoLigadoId = ganadoRes.body.id_ganado;
  });

  test('DELETE /api/v2/potrero/:id devuelve 404 si no existe', async () => {
    const res = await authA(request(app).delete('/api/v2/potrero/999999'));
    expect(res.status).toBe(404);
  });

  test('sin confirm devuelve advertencia con animales afectados', async () => {
    const res = await authA(request(app).delete(`/api/v2/potrero/${potreroBajaId}`));
    expect(res.status).toBe(409);
    expect(res.body.requiresConfirmation).toBe(true);
    expect(res.body.animalesAfectados).toBe(1);
  });

  test('?confirm=true cierra las asignaciones y da de baja el potrero', async () => {
    const res = await authA(request(app).delete(`/api/v2/potrero/${potreroBajaId}?confirm=true`));
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    expect(res.body.animalesDesvinculados).toBe(1);

    const ganadoRes = await authA(request(app).get(`/api/v2/ganado/${ganadoLigadoId}`));
    expect(ganadoRes.status).toBe(200);
    expect(ganadoRes.body.id_potrero_actual).toBeNull();

    // Baja lógica, no DELETE físico: el potrero sigue siendo consultable
    // (conserva el historial de asignaciones y estimaciones).
    const potreroRes = await authA(request(app).get(`/api/v2/potrero/${potreroBajaId}`));
    expect(potreroRes.status).toBe(200);
    expect(potreroRes.body.activo).toBe(0);
  });
});
