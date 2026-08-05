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

function potreroPolygon(index) {
  const lon0 = -69 + index * 0.5;
  const lat0 = -39;
  return polygon([
    [lon0, lat0],
    [lon0 + 0.3, lat0],
    [lon0 + 0.3, lat0 + 0.3],
    [lon0, lat0 + 0.3],
    [lon0, lat0],
  ]);
}

const usuariosCreados = [];
let contadorGanado = 0;
let contadorUsuarios = 0;

async function crearEstanciaConPotreros(cantidadPotreros) {
  contadorUsuarios += 1;
  const email = `asig-consulta-${Date.now()}-${contadorUsuarios}@example.com`;

  await request(app).post('/api/v2/auth/registro').send({ nombre: 'Asig Consulta Test', email, password: 'password123' });
  const login = await request(app).post('/api/v2/auth/login').send({ email, password: 'password123' });
  const token = login.body.token;
  const id_usuario = login.body.usuario.id_usuario;
  usuariosCreados.push(id_usuario);

  const estancia = await request(app)
    .post('/api/v2/estancia')
    .set('Authorization', `Bearer ${token}`)
    .send({ nombre: `Estancia ${email}`, geom: bigPolygon() });
  const id_estancia = estancia.body.id_estancia;

  const potreroIds = [];
  for (let i = 0; i < cantidadPotreros; i += 1) {
    const potrero = await request(app)
      .post(`/api/v2/estancia/${id_estancia}/potrero`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: `Potrero ${i}`, geom: potreroPolygon(i) });
    potreroIds.push(potrero.body.id_potrero);
  }

  return { token, id_usuario, id_estancia, potreroIds };
}

function authHeader(req, token) {
  return req.set('Authorization', `Bearer ${token}`);
}

async function crearGanadoEnPotrero(token, id_potrero, overrides = {}) {
  contadorGanado += 1;
  const res = await authHeader(request(app).post(`/api/v2/potrero/${id_potrero}/ganado`), token).send({
    numero_identificacion: `ASIG-CONSULTA-${Date.now()}-${contadorGanado}`,
    sexo: 'F',
    categoria: 'VAQUILLONA',
    peso_kg: 300,
    ...overrides,
  });
  return res.body;
}

function trasladar(token, id_potrero_origen, body) {
  return authHeader(request(app).post(`/api/v2/potrero/${id_potrero_origen}/traslado-ganado`), token).send(body);
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
        await sequelize.query(
          'DELETE FROM traslado_ganado_detalle WHERE id_traslado IN (SELECT id_traslado FROM traslado_ganado WHERE id_estancia IN (:estanciaIds))',
          { replacements: { estanciaIds } }
        );
        await sequelize.query('DELETE FROM traslado_ganado WHERE id_estancia IN (:estanciaIds)', {
          replacements: { estanciaIds },
        });
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

describe('GET /api/v2/estancia/:estanciaId/asignaciones-ganado (filtros)', () => {
  let token, id_estancia, p1, p2, p3, gA, gB, gC;

  beforeAll(async () => {
    const fixture = await crearEstanciaConPotreros(3);
    token = fixture.token;
    id_estancia = fixture.id_estancia;
    [p1, p2, p3] = fixture.potreroIds;

    gA = await crearGanadoEnPotrero(token, p1);
    gB = await crearGanadoEnPotrero(token, p1);
    gC = await crearGanadoEnPotrero(token, p1);

    await trasladar(token, p1, {
      id_potrero_destino: p2,
      id_ganado: [gA.id_ganado],
      fecha_movimiento: new Date().toISOString(),
    });
    await trasladar(token, p1, {
      id_potrero_destino: p3,
      id_ganado: [gC.id_ganado],
      fecha_movimiento: '2020-01-15T10:00:00.000Z',
    });
  });

  test('sin filtros devuelve las 5 asignaciones (3 altas + 2 traslados)', async () => {
    const res = await authHeader(request(app).get(`/api/v2/estancia/${id_estancia}/asignaciones-ganado`), token);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(5);
  });

  test('vigente=true devuelve sólo las 3 activas', async () => {
    const res = await authHeader(
      request(app).get(`/api/v2/estancia/${id_estancia}/asignaciones-ganado?vigente=true`),
      token
    );
    expect(res.body).toHaveLength(3);
    expect(res.body.every((a) => a.fecha_hasta === null)).toBe(true);
  });

  test('vigente=false devuelve sólo las 2 cerradas', async () => {
    const res = await authHeader(
      request(app).get(`/api/v2/estancia/${id_estancia}/asignaciones-ganado?vigente=false`),
      token
    );
    expect(res.body).toHaveLength(2);
    expect(res.body.every((a) => a.fecha_hasta !== null)).toBe(true);
  });

  test('filtra por id_potrero', async () => {
    const enP1 = await authHeader(
      request(app).get(`/api/v2/estancia/${id_estancia}/asignaciones-ganado?id_potrero=${p1}`),
      token
    );
    expect(enP1.body).toHaveLength(3);

    const enP2 = await authHeader(
      request(app).get(`/api/v2/estancia/${id_estancia}/asignaciones-ganado?id_potrero=${p2}`),
      token
    );
    expect(enP2.body).toHaveLength(1);
    expect(enP2.body[0].id_ganado).toBe(gA.id_ganado);
  });

  test('filtra por id_ganado', async () => {
    const res = await authHeader(
      request(app).get(`/api/v2/estancia/${id_estancia}/asignaciones-ganado?id_ganado=${gC.id_ganado}`),
      token
    );
    expect(res.body).toHaveLength(2);
    expect(res.body.every((a) => a.id_ganado === gC.id_ganado)).toBe(true);
  });

  test('filtra por rango de fecha_desde con desde/hasta', async () => {
    const res = await authHeader(
      request(app).get(
        `/api/v2/estancia/${id_estancia}/asignaciones-ganado?desde=2020-01-01&hasta=2020-02-01`
      ),
      token
    );
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ id_ganado: gC.id_ganado, id_potrero: p3 });
  });
});

