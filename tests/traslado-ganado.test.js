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

// Potreros no solapados dentro de bigPolygon(): franjas de 0.3° separadas
// por 0.5°, así que hasta ~15 potreros por estancia caben sin chocar.
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
  const email = `traslado-fixture-${Date.now()}-${contadorUsuarios}@example.com`;

  await request(app).post('/api/v2/auth/registro').send({ nombre: 'Traslado Test', email, password: 'password123' });
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
    numero_identificacion: `TRASLADO-${Date.now()}-${contadorGanado}`,
    sexo: 'F',
    categoria: 'VAQUILLONA',
    peso_kg: 300,
    ...overrides,
  });
  return res.body;
}

async function crearGanadoSinPotrero(token, id_estancia, overrides = {}) {
  contadorGanado += 1;
  const res = await authHeader(request(app).post(`/api/v2/estancia/${id_estancia}/ganado`), token).send({
    numero_identificacion: `TRASLADO-SIN-POTRERO-${Date.now()}-${contadorGanado}`,
    sexo: 'M',
    categoria: 'NOVILLO',
    peso_kg: 280,
    ...overrides,
  });
  return res.body;
}

function crearTraslado(token, id_potrero_origen, body) {
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

describe('POST /api/v2/potrero/:potreroId/traslado-ganado', () => {
  let token, id_estancia, potreroOrigenId, potreroDestinoId;
  let tokenOtro, potreroOtroId;

  beforeAll(async () => {
    const fixture = await crearEstanciaConPotreros(3);
    token = fixture.token;
    id_estancia = fixture.id_estancia;
    [potreroOrigenId, potreroDestinoId] = fixture.potreroIds;

    const fixtureOtro = await crearEstanciaConPotreros(1);
    tokenOtro = fixtureOtro.token;
    [potreroOtroId] = fixtureOtro.potreroIds;
  });

  test('sin token de sesión devuelve 401', async () => {
    const res = await request(app).post(`/api/v2/potrero/${potreroOrigenId}/traslado-ganado`).send({});
    expect(res.status).toBe(401);
  });

  test('traslada un único animal: cierra la asignación origen y crea exactamente una activa en destino', async () => {
    const ganado = await crearGanadoEnPotrero(token, potreroOrigenId);

    const res = await crearTraslado(token, potreroOrigenId, {
      id_potrero_destino: potreroDestinoId,
      id_ganado: [ganado.id_ganado],
      fecha_movimiento: '2026-08-04T14:30:00.000Z',
      observaciones: 'Rotación planificada',
    });

    expect(res.status).toBe(201);
    expect(res.body.potrero_origen.id_potrero).toBe(potreroOrigenId);
    expect(res.body.potrero_destino.id_potrero).toBe(potreroDestinoId);
    expect(res.body.observaciones).toBe('Rotación planificada');
    expect(res.body.detalles).toHaveLength(1);

    const detalle = res.body.detalles[0];
    expect(detalle.id_ganado).toBe(ganado.id_ganado);
    expect(typeof detalle.id_asignacion_origen).toBe('number');
    expect(typeof detalle.id_asignacion_destino).toBe('number');
    expect(detalle.id_asignacion_origen).not.toBe(detalle.id_asignacion_destino);

    const getGanado = await authHeader(request(app).get(`/api/v2/ganado/${ganado.id_ganado}`), token);
    expect(getGanado.body.id_potrero_actual).toBe(potreroDestinoId);

    const listaOrigen = await authHeader(request(app).get(`/api/v2/potrero/${potreroOrigenId}/ganado`), token);
    expect(listaOrigen.body.find((g) => g.id_ganado === ganado.id_ganado)).toBeUndefined();

    const listaDestino = await authHeader(request(app).get(`/api/v2/potrero/${potreroDestinoId}/ganado`), token);
    expect(listaDestino.body.find((g) => g.id_ganado === ganado.id_ganado)).toBeDefined();

    const historial = await authHeader(request(app).get(`/api/v2/estancia/${id_estancia}/asignaciones-ganado`), token);
    const movimientos = historial.body.filter((a) => a.id_ganado === ganado.id_ganado);
    expect(movimientos).toHaveLength(2);

    const cerrada = movimientos.find((a) => a.id_asignacion === detalle.id_asignacion_origen);
    const abierta = movimientos.find((a) => a.id_asignacion === detalle.id_asignacion_destino);
    expect(cerrada).toMatchObject({ id_potrero: potreroOrigenId, estado: 'FINALIZADA' });
    expect(cerrada.fecha_hasta).not.toBeNull();
    expect(abierta).toMatchObject({ id_potrero: potreroDestinoId, estado: 'ACTIVA', fecha_hasta: null });
  });

  test('traslada múltiples animales en un solo lote', async () => {
    const g1 = await crearGanadoEnPotrero(token, potreroOrigenId);
    const g2 = await crearGanadoEnPotrero(token, potreroOrigenId);
    const g3 = await crearGanadoEnPotrero(token, potreroOrigenId);

    const res = await crearTraslado(token, potreroOrigenId, {
      id_potrero_destino: potreroDestinoId,
      id_ganado: [g1.id_ganado, g2.id_ganado, g3.id_ganado],
      fecha_movimiento: '2026-08-04T15:00:00.000Z',
    });

    expect(res.status).toBe(201);
    expect(res.body.detalles).toHaveLength(3);
    const idsEnDetalle = res.body.detalles.map((d) => d.id_ganado).sort((a, b) => a - b);
    expect(idsEnDetalle).toEqual([g1.id_ganado, g2.id_ganado, g3.id_ganado].sort((a, b) => a - b));

    const listaDestino = await authHeader(request(app).get(`/api/v2/potrero/${potreroDestinoId}/ganado`), token);
    for (const g of [g1, g2, g3]) {
      expect(listaDestino.body.find((x) => x.id_ganado === g.id_ganado)).toBeDefined();
    }
  });

  test('rechaza origen igual a destino', async () => {
    const ganado = await crearGanadoEnPotrero(token, potreroOrigenId);
    const res = await crearTraslado(token, potreroOrigenId, {
      id_potrero_destino: potreroOrigenId,
      id_ganado: [ganado.id_ganado],
      fecha_movimiento: '2026-08-04T15:10:00.000Z',
    });
    expect(res.status).toBe(400);

    const getGanado = await authHeader(request(app).get(`/api/v2/ganado/${ganado.id_ganado}`), token);
    expect(getGanado.body.id_potrero_actual).toBe(potreroOrigenId);
  });

  test('rechaza un potrero destino que no pertenece a la misma estancia/usuario', async () => {
    const ganado = await crearGanadoEnPotrero(token, potreroOrigenId);
    const res = await crearTraslado(token, potreroOrigenId, {
      id_potrero_destino: potreroOtroId,
      id_ganado: [ganado.id_ganado],
      fecha_movimiento: '2026-08-04T15:20:00.000Z',
    });
    expect(res.status).toBe(400);

    const getGanado = await authHeader(request(app).get(`/api/v2/ganado/${ganado.id_ganado}`), token);
    expect(getGanado.body.id_potrero_actual).toBe(potreroOrigenId);
  });

  test('rechaza animales que pertenecen a otra estancia', async () => {
    const ganadoAjeno = await crearGanadoEnPotrero(tokenOtro, potreroOtroId);
    const res = await crearTraslado(token, potreroOrigenId, {
      id_potrero_destino: potreroDestinoId,
      id_ganado: [ganadoAjeno.id_ganado],
      fecha_movimiento: '2026-08-04T15:30:00.000Z',
    });
    expect(res.status).toBe(400);

    const getGanadoAjeno = await authHeader(request(app).get(`/api/v2/ganado/${ganadoAjeno.id_ganado}`), tokenOtro);
    expect(getGanadoAjeno.body.id_potrero_actual).toBe(potreroOtroId);
  });

  test('rechaza animales sin asignación activa en el potrero origen', async () => {
    const ganadoSuelto = await crearGanadoSinPotrero(token, id_estancia);
    const res = await crearTraslado(token, potreroOrigenId, {
      id_potrero_destino: potreroDestinoId,
      id_ganado: [ganadoSuelto.id_ganado],
      fecha_movimiento: '2026-08-04T15:40:00.000Z',
    });
    expect(res.status).toBe(400);
  });

  test('hace rollback completo si algún animal del lote es inválido', async () => {
    const ganadoValido = await crearGanadoEnPotrero(token, potreroOrigenId);
    const res = await crearTraslado(token, potreroOrigenId, {
      id_potrero_destino: potreroDestinoId,
      id_ganado: [ganadoValido.id_ganado, 999999],
      fecha_movimiento: '2026-08-04T15:50:00.000Z',
    });
    expect(res.status).toBe(400);

    const getGanado = await authHeader(request(app).get(`/api/v2/ganado/${ganadoValido.id_ganado}`), token);
    expect(getGanado.body.id_potrero_actual).toBe(potreroOrigenId);

    const listaDestino = await authHeader(request(app).get(`/api/v2/potrero/${potreroDestinoId}/ganado`), token);
    expect(listaDestino.body.find((g) => g.id_ganado === ganadoValido.id_ganado)).toBeUndefined();
  });

  test('rechaza un arreglo vacío de id_ganado', async () => {
    const res = await crearTraslado(token, potreroOrigenId, {
      id_potrero_destino: potreroDestinoId,
      id_ganado: [],
      fecha_movimiento: '2026-08-04T16:00:00.000Z',
    });
    expect(res.status).toBe(400);
  });

  test('rechaza id_ganado con duplicados', async () => {
    const ganado = await crearGanadoEnPotrero(token, potreroOrigenId);
    const res = await crearTraslado(token, potreroOrigenId, {
      id_potrero_destino: potreroDestinoId,
      id_ganado: [ganado.id_ganado, ganado.id_ganado],
      fecha_movimiento: '2026-08-04T16:10:00.000Z',
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v2/traslado-ganado', () => {
  let token, id_estancia, p1, p2, p3;
  let gA, gB;

  beforeAll(async () => {
    const fixture = await crearEstanciaConPotreros(3);
    token = fixture.token;
    id_estancia = fixture.id_estancia;
    [p1, p2, p3] = fixture.potreroIds;

    gA = await crearGanadoEnPotrero(token, p1);
    gB = await crearGanadoEnPotrero(token, p1);
    const gC = await crearGanadoEnPotrero(token, p2);

    await crearTraslado(token, p1, {
      id_potrero_destino: p2,
      id_ganado: [gA.id_ganado],
      fecha_movimiento: '2026-01-05T10:00:00.000Z',
    });
    await crearTraslado(token, p1, {
      id_potrero_destino: p3,
      id_ganado: [gB.id_ganado],
      fecha_movimiento: '2026-01-15T10:00:00.000Z',
    });
    await crearTraslado(token, p2, {
      id_potrero_destino: p3,
      id_ganado: [gC.id_ganado],
      fecha_movimiento: '2026-01-25T10:00:00.000Z',
    });
  });

  test('sin filtros: ordena por fecha_movimiento DESC y devuelve el total', async () => {
    const res = await authHeader(request(app).get('/api/v2/traslado-ganado'), token);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.data.map((t) => t.fecha_movimiento)).toEqual([
      '2026-01-25T10:00:00.000Z',
      '2026-01-15T10:00:00.000Z',
      '2026-01-05T10:00:00.000Z',
    ]);
  });

  test('pagina los resultados con page y limit', async () => {
    const pagina1 = await authHeader(request(app).get('/api/v2/traslado-ganado?limit=2&page=1'), token);
    expect(pagina1.body.data).toHaveLength(2);
    expect(pagina1.body.total).toBe(3);
    expect(pagina1.body.totalPages).toBe(2);

    const pagina2 = await authHeader(request(app).get('/api/v2/traslado-ganado?limit=2&page=2'), token);
    expect(pagina2.body.data).toHaveLength(1);
  });

  test('filtra por id_potrero_origen', async () => {
    const res = await authHeader(request(app).get(`/api/v2/traslado-ganado?id_potrero_origen=${p1}`), token);
    expect(res.body.total).toBe(2);
  });

  test('filtra por id_potrero_destino', async () => {
    const res = await authHeader(request(app).get(`/api/v2/traslado-ganado?id_potrero_destino=${p3}`), token);
    expect(res.body.total).toBe(2);
  });

  test('filtra por rango de fechas desde/hasta', async () => {
    const res = await authHeader(
      request(app).get('/api/v2/traslado-ganado?desde=2026-01-10&hasta=2026-01-20'),
      token
    );
    expect(res.body.total).toBe(1);
    expect(res.body.data[0].fecha_movimiento).toBe('2026-01-15T10:00:00.000Z');
  });

  test('filtra por id_ganado', async () => {
    const res = await authHeader(request(app).get(`/api/v2/traslado-ganado?id_ganado=${gA.id_ganado}`), token);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0].fecha_movimiento).toBe('2026-01-05T10:00:00.000Z');
  });

  test('rechaza un estanciaId que no es el propio', async () => {
    const res = await authHeader(request(app).get(`/api/v2/traslado-ganado?estanciaId=${id_estancia + 999999}`), token);
    expect(res.status).toBe(404);
  });

  test('un usuario sin estancia recibe 404', async () => {
    const email = `traslado-sin-estancia-${Date.now()}@example.com`;
    await request(app).post('/api/v2/auth/registro').send({ nombre: 'Sin Estancia', email, password: 'password123' });
    const login = await request(app).post('/api/v2/auth/login').send({ email, password: 'password123' });
    usuariosCreados.push(login.body.usuario.id_usuario);

    const res = await authHeader(request(app).get('/api/v2/traslado-ganado'), login.body.token);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v2/traslado-ganado/:trasladoId', () => {
  let token, tokenOtro, potreroOrigenId, potreroDestinoId, trasladoId;

  beforeAll(async () => {
    const fixture = await crearEstanciaConPotreros(2);
    token = fixture.token;
    [potreroOrigenId, potreroDestinoId] = fixture.potreroIds;

    const fixtureOtro = await crearEstanciaConPotreros(1);
    tokenOtro = fixtureOtro.token;

    const ganado = await crearGanadoEnPotrero(token, potreroOrigenId);
    const creado = await crearTraslado(token, potreroOrigenId, {
      id_potrero_destino: potreroDestinoId,
      id_ganado: [ganado.id_ganado],
      fecha_movimiento: '2026-03-01T09:00:00.000Z',
    });
    trasladoId = creado.body.id_traslado;
  });

  test('devuelve la cabecera con potreros, usuario responsable y detalles', async () => {
    const res = await authHeader(request(app).get(`/api/v2/traslado-ganado/${trasladoId}`), token);
    expect(res.status).toBe(200);
    expect(res.body.id_traslado).toBe(trasladoId);
    expect(res.body.potrero_origen.id_potrero).toBe(potreroOrigenId);
    expect(res.body.potrero_destino.id_potrero).toBe(potreroDestinoId);
    expect(res.body.usuario).toBeDefined();
    expect(res.body.usuario.email).toBeDefined();
    expect(res.body.detalles).toHaveLength(1);
  });

  test('devuelve 404 para un id inexistente', async () => {
    const res = await authHeader(request(app).get('/api/v2/traslado-ganado/999999'), token);
    expect(res.status).toBe(404);
  });

  test('otro usuario recibe 404 al consultar un traslado ajeno', async () => {
    const res = await authHeader(request(app).get(`/api/v2/traslado-ganado/${trasladoId}`), tokenOtro);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v2/potrero/:potreroId/traslado-ganado', () => {
  let token, tokenOtro, p1, p2, p3;

  beforeAll(async () => {
    const fixture = await crearEstanciaConPotreros(3);
    token = fixture.token;
    [p1, p2, p3] = fixture.potreroIds;

    const fixtureOtro = await crearEstanciaConPotreros(1);
    tokenOtro = fixtureOtro.token;

    const gA = await crearGanadoEnPotrero(token, p1);
    await crearTraslado(token, p1, {
      id_potrero_destino: p2,
      id_ganado: [gA.id_ganado],
      fecha_movimiento: '2026-04-01T09:00:00.000Z',
    });

    const gB = await crearGanadoEnPotrero(token, p2);
    await crearTraslado(token, p2, {
      id_potrero_destino: p3,
      id_ganado: [gB.id_ganado],
      fecha_movimiento: '2026-04-05T09:00:00.000Z',
    });
  });

  test('direccion=entradas devuelve sólo los traslados que llegaron a ese potrero', async () => {
    const res = await authHeader(request(app).get(`/api/v2/potrero/${p2}/traslado-ganado?direccion=entradas`), token);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id_potrero_destino).toBe(p2);
  });

  test('direccion=salidas devuelve sólo los traslados que salieron de ese potrero', async () => {
    const res = await authHeader(request(app).get(`/api/v2/potrero/${p2}/traslado-ganado?direccion=salidas`), token);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id_potrero_origen).toBe(p2);
  });

  test('un potrero sin movimientos en esa dirección devuelve un arreglo vacío', async () => {
    const res = await authHeader(request(app).get(`/api/v2/potrero/${p1}/traslado-ganado?direccion=entradas`), token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('rechaza un valor de direccion inválido con 400', async () => {
    const res = await authHeader(request(app).get(`/api/v2/potrero/${p1}/traslado-ganado?direccion=lo-que-sea`), token);
    expect(res.status).toBe(400);
  });

  test('otro usuario recibe 404 sobre un potrero ajeno', async () => {
    const res = await authHeader(request(app).get(`/api/v2/potrero/${p1}/traslado-ganado?direccion=entradas`), tokenOtro);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v2/ganado/:ganadoId/recorrido', () => {
  let token, tokenOtro, p1, p2, p3, ganado;

  beforeAll(async () => {
    const fixture = await crearEstanciaConPotreros(3);
    token = fixture.token;
    [p1, p2, p3] = fixture.potreroIds;

    const fixtureOtro = await crearEstanciaConPotreros(1);
    tokenOtro = fixtureOtro.token;

    ganado = await crearGanadoEnPotrero(token, p1);
    await crearTraslado(token, p1, {
      id_potrero_destino: p2,
      id_ganado: [ganado.id_ganado],
      fecha_movimiento: '2026-05-01T09:00:00.000Z',
    });
    await crearTraslado(token, p2, {
      id_potrero_destino: p3,
      id_ganado: [ganado.id_ganado],
      fecha_movimiento: '2026-05-10T09:00:00.000Z',
    });
  });

  test('devuelve el recorrido ordenado cronológicamente', async () => {
    const res = await authHeader(request(app).get(`/api/v2/ganado/${ganado.id_ganado}/recorrido`), token);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({
      fecha_movimiento: '2026-05-01T09:00:00.000Z',
      potrero_origen: { id_potrero: p1 },
      potrero_destino: { id_potrero: p2 },
    });
    expect(res.body[1]).toMatchObject({
      fecha_movimiento: '2026-05-10T09:00:00.000Z',
      potrero_origen: { id_potrero: p2 },
      potrero_destino: { id_potrero: p3 },
    });
  });

  test('acepta filtros desde/hasta', async () => {
    const res = await authHeader(
      request(app).get(`/api/v2/ganado/${ganado.id_ganado}/recorrido?desde=2026-05-05`),
      token
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].fecha_movimiento).toBe('2026-05-10T09:00:00.000Z');
  });

  test('otro usuario recibe 404 al consultar el recorrido de un animal ajeno', async () => {
    const res = await authHeader(request(app).get(`/api/v2/ganado/${ganado.id_ganado}/recorrido`), tokenOtro);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v2/estancia/:estanciaId/analiticas/traslado-ganado', () => {
  let token, id_estancia, p1, p2, p3;

  beforeAll(async () => {
    const fixture = await crearEstanciaConPotreros(3);
    token = fixture.token;
    id_estancia = fixture.id_estancia;
    [p1, p2, p3] = fixture.potreroIds;

    const gA = await crearGanadoEnPotrero(token, p1);
    const gB = await crearGanadoEnPotrero(token, p1);
    const gC = await crearGanadoEnPotrero(token, p1);

    // t1: p1 -> p2, 2 animales.
    await crearTraslado(token, p1, {
      id_potrero_destino: p2,
      id_ganado: [gA.id_ganado, gB.id_ganado],
      fecha_movimiento: '2026-02-01T10:00:00.000Z',
    });
    // t2: p1 -> p3, 1 animal.
    await crearTraslado(token, p1, {
      id_potrero_destino: p3,
      id_ganado: [gC.id_ganado],
      fecha_movimiento: '2026-02-05T10:00:00.000Z',
    });
    // t3: p2 -> p3, 1 animal (gA, que ya había llegado a p2 en t1).
    await crearTraslado(token, p2, {
      id_potrero_destino: p3,
      id_ganado: [gA.id_ganado],
      fecha_movimiento: '2026-02-10T10:00:00.000Z',
    });
  });

  test('agrega totales, entradas/salidas por potrero, matriz origen-destino y último traslado por potrero', async () => {
    const res = await authHeader(request(app).get(`/api/v2/estancia/${id_estancia}/analiticas/traslado-ganado`), token);
    expect(res.status).toBe(200);

    expect(res.body.totalTraslados).toBe(3);
    expect(res.body.totalAnimalesMovidos).toBe(4);

    const entradasP2 = res.body.entradasPorPotrero.find((e) => e.id_potrero === p2);
    const entradasP3 = res.body.entradasPorPotrero.find((e) => e.id_potrero === p3);
    expect(Number(entradasP2.cantidad_animales)).toBe(2);
    expect(Number(entradasP3.cantidad_animales)).toBe(2);

    const salidasP1 = res.body.salidasPorPotrero.find((s) => s.id_potrero === p1);
    const salidasP2 = res.body.salidasPorPotrero.find((s) => s.id_potrero === p2);
    expect(Number(salidasP1.cantidad_animales)).toBe(3);
    expect(Number(salidasP2.cantidad_animales)).toBe(1);

    const rutaP1P2 = res.body.matrizOrigenDestino.find(
      (r) => r.id_potrero_origen === p1 && r.id_potrero_destino === p2
    );
    expect(Number(rutaP1P2.cantidad_animales)).toBe(2);

    expect(res.body.rutasMasFrecuentes.length).toBeGreaterThan(0);
    expect(res.body.rutasMasFrecuentes[0]).toMatchObject({ id_potrero_origen: p1, id_potrero_destino: p2 });

    const ultimoP1 = res.body.ultimoTrasladoPorPotrero.find((u) => u.id_potrero === p1);
    const ultimoP2 = res.body.ultimoTrasladoPorPotrero.find((u) => u.id_potrero === p2);
    const ultimoP3 = res.body.ultimoTrasladoPorPotrero.find((u) => u.id_potrero === p3);
    expect(ultimoP1.fecha_movimiento).toBe('2026-02-05T10:00:00.000Z');
    expect(ultimoP2.fecha_movimiento).toBe('2026-02-10T10:00:00.000Z');
    expect(ultimoP3.fecha_movimiento).toBe('2026-02-10T10:00:00.000Z');
  });

  test('acepta un período desde/hasta que acota los totales', async () => {
    const res = await authHeader(
      request(app).get(`/api/v2/estancia/${id_estancia}/analiticas/traslado-ganado?desde=2026-02-03`),
      token
    );
    expect(res.status).toBe(200);
    expect(res.body.totalTraslados).toBe(2);
    expect(res.body.totalAnimalesMovidos).toBe(2);
  });
});
