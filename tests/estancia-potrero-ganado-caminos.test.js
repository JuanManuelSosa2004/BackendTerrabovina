'use strict';

// Cobertura exhaustiva (caminos felices y no felices) para el grupo de
// endpoints de estancia (#7, #9, #10), potrero (#12-16) y ganado (#17-22).
// Cada describe usa su propio fixture aislado (usuario/estancia/potreros
// propios) para no interferir con geometria.test.js ni
// ganado-asignacion.test.js, que ya cubren buena parte del camino feliz.

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

// Cajas de 0.3° separadas por 0.5°: hasta ~19 potreros por estancia sin
// solaparse entre sí, todas dentro de bigPolygon().
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

function polygonBowtie() {
  return polygon([
    [-59.93, -33.97],
    [-59.92, -33.96],
    [-59.92, -33.97],
    [-59.93, -33.96],
    [-59.93, -33.97],
  ]);
}

function polygonFueraDeEstancia() {
  return polygon([
    [10, 10],
    [11, 10],
    [11, 11],
    [10, 11],
    [10, 10],
  ]);
}

const usuariosCreados = [];
let contador = 0;
let contadorUsuarios = 0;

function authHeader(req, token) {
  return req.set('Authorization', `Bearer ${token}`);
}

async function crearUsuario() {
  contadorUsuarios += 1;
  const email = `crud-${Date.now()}-${contadorUsuarios}@example.com`;
  await request(app).post('/api/v2/auth/registro').send({ nombre: 'CRUD Test', email, password: 'password123' });
  const login = await request(app).post('/api/v2/auth/login').send({ email, password: 'password123' });
  usuariosCreados.push(login.body.usuario.id_usuario);
  return { token: login.body.token, id_usuario: login.body.usuario.id_usuario };
}

function crearEstanciaPropia(token, overrides = {}) {
  return authHeader(request(app).post('/api/v2/estancia'), token).send({
    nombre: 'Estancia CRUD',
    geom: bigPolygon(),
    ...overrides,
  });
}

function crearPotreroPropio(token, id_estancia, overrides = {}) {
  contador += 1;
  return authHeader(request(app).post(`/api/v2/estancia/${id_estancia}/potrero`), token).send({
    nombre: `Potrero CRUD ${contador}`,
    geom: potreroPolygon(0),
    ...overrides,
  });
}

function crearGanadoEnEstancia(token, id_estancia, overrides = {}) {
  contador += 1;
  return authHeader(request(app).post(`/api/v2/estancia/${id_estancia}/ganado`), token).send({
    numero_identificacion: `CRUD-${Date.now()}-${contador}`,
    sexo: 'F',
    categoria: 'VAQUILLONA',
    peso_kg: 300,
    ...overrides,
  });
}