describe('GET /api/v2/potrero/:potreroId/asignaciones-ganado', () => {
  let token, tokenOtro, p1, p2, gA, gB;

  beforeAll(async () => {
    const fixture = await crearEstanciaConPotreros(2);
    token = fixture.token;
    [p1, p2] = fixture.potreroIds;

    const fixtureOtro = await crearEstanciaConPotreros(1);
    tokenOtro = fixtureOtro.token;

    gA = await crearGanadoEnPotrero(token, p1);
    gB = await crearGanadoEnPotrero(token, p1);

    await trasladar(token, p1, {
      id_potrero_destino: p2,
      id_ganado: [gA.id_ganado],
      fecha_movimiento: new Date().toISOString(),
    });
  });

  test('devuelve todo el histórico del potrero, no sólo lo vigente', async () => {
    const res = await authHeader(request(app).get(`/api/v2/potrero/${p1}/asignaciones-ganado`), token);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  test('vigente=true acota a la asignación activa de ese potrero', async () => {
    const res = await authHeader(request(app).get(`/api/v2/potrero/${p1}/asignaciones-ganado?vigente=true`), token);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id_ganado).toBe(gB.id_ganado);
  });

  test('el potrero destino sólo tiene la asignación abierta por el traslado', async () => {
    const res = await authHeader(request(app).get(`/api/v2/potrero/${p2}/asignaciones-ganado`), token);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ id_ganado: gA.id_ganado, estado: 'ACTIVA', fecha_hasta: null });
  });

  test('filtra por id_ganado', async () => {
    const res = await authHeader(
      request(app).get(`/api/v2/potrero/${p1}/asignaciones-ganado?id_ganado=${gA.id_ganado}`),
      token
    );
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id_ganado).toBe(gA.id_ganado);
  });

  test('otro usuario recibe 404 sobre un potrero ajeno', async () => {
    const res = await authHeader(request(app).get(`/api/v2/potrero/${p1}/asignaciones-ganado`), tokenOtro);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v2/ganado/:ganadoId/asignaciones', () => {
  let token, tokenOtro, p1, p2, p3, ganado;

  beforeAll(async () => {
    const fixture = await crearEstanciaConPotreros(3);
    token = fixture.token;
    [p1, p2, p3] = fixture.potreroIds;

    const fixtureOtro = await crearEstanciaConPotreros(1);
    tokenOtro = fixtureOtro.token;

    ganado = await crearGanadoEnPotrero(token, p1);
    await trasladar(token, p1, {
      id_potrero_destino: p2,
      id_ganado: [ganado.id_ganado],
      fecha_movimiento: '2021-06-01T10:00:00.000Z',
    });
    await trasladar(token, p2, {
      id_potrero_destino: p3,
      id_ganado: [ganado.id_ganado],
      fecha_movimiento: '2022-06-01T10:00:00.000Z',
    });
  });

  test('devuelve las 3 asignaciones del animal, ordenadas por fecha_desde DESC', async () => {
    const res = await authHeader(request(app).get(`/api/v2/ganado/${ganado.id_ganado}/asignaciones`), token);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    // La primera (alta en p1) tiene fecha_desde = hoy, más reciente que
    // las dos fechas fijas de 2021/2022 usadas en los traslados.
    expect(res.body[0].id_potrero).toBe(p1);
    expect(res.body.map((a) => a.id_potrero).sort((a, b) => a - b)).toEqual([p1, p2, p3].sort((a, b) => a - b));
  });

  test('vigente=true devuelve sólo la asignación activa', async () => {
    const res = await authHeader(
      request(app).get(`/api/v2/ganado/${ganado.id_ganado}/asignaciones?vigente=true`),
      token
    );
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ id_potrero: p3, estado: 'ACTIVA', fecha_hasta: null });
  });

  test('filtra por rango de fecha_desde con desde/hasta', async () => {
    const res = await authHeader(
      request(app).get(`/api/v2/ganado/${ganado.id_ganado}/asignaciones?desde=2021-01-01&hasta=2021-12-31`),
      token
    );
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id_potrero).toBe(p2);
  });

  test('otro usuario recibe 404 al consultar las asignaciones de un animal ajeno', async () => {
    const res = await authHeader(request(app).get(`/api/v2/ganado/${ganado.id_ganado}/asignaciones`), tokenOtro);
    expect(res.status).toBe(404);
  });
});
