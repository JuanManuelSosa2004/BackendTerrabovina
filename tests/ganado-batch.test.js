'use strict';

// Cobertura focalizada de los endpoints batch de ganado:
//   POST  /api/v2/ganado/baja  (baja lógica múltiple)
//   PATCH /api/v2/ganado       (actualización múltiple, p. ej. cambio de categoría)
// Todo o nada: si algún id_ganado es inválido, no se aplica ningún cambio.

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

const usuariosCreados = [];
let contadorUsuarios = 0;
let contadorGanado = 0;

function authHeader(req, token) {
  return req.set('Authorization', `Bearer ${token}`);
}

async function crearUsuario() {
  contadorUsuarios += 1;
  const email = `batch-${Date.now()}-${contadorUsuarios}@example.com`;
  await request(app).post('/api/v2/auth/registro').send({ nombre: 'Batch Test', email, password: 'password123' });
  const login = await request(app).post('/api/v2/auth/login').send({ email, password: 'password123' });
  usuariosCreados.push(login.body.usuario.id_usuario);
  return { token: login.body.token, id_usuario: login.body.usuario.id_usuario };
}

function crearEstanciaPropia(token, overrides = {}) {
  return authHeader(request(app).post('/api/v2/estancia'), token).send({
    nombre: 'Estancia Batch',
    geom: bigPolygon(),
    ...overrides,
  });
}

function crearGanadoEnEstancia(token, id_estancia, overrides = {}) {
  contadorGanado += 1;
  return authHeader(request(app).post(`/api/v2/estancia/${id_estancia}/ganado`), token).send({
    numero_identificacion: `BATCH-${Date.now()}-${contadorGanado}`,
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

describe('POST /api/v2/ganado/baja', () => {
  let token;
  let id_estancia;
  let idA;
  let idB;
  let idC;

  beforeAll(async () => {
    ({ token } = await crearUsuario());
    const estancia = await crearEstanciaPropia(token);
    id_estancia = estancia.body.id_estancia;

    const a = await crearGanadoEnEstancia(token, id_estancia);
    const b = await crearGanadoEnEstancia(token, id_estancia);
    const c = await crearGanadoEnEstancia(token, id_estancia);
    idA = a.body.id_ganado;
    idB = b.body.id_ganado;
    idC = c.body.id_ganado;
  });

  test('sin auth responde 401', async () => {
    const res = await request(app).post('/api/v2/ganado/baja').send({ id_ganado: [idA] });
    expect(res.status).toBe(401);
  });

  test('sin id_ganado responde 400', async () => {
    const res = await authHeader(request(app).post('/api/v2/ganado/baja'), token).send({});
    expect(res.status).toBe(400);
  });

  test('si algún id no existe o es ajeno, hace rollback completo y responde 404', async () => {
    const res = await authHeader(request(app).post('/api/v2/ganado/baja'), token).send({
      id_ganado: [idA, idB, 999999],
    });
    expect(res.status).toBe(404);
    expect(res.body.noEncontrados).toEqual([999999]);

    // Nada debe haberse dado de baja (rollback completo).
    const getA = await authHeader(request(app).get(`/api/v2/ganado/${idA}`), token);
    const getB = await authHeader(request(app).get(`/api/v2/ganado/${idB}`), token);
    expect(getA.body.activo).toBeTruthy();
    expect(getB.body.activo).toBeTruthy();
  });

  test('con ids válidos, da de baja todos y responde 200 con eliminados', async () => {
    const res = await authHeader(request(app).post('/api/v2/ganado/baja'), token).send({
      id_ganado: [idA, idB],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ deleted: true, eliminados: [idA, idB], noEncontrados: [] });

    // Ya no aparecen en el listado de ganado activo de la estancia.
    const listado = await authHeader(request(app).get(`/api/v2/estancia/${id_estancia}/ganado`), token);
    const idsListado = listado.body.map((g) => g.id_ganado);
    expect(idsListado).not.toContain(idA);
    expect(idsListado).not.toContain(idB);
    expect(idsListado).toContain(idC);
  });

  test('dar de baja un id ya inactivo vuelve a fallar con 404 (todo o nada)', async () => {
    const res = await authHeader(request(app).post('/api/v2/ganado/baja'), token).send({
      id_ganado: [idA, idC],
    });
    expect(res.status).toBe(404);
    expect(res.body.noEncontrados).toEqual([idA]);

    // idC sigue activo: el rollback no lo afectó.
    const getC = await authHeader(request(app).get(`/api/v2/ganado/${idC}`), token);
    expect(getC.body.activo).toBeTruthy();
  });

  test('acepta un único id_ganado (no sólo arreglo)', async () => {
    const res = await authHeader(request(app).post('/api/v2/ganado/baja'), token).send({ id_ganado: idC });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ deleted: true, eliminados: [idC], noEncontrados: [] });
  });
});

describe('PATCH /api/v2/ganado (batch update)', () => {
  let token;
  let id_estancia;
  let idA;
  let idB;

  beforeAll(async () => {
    ({ token } = await crearUsuario());
    const estancia = await crearEstanciaPropia(token);
    id_estancia = estancia.body.id_estancia;

    const a = await crearGanadoEnEstancia(token, id_estancia);
    const b = await crearGanadoEnEstancia(token, id_estancia);
    idA = a.body.id_ganado;
    idB = b.body.id_ganado;
  });

  test('sin auth responde 401', async () => {
    const res = await request(app)
      .patch('/api/v2/ganado')
      .send({ ganado: [{ id_ganado: idA, categoria: 'NOVILLO' }] });
    expect(res.status).toBe(401);
  });

  test('sin ganado responde 400', async () => {
    const res = await authHeader(request(app).patch('/api/v2/ganado'), token).send({});
    expect(res.status).toBe(400);
  });

  test('item sin campos para actualizar responde 400', async () => {
    const res = await authHeader(request(app).patch('/api/v2/ganado'), token).send({
      ganado: [{ id_ganado: idA }],
    });
    expect(res.status).toBe(400);
  });

  test('si algún id no existe o es ajeno, hace rollback completo y responde 404', async () => {
    const res = await authHeader(request(app).patch('/api/v2/ganado'), token).send({
      ganado: [
        { id_ganado: idA, categoria: 'NOVILLO' },
        { id_ganado: 999999, categoria: 'NOVILLO' },
      ],
    });
    expect(res.status).toBe(404);
    expect(res.body.noEncontrados).toEqual([999999]);

    const getA = await authHeader(request(app).get(`/api/v2/ganado/${idA}`), token);
    expect(getA.body.categoria).toBe('VAQUILLONA');
  });

  test('con ids válidos, actualiza todos en una transacción y responde 200', async () => {
    const res = await authHeader(request(app).patch('/api/v2/ganado'), token).send({
      ganado: [
        { id_ganado: idA, categoria: 'NOVILLO' },
        { id_ganado: idB, categoria: 'NOVILLO', peso_kg: 350 },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(true);
    expect(res.body.noEncontrados).toEqual([]);
    const categorias = res.body.actualizados.map((g) => g.categoria);
    expect(categorias).toEqual(['NOVILLO', 'NOVILLO']);

    const getB = await authHeader(request(app).get(`/api/v2/ganado/${idB}`), token);
    expect(Number(getB.body.peso_kg)).toBe(350);
  });

  test('no permite actualizar ganado de otro usuario', async () => {
    const otro = await crearUsuario();
    const res = await authHeader(request(app).patch('/api/v2/ganado'), otro.token).send({
      ganado: [{ id_ganado: idA, categoria: 'TORO' }],
    });
    expect(res.status).toBe(404);
  });
});