function crearGanadoEnPotrero(token, id_potrero, overrides = {}) {
  contador += 1;
  return authHeader(request(app).post(`/api/v2/potrero/${id_potrero}/ganado`), token).send({
    numero_identificacion: `CRUD-POT-${Date.now()}-${contador}`,
    sexo: 'F',
    categoria: 'VAQUILLONA',
    peso_kg: 300,
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

describe('POST /api/v2/estancia (#7)', () => {
  let token;

  beforeAll(async () => {
    ({ token } = await crearUsuario());
  });

  test('crea la estancia con todos los campos', async () => {
    const res = await crearEstanciaPropia(token, {
      nombre: 'Estancia Completa',
      departamento: 'Depto',
      provincia: 'Provincia',
      superficie_total_ha: 100.5,
    });
    expect(res.status).toBe(201);
    expect(res.body.id_estancia).toBeDefined();
    expect(res.body.nombre).toBe('Estancia Completa');
    expect(res.body.departamento).toBe('Depto');
    expect(res.body.provincia).toBe('Provincia');
    expect(Number(res.body.superficie_total_ha)).toBe(100.5);
    expect(res.body.geom).toEqual(bigPolygon());
  });

  test('rechaza sin nombre', async () => {
    const res = await authHeader(request(app).post('/api/v2/estancia'), token).send({ geom: bigPolygon() });
    expect(res.status).toBe(400);
  });

  test('rechaza sin geom', async () => {
    const res = await authHeader(request(app).post('/api/v2/estancia'), token).send({ nombre: 'Sin Geom' });
    expect(res.status).toBe(400);
  });

  test('rechaza un polígono autointersectante', async () => {
    const res = await authHeader(request(app).post('/api/v2/estancia'), token).send({
      nombre: 'Bowtie',
      geom: polygonBowtie(),
    });
    expect(res.status).toBe(400);
  });

  test('rechaza una segunda estancia para el mismo usuario', async () => {
    const res = await crearEstanciaPropia(token, { nombre: 'Segunda Estancia' });
    expect(res.status).toBe(409);
  });

  test('sin token de sesión devuelve 401', async () => {
    const res = await request(app).post('/api/v2/estancia').send({ nombre: 'X', geom: bigPolygon() });
    expect(res.status).toBe(401);
  });

  test('con sólo nombre y geom, los campos opcionales quedan en null', async () => {
    const { token: otroToken } = await crearUsuario();
    const res = await crearEstanciaPropia(otroToken, { nombre: 'Estancia Mínima' });
    expect(res.status).toBe(201);
    expect(res.body.departamento).toBeNull();
    expect(res.body.provincia).toBeNull();
    expect(res.body.superficie_total_ha).toBeNull();
  });
});

describe('GET /api/v2/estancia/:estanciaId (#9)', () => {
  let token, tokenOtro, id_estancia;

  beforeAll(async () => {
    ({ token } = await crearUsuario());
    const estancia = await crearEstanciaPropia(token, { nombre: 'Estancia GET' });
    id_estancia = estancia.body.id_estancia;
    ({ token: tokenOtro } = await crearUsuario());
  });

  test('devuelve la estancia propia', async () => {
    const res = await authHeader(request(app).get(`/api/v2/estancia/${id_estancia}`), token);
    expect(res.status).toBe(200);
    expect(res.body.id_estancia).toBe(id_estancia);
    expect(res.body.nombre).toBe('Estancia GET');
  });

  test('devuelve 404 para un id inexistente', async () => {
    const res = await authHeader(request(app).get('/api/v2/estancia/999999'), token);
    expect(res.status).toBe(404);
  });

  test('devuelve 404 para una estancia ajena', async () => {
    const res = await authHeader(request(app).get(`/api/v2/estancia/${id_estancia}`), tokenOtro);
    expect(res.status).toBe(404);
  });

  test('sin token de sesión devuelve 401', async () => {
    const res = await request(app).get(`/api/v2/estancia/${id_estancia}`);
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/v2/estancia/:estanciaId (#10)', () => {
  let token, tokenOtro, id_estancia, id_potrero;

  beforeAll(async () => {
    ({ token } = await crearUsuario());
    const estancia = await crearEstanciaPropia(token, { nombre: 'Original' });
    id_estancia = estancia.body.id_estancia;
    const potrero = await crearPotreroPropio(token, id_estancia, { geom: potreroPolygon(0) });
    id_potrero = potrero.body.id_potrero;
    ({ token: tokenOtro } = await crearUsuario());
  });

  test('actualiza campos no espaciales sin tocar geom', async () => {
    const res = await authHeader(request(app).patch(`/api/v2/estancia/${id_estancia}`), token).send({
      nombre: 'Renombrada',
      departamento: 'Nuevo Depto',
    });
    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe('Renombrada');
    expect(res.body.departamento).toBe('Nuevo Depto');
    expect(res.body.geom).toEqual(bigPolygon());
  });

  test('rechaza geom con latitud fuera de rango', async () => {
    const res = await authHeader(request(app).patch(`/api/v2/estancia/${id_estancia}`), token).send({
      geom: polygon([
        [-70, -100],
        [-60, -40],
        [-60, -30],
        [-70, -100],
      ]),
    });
    expect(res.status).toBe(400);
  });

  test('rechaza un geom que no es Polygon', async () => {
    const res = await authHeader(request(app).patch(`/api/v2/estancia/${id_estancia}`), token).send({
      geom: { type: 'Point', coordinates: [1, 2] },
    });
    expect(res.status).toBe(400);
  });

  test('rechaza un geom que deja afuera un potrero existente', async () => {
    const res = await authHeader(request(app).patch(`/api/v2/estancia/${id_estancia}`), token).send({
      geom: polygonFueraDeEstancia(),
    });
    expect(res.status).toBe(400);
    expect(res.body.potrerosAfectados).toEqual(expect.arrayContaining([expect.objectContaining({ id_potrero })]));
  });

  test('actualiza el geom cuando sigue conteniendo a los potreros existentes', async () => {
    const nuevoGeom = polygon([
      [-71, -41],
      [-59, -41],
      [-59, -29],
      [-71, -29],
      [-71, -41],
    ]);
    const res = await authHeader(request(app).patch(`/api/v2/estancia/${id_estancia}`), token).send({
      geom: nuevoGeom,
    });
    expect(res.status).toBe(200);
    expect(res.body.geom).toEqual(nuevoGeom);
  });

  test('devuelve 404 para una estancia inexistente', async () => {
    const res = await authHeader(request(app).patch('/api/v2/estancia/999999'), token).send({ nombre: 'X' });
    expect(res.status).toBe(404);
  });

  test('devuelve 404 para una estancia ajena', async () => {
    const res = await authHeader(request(app).patch(`/api/v2/estancia/${id_estancia}`), tokenOtro).send({
      nombre: 'X',
    });
    expect(res.status).toBe(404);
  });

  test('sin token de sesión devuelve 401', async () => {
    const res = await request(app).patch(`/api/v2/estancia/${id_estancia}`).send({ nombre: 'X' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v2/estancia/:estanciaId/potrero (#12)', () => {
  let token, tokenOtro, id_estancia;

  beforeAll(async () => {
    ({ token } = await crearUsuario());
    const estancia = await crearEstanciaPropia(token, { nombre: 'Estancia Potrero POST' });
    id_estancia = estancia.body.id_estancia;
    ({ token: tokenOtro } = await crearUsuario());
  });

  test('crea un potrero dentro de la estancia', async () => {
    const res = await crearPotreroPropio(token, id_estancia, {
      nombre: 'Potrero 1',
      descripcion: 'desc',
      superficie_ha: 10,
      geom: potreroPolygon(0),
    });
    expect(res.status).toBe(201);
    expect(res.body.id_estancia).toBe(id_estancia);
    expect(res.body.activo).toBe(1);
    expect(res.body.descripcion).toBe('desc');
  });

  test('rechaza sin nombre', async () => {
    const res = await authHeader(request(app).post(`/api/v2/estancia/${id_estancia}/potrero`), token).send({
      geom: potreroPolygon(1),
    });
    expect(res.status).toBe(400);
  });

  test('rechaza sin geom', async () => {
    const res = await authHeader(request(app).post(`/api/v2/estancia/${id_estancia}/potrero`), token).send({
      nombre: 'Sin Geom',
    });
    expect(res.status).toBe(400);
  });

  test('rechaza un polígono autointersectante', async () => {
    const res = await crearPotreroPropio(token, id_estancia, { nombre: 'Bowtie', geom: polygonBowtie() });
    expect(res.status).toBe(400);
  });

  test('rechaza un polígono fuera de la estancia', async () => {
    const res = await crearPotreroPropio(token, id_estancia, { nombre: 'Afuera', geom: polygonFueraDeEstancia() });
    expect(res.status).toBe(400);
  });

  test('rechaza un polígono solapado con un potrero existente', async () => {
    const res = await crearPotreroPropio(token, id_estancia, { nombre: 'Solapado', geom: potreroPolygon(0) });
    expect(res.status).toBe(400);
  });

  test('devuelve 404 para una estancia inexistente', async () => {
    const res = await authHeader(request(app).post('/api/v2/estancia/999999/potrero'), token).send({
      nombre: 'X',
      geom: potreroPolygon(2),
    });
    expect(res.status).toBe(404);
  });

  test('devuelve 404 para una estancia ajena', async () => {
    const res = await crearPotreroPropio(tokenOtro, id_estancia, { geom: potreroPolygon(2) });
    expect(res.status).toBe(404);
  });

  test('sin token de sesión devuelve 401', async () => {
    const res = await request(app)
      .post(`/api/v2/estancia/${id_estancia}/potrero`)
      .send({ nombre: 'X', geom: potreroPolygon(2) });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v2/estancia/:estanciaId/potrero (#13)', () => {
  let token, tokenOtro, id_estancia;

  beforeAll(async () => {
    ({ token } = await crearUsuario());
    const estancia = await crearEstanciaPropia(token, { nombre: 'Estancia Potrero GET' });
    id_estancia = estancia.body.id_estancia;
    ({ token: tokenOtro } = await crearUsuario());
  });

  test('devuelve un arreglo vacío si la estancia no tiene potreros', async () => {
    const res = await authHeader(request(app).get(`/api/v2/estancia/${id_estancia}/potrero`), token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('lista los potreros creados', async () => {
    await crearPotreroPropio(token, id_estancia, { nombre: 'P1', geom: potreroPolygon(0) });
    await crearPotreroPropio(token, id_estancia, { nombre: 'P2', geom: potreroPolygon(1) });

    const res = await authHeader(request(app).get(`/api/v2/estancia/${id_estancia}/potrero`), token);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.map((p) => p.nombre).sort()).toEqual(['P1', 'P2']);
  });

  test('devuelve 404 para una estancia inexistente', async () => {
    const res = await authHeader(request(app).get('/api/v2/estancia/999999/potrero'), token);
    expect(res.status).toBe(404);
  });

  test('devuelve 404 para una estancia ajena', async () => {
    const res = await authHeader(request(app).get(`/api/v2/estancia/${id_estancia}/potrero`), tokenOtro);
    expect(res.status).toBe(404);
  });

  test('sin token de sesión devuelve 401', async () => {
    const res = await request(app).get(`/api/v2/estancia/${id_estancia}/potrero`);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v2/potrero/:potreroId (#14)', () => {
  let token, tokenOtro, id_potrero;

  beforeAll(async () => {
    ({ token } = await crearUsuario());
    const estancia = await crearEstanciaPropia(token, { nombre: 'Estancia Potrero GET id' });
    const potrero = await crearPotreroPropio(token, estancia.body.id_estancia, { nombre: 'Potrero Único' });
    id_potrero = potrero.body.id_potrero;
    ({ token: tokenOtro } = await crearUsuario());
  });

  test('devuelve el potrero', async () => {
    const res = await authHeader(request(app).get(`/api/v2/potrero/${id_potrero}`), token);
    expect(res.status).toBe(200);
    expect(res.body.id_potrero).toBe(id_potrero);
    expect(res.body.nombre).toBe('Potrero Único');
  });

  test('devuelve 404 para un id inexistente', async () => {
    const res = await authHeader(request(app).get('/api/v2/potrero/999999'), token);
    expect(res.status).toBe(404);
  });

  test('devuelve 404 para un potrero ajeno', async () => {
    const res = await authHeader(request(app).get(`/api/v2/potrero/${id_potrero}`), tokenOtro);
    expect(res.status).toBe(404);
  });

  test('sin token de sesión devuelve 401', async () => {
    const res = await request(app).get(`/api/v2/potrero/${id_potrero}`);
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/v2/potrero/:potreroId (#15)', () => {
  let token, tokenOtro, id_potrero1, id_potrero2;

  beforeAll(async () => {
    ({ token } = await crearUsuario());
    const estancia = await crearEstanciaPropia(token, { nombre: 'Estancia Potrero PATCH' });
    const id_estancia = estancia.body.id_estancia;
    const p1 = await crearPotreroPropio(token, id_estancia, { nombre: 'P1', geom: potreroPolygon(0) });
    id_potrero1 = p1.body.id_potrero;
    const p2 = await crearPotreroPropio(token, id_estancia, { nombre: 'P2', geom: potreroPolygon(1) });
    id_potrero2 = p2.body.id_potrero;
    ({ token: tokenOtro } = await crearUsuario());
  });

  test('actualiza campos no espaciales sin tocar geom', async () => {
    const res = await authHeader(request(app).patch(`/api/v2/potrero/${id_potrero1}`), token).send({
      nombre: 'P1 Renombrado',
      descripcion: 'nueva desc',
      superficie_ha: 20,
      activo: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe('P1 Renombrado');
    expect(res.body.descripcion).toBe('nueva desc');
    expect(res.body.geom).toEqual(potreroPolygon(0));
  });

  test('actualiza el geom a una posición válida dentro de la estancia', async () => {
    const res = await authHeader(request(app).patch(`/api/v2/potrero/${id_potrero1}`), token).send({
      geom: potreroPolygon(2),
    });
    expect(res.status).toBe(200);
    expect(res.body.geom).toEqual(potreroPolygon(2));
  });

  test('rechaza un geom autointersectante', async () => {
    const res = await authHeader(request(app).patch(`/api/v2/potrero/${id_potrero1}`), token).send({
      geom: polygonBowtie(),
    });
    expect(res.status).toBe(400);
  });

  test('rechaza un geom fuera de la estancia', async () => {
    const res = await authHeader(request(app).patch(`/api/v2/potrero/${id_potrero1}`), token).send({
      geom: polygonFueraDeEstancia(),
    });
    expect(res.status).toBe(400);
  });

  test('rechaza un geom que se solapa con otro potrero', async () => {
    const res = await authHeader(request(app).patch(`/api/v2/potrero/${id_potrero1}`), token).send({
      geom: potreroPolygon(1), // geom actual de id_potrero2
    });
    expect(res.status).toBe(400);
  });

  test('devuelve 404 para un potrero inexistente', async () => {
    const res = await authHeader(request(app).patch('/api/v2/potrero/999999'), token).send({ nombre: 'X' });
    expect(res.status).toBe(404);
  });

  test('devuelve 404 para un potrero ajeno', async () => {
    const res = await authHeader(request(app).patch(`/api/v2/potrero/${id_potrero1}`), tokenOtro).send({
      nombre: 'X',
    });
    expect(res.status).toBe(404);
  });

  test('sin token de sesión devuelve 401', async () => {
    const res = await request(app).patch(`/api/v2/potrero/${id_potrero1}`).send({ nombre: 'X' });
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/v2/potrero/:potreroId (#16)', () => {
  let token, tokenOtro, id_estancia;

  beforeAll(async () => {
    ({ token } = await crearUsuario());
    const estancia = await crearEstanciaPropia(token, { nombre: 'Estancia Potrero DELETE' });
    id_estancia = estancia.body.id_estancia;
    ({ token: tokenOtro } = await crearUsuario());
  });

  test('sin animales asignados, elimina (baja lógica) directamente sin pedir confirmación', async () => {
    const potrero = await crearPotreroPropio(token, id_estancia, { nombre: 'Vacío', geom: potreroPolygon(0) });
    const id_potrero = potrero.body.id_potrero;

    const res = await authHeader(request(app).delete(`/api/v2/potrero/${id_potrero}`), token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ deleted: true, animalesDesvinculados: 0 });

    const getRes = await authHeader(request(app).get(`/api/v2/potrero/${id_potrero}`), token);
    expect(getRes.status).toBe(200);
    expect(getRes.body.activo).toBe(0);
  });

  test('devuelve 404 para un potrero inexistente', async () => {
    const res = await authHeader(request(app).delete('/api/v2/potrero/999999'), token);
    expect(res.status).toBe(404);
  });

  test('devuelve 404 para un potrero ajeno', async () => {
    const potrero = await crearPotreroPropio(token, id_estancia, { nombre: 'Ajeno', geom: potreroPolygon(1) });
    const res = await authHeader(request(app).delete(`/api/v2/potrero/${potrero.body.id_potrero}`), tokenOtro);
    expect(res.status).toBe(404);
  });

  test('sin token de sesión devuelve 401', async () => {
    const potrero = await crearPotreroPropio(token, id_estancia, { nombre: 'Sin Token', geom: potreroPolygon(2) });
    const res = await request(app).delete(`/api/v2/potrero/${potrero.body.id_potrero}`);
    expect(res.status).toBe(401);
  });

  // El camino con animales asignados (409 sin confirm, 200 con ?confirm=true
  // y desvinculación) ya está cubierto de punta a punta en
  // ganado-asignacion.test.js § "Potrero - baja lógica y desvinculación de ganado".
});

describe('POST /api/v2/estancia/:estanciaId/ganado (#17)', () => {
  let token, tokenOtro, id_estancia;

  beforeAll(async () => {
    ({ token } = await crearUsuario());
    const estancia = await crearEstanciaPropia(token, { nombre: 'Estancia Ganado POST' });
    id_estancia = estancia.body.id_estancia;
    ({ token: tokenOtro } = await crearUsuario());
  });

  test('crea el animal sin potrero asignado', async () => {
    const res = await crearGanadoEnEstancia(token, id_estancia, { numero_identificacion: 'E17-001' });
    expect(res.status).toBe(201);
    expect(res.body.id_estancia).toBe(id_estancia);
    expect(res.body.id_potrero_actual).toBeNull();
    expect(res.body.activo).toBe(1);
  });

  test('devuelve 404 para una estancia inexistente', async () => {
    const res = await authHeader(request(app).post('/api/v2/estancia/999999/ganado'), token).send({
      numero_identificacion: 'E17-404',
      sexo: 'F',
      categoria: 'VAQUILLONA',
      peso_kg: 200,
    });
    expect(res.status).toBe(404);
  });

  test('devuelve 404 para una estancia ajena', async () => {
    const res = await crearGanadoEnEstancia(tokenOtro, id_estancia, { numero_identificacion: 'E17-AJENO' });
    expect(res.status).toBe(404);
  });

  test('sin token de sesión devuelve 401', async () => {
    const res = await request(app)
      .post(`/api/v2/estancia/${id_estancia}/ganado`)
      .send({ numero_identificacion: 'E17-401', sexo: 'F', categoria: 'VAQUILLONA', peso_kg: 200 });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v2/potrero/:potreroId/ganado (#18)', () => {
  let token, tokenOtro, id_potrero;

  beforeAll(async () => {
    ({ token } = await crearUsuario());
    const estancia = await crearEstanciaPropia(token, { nombre: 'Estancia Ganado en Potrero' });
    const potrero = await crearPotreroPropio(token, estancia.body.id_estancia);
    id_potrero = potrero.body.id_potrero;
    ({ token: tokenOtro } = await crearUsuario());
  });

  test('crea el animal ya asignado al potrero', async () => {
    const res = await crearGanadoEnPotrero(token, id_potrero, { numero_identificacion: 'E18-001' });
    expect(res.status).toBe(201);
    expect(res.body.id_potrero_actual).toBe(id_potrero);
  });

  test('rechaza campos obligatorios faltantes', async () => {
    const res = await authHeader(request(app).post(`/api/v2/potrero/${id_potrero}/ganado`), token).send({
      sexo: 'F',
    });
    expect(res.status).toBe(400);
  });

  test('exige condicion_corporal para categoria VACA', async () => {
    const res = await crearGanadoEnPotrero(token, id_potrero, {
      numero_identificacion: 'E18-VACA-SIN-CC',
      categoria: 'VACA',
    });
    expect(res.status).toBe(400);
  });

  test('rechaza numero_identificacion duplicado', async () => {
    const res = await crearGanadoEnPotrero(token, id_potrero, { numero_identificacion: 'E18-001' });
    expect(res.status).toBe(409);
  });

  test('devuelve 404 para un potrero inexistente', async () => {
    const res = await authHeader(request(app).post('/api/v2/potrero/999999/ganado'), token).send({
      numero_identificacion: 'E18-404',
      sexo: 'F',
      categoria: 'VAQUILLONA',
      peso_kg: 200,
    });
    expect(res.status).toBe(404);
  });

  test('devuelve 404 para un potrero ajeno', async () => {
    const res = await crearGanadoEnPotrero(tokenOtro, id_potrero, { numero_identificacion: 'E18-AJENO' });
    expect(res.status).toBe(404);
  });

  test('sin token de sesión devuelve 401', async () => {
    const res = await request(app)
      .post(`/api/v2/potrero/${id_potrero}/ganado`)
      .send({ numero_identificacion: 'E18-401', sexo: 'F', categoria: 'VAQUILLONA', peso_kg: 200 });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v2/estancia/:estanciaId/ganado (#19)', () => {
  let token, tokenOtro, id_estancia, id_potrero;

  beforeAll(async () => {
    ({ token } = await crearUsuario());
    const estancia = await crearEstanciaPropia(token, { nombre: 'Estancia Ganado GET' });
    id_estancia = estancia.body.id_estancia;
    const potrero = await crearPotreroPropio(token, id_estancia);
    id_potrero = potrero.body.id_potrero;
    ({ token: tokenOtro } = await crearUsuario());
  });

  test('devuelve un arreglo vacío si la estancia no tiene ganado', async () => {
    const res = await authHeader(request(app).get(`/api/v2/estancia/${id_estancia}/ganado`), token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('lista el ganado con y sin potrero asignado', async () => {
    await crearGanadoEnEstancia(token, id_estancia, { numero_identificacion: 'E19-SIN-POTRERO' });
    await crearGanadoEnPotrero(token, id_potrero, { numero_identificacion: 'E19-CON-POTRERO' });

    const res = await authHeader(request(app).get(`/api/v2/estancia/${id_estancia}/ganado`), token);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);

    const sinPotrero = res.body.find((g) => g.numero_identificacion === 'E19-SIN-POTRERO');
    const conPotrero = res.body.find((g) => g.numero_identificacion === 'E19-CON-POTRERO');
    expect(sinPotrero.id_potrero_actual).toBeNull();
    expect(conPotrero.id_potrero_actual).toBe(id_potrero);
  });

  test('devuelve 404 para una estancia inexistente', async () => {
    const res = await authHeader(request(app).get('/api/v2/estancia/999999/ganado'), token);
    expect(res.status).toBe(404);
  });

  test('devuelve 404 para una estancia ajena', async () => {
    const res = await authHeader(request(app).get(`/api/v2/estancia/${id_estancia}/ganado`), tokenOtro);
    expect(res.status).toBe(404);
  });

  test('sin token de sesión devuelve 401', async () => {
    const res = await request(app).get(`/api/v2/estancia/${id_estancia}/ganado`);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v2/ganado/:ganadoId (#20)', () => {
  let token, tokenOtro, id_ganado;

  beforeAll(async () => {
    ({ token } = await crearUsuario());
    const estancia = await crearEstanciaPropia(token, { nombre: 'Estancia Ganado GET id' });
    const ganado = await crearGanadoEnEstancia(token, estancia.body.id_estancia, {
      numero_identificacion: 'E20-001',
    });
    id_ganado = ganado.body.id_ganado;
    ({ token: tokenOtro } = await crearUsuario());
  });

  test('devuelve el animal', async () => {
    const res = await authHeader(request(app).get(`/api/v2/ganado/${id_ganado}`), token);
    expect(res.status).toBe(200);
    expect(res.body.numero_identificacion).toBe('E20-001');
  });

  test('devuelve 404 para un id inexistente', async () => {
    const res = await authHeader(request(app).get('/api/v2/ganado/999999'), token);
    expect(res.status).toBe(404);
  });

  test('devuelve 404 para un animal ajeno', async () => {
    const res = await authHeader(request(app).get(`/api/v2/ganado/${id_ganado}`), tokenOtro);
    expect(res.status).toBe(404);
  });

  test('sin token de sesión devuelve 401', async () => {
    const res = await request(app).get(`/api/v2/ganado/${id_ganado}`);
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/v2/ganado/:ganadoId', () => {
  let token, tokenOtro, id_ganado;

  beforeAll(async () => {
    ({ token } = await crearUsuario());
    const estancia = await crearEstanciaPropia(token, { nombre: 'Estancia Ganado PATCH' });
    const ganado = await crearGanadoEnEstancia(token, estancia.body.id_estancia, {
      numero_identificacion: 'E-PATCH-001',
    });
    id_ganado = ganado.body.id_ganado;
    await crearGanadoEnEstancia(token, estancia.body.id_estancia, { numero_identificacion: 'E-PATCH-002' });
    ({ token: tokenOtro } = await crearUsuario());
  });

  test('actualiza peso y estado fisiológico', async () => {
    const res = await authHeader(request(app).patch(`/api/v2/ganado/${id_ganado}`), token).send({
      peso_kg: 450,
      estado_fisiologico: 'L',
    });
    expect(res.status).toBe(200);
    expect(Number(res.body.peso_kg)).toBe(450);
    expect(res.body.estado_fisiologico).toBe('L');
  });

  test('rechaza un body sin campos reconocidos', async () => {
    const res = await authHeader(request(app).patch(`/api/v2/ganado/${id_ganado}`), token).send({});
    expect(res.status).toBe(400);
  });

  test('rechaza un numero_identificacion duplicado', async () => {
    const res = await authHeader(request(app).patch(`/api/v2/ganado/${id_ganado}`), token).send({
      numero_identificacion: 'E-PATCH-002',
    });
    expect(res.status).toBe(409);
  });

  test('devuelve 404 para un id inexistente', async () => {
    const res = await authHeader(request(app).patch('/api/v2/ganado/999999'), token).send({ peso_kg: 100 });
    expect(res.status).toBe(404);
  });

  test('devuelve 404 para un animal ajeno', async () => {
    const res = await authHeader(request(app).patch(`/api/v2/ganado/${id_ganado}`), tokenOtro).send({
      peso_kg: 100,
    });
    expect(res.status).toBe(404);
  });

  test('sin token de sesión devuelve 401', async () => {
    const res = await request(app).patch(`/api/v2/ganado/${id_ganado}`).send({ peso_kg: 100 });
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/v2/ganado/:ganadoId (#21)', () => {
  let token, tokenOtro, id_estancia, id_potrero;

  beforeAll(async () => {
    ({ token } = await crearUsuario());
    const estancia = await crearEstanciaPropia(token, { nombre: 'Estancia Ganado DELETE' });
    id_estancia = estancia.body.id_estancia;
    const potrero = await crearPotreroPropio(token, id_estancia);
    id_potrero = potrero.body.id_potrero;
    ({ token: tokenOtro } = await crearUsuario());
  });

  test('da de baja un animal sin potrero asignado', async () => {
    const ganado = await crearGanadoEnEstancia(token, id_estancia, { numero_identificacion: 'E21-SIN-POTRERO' });
    const res = await authHeader(request(app).delete(`/api/v2/ganado/${ganado.body.id_ganado}`), token);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);

    const listado = await authHeader(request(app).get(`/api/v2/estancia/${id_estancia}/ganado`), token);
    expect(listado.body.find((g) => g.id_ganado === ganado.body.id_ganado)).toBeUndefined();
  });

  test('da de baja un animal con asignación activa y la cierra', async () => {
    const ganado = await crearGanadoEnPotrero(token, id_potrero, { numero_identificacion: 'E21-CON-POTRERO' });
    const id_ganado = ganado.body.id_ganado;

    const res = await authHeader(request(app).delete(`/api/v2/ganado/${id_ganado}`), token);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);

    const enPotrero = await authHeader(request(app).get(`/api/v2/potrero/${id_potrero}/ganado`), token);
    expect(enPotrero.body.find((g) => g.id_ganado === id_ganado)).toBeUndefined();

    const historial = await authHeader(request(app).get(`/api/v2/ganado/${id_ganado}/asignaciones`), token);
    expect(historial.status).toBe(200);
    expect(historial.body).toHaveLength(1);
    expect(historial.body[0]).toMatchObject({ id_potrero, estado: 'FINALIZADA' });
    expect(historial.body[0].fecha_hasta).not.toBeNull();
  });

  test('devuelve 404 para un id inexistente', async () => {
    const res = await authHeader(request(app).delete('/api/v2/ganado/999999'), token);
    expect(res.status).toBe(404);
  });

  test('devuelve 404 para un animal ajeno', async () => {
    const ganado = await crearGanadoEnEstancia(token, id_estancia, { numero_identificacion: 'E21-AJENO' });
    const res = await authHeader(request(app).delete(`/api/v2/ganado/${ganado.body.id_ganado}`), tokenOtro);
    expect(res.status).toBe(404);
  });

  test('sin token de sesión devuelve 401', async () => {
    const ganado = await crearGanadoEnEstancia(token, id_estancia, { numero_identificacion: 'E21-401' });
    const res = await request(app).delete(`/api/v2/ganado/${ganado.body.id_ganado}`);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v2/potrero/:potreroId/ganado (#22)', () => {
  let token, tokenOtro, id_potrero;

  beforeAll(async () => {
    ({ token } = await crearUsuario());
    const estancia = await crearEstanciaPropia(token, { nombre: 'Estancia Potrero Ganado GET' });
    const potrero = await crearPotreroPropio(token, estancia.body.id_estancia);
    id_potrero = potrero.body.id_potrero;
    ({ token: tokenOtro } = await crearUsuario());
  });

  test('devuelve un arreglo vacío si el potrero no tiene ganado', async () => {
    const res = await authHeader(request(app).get(`/api/v2/potrero/${id_potrero}/ganado`), token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('lista el ganado con asignación vigente en el potrero', async () => {
    const ganado = await crearGanadoEnPotrero(token, id_potrero, { numero_identificacion: 'E22-001' });
    const res = await authHeader(request(app).get(`/api/v2/potrero/${id_potrero}/ganado`), token);
    expect(res.status).toBe(200);
    expect(res.body.find((g) => g.id_ganado === ganado.body.id_ganado)).toBeDefined();
  });

  test('devuelve 404 para un potrero inexistente', async () => {
    const res = await authHeader(request(app).get('/api/v2/potrero/999999/ganado'), token);
    expect(res.status).toBe(404);
  });

  test('devuelve 404 para un potrero ajeno', async () => {
    const res = await authHeader(request(app).get(`/api/v2/potrero/${id_potrero}/ganado`), tokenOtro);
    expect(res.status).toBe(404);
  });

  test('sin token de sesión devuelve 401', async () => {
    const res = await request(app).get(`/api/v2/potrero/${id_potrero}/ganado`);
    expect(res.status).toBe(401);
  });
});
