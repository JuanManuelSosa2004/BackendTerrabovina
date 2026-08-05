'use strict';

process.env.NODE_ENV = 'test';

jest.mock('../src/services/modeloPredictivo.client', () => {
  class ModeloPredictivoError extends Error {}
  return {
    predictDmp: jest.fn(),
    predictDmi: jest.fn(),
    ModeloPredictivoError,
  };
});

const request = require('supertest');
const app = require('../src/app');
const { sequelize } = require('../src/database/sequelize');
const { QueryTypes } = require('sequelize');
const { predictDmp, predictDmi, ModeloPredictivoError } = require('../src/services/modeloPredictivo.client');

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

function dmpResponse(overrides = {}) {
  return {
    datos_imagen_satelital: {
      cobertura_suelo_mapbiomas: 'Pasturas',
      fecha_exacta_captura: '2026-07-31',
      id_escena_sentinel2: 'S2B_21JWJ_20260731_0_L2A',
      nubosidad_pct: 8.8,
    },
    feature_vector_enviado_al_modelo: {
      ndvi_promedio: 0.55,
      temperatura_media_del_dia: 20.8,
      precipitacion_del_dia: 4.2,
      humedad_relativa_del_dia: 85.0,
    },
    prediccion: {
      dmp_kg_ms_ha_dia: 45.6,
      dmp_kg_ms_ha_periodo: 320.3,
    },
    ...overrides,
  };
}

function dmiResponse(overrides = {}) {
  return {
    advertencias: [],
    predicciones: [
      { animal_id: '1', dmi_kg_dia: 10.1, dmi_pct_peso_vivo: 2.4 },
      { animal_id: '2', dmi_kg_dia: 8.53, dmi_pct_peso_vivo: 2.13 },
    ],
    ...overrides,
  };
}

const usuariosCreados = [];
let contador = 0;
let contadorUsuarios = 0;

function authHeader(req, token) {
  return req.set('Authorization', `Bearer ${token}`);
}

async function crearUsuario() {
  contadorUsuarios += 1;
  const email = `modelo-${Date.now()}-${contadorUsuarios}@example.com`;
  await request(app).post('/api/v2/auth/registro').send({ nombre: 'Modelo Test', email, password: 'password123' });
  const login = await request(app).post('/api/v2/auth/login').send({ email, password: 'password123' });
  usuariosCreados.push(login.body.usuario.id_usuario);
  return { token: login.body.token, id_usuario: login.body.usuario.id_usuario };
}

async function crearEstanciaConPotrero() {
  const { token } = await crearUsuario();
  const estancia = await authHeader(request(app).post('/api/v2/estancia'), token).send({
    nombre: 'Estancia Modelo',
    geom: bigPolygon(),
  });
  const potrero = await authHeader(request(app).post(`/api/v2/estancia/${estancia.body.id_estancia}/potrero`), token).send({
    nombre: 'Potrero Modelo',
    superficie_ha: 50,
    geom: potreroPolygon(0),
  });
  return { token, id_estancia: estancia.body.id_estancia, id_potrero: potrero.body.id_potrero };
}

function crearGanadoEnPotrero(token, id_potrero, overrides = {}) {
  contador += 1;
  return authHeader(request(app).post(`/api/v2/potrero/${id_potrero}/ganado`), token).send({
    numero_identificacion: `MODELO-${Date.now()}-${contador}`,
    sexo: 'F',
    categoria: 'VAQUILLONA',
    peso_kg: 300,
    ...overrides,
  });
}

beforeEach(() => {
  predictDmp.mockReset();
  predictDmi.mockReset();
});

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
        await sequelize.query('DELETE FROM ganado WHERE id_estancia IN (:estanciaIds)', { replacements: { estanciaIds } });
        await sequelize.query('DELETE FROM potrero WHERE id_estancia IN (:estanciaIds)', { replacements: { estanciaIds } });
        await sequelize.query('DELETE FROM estancia WHERE id_estancia IN (:estanciaIds)', { replacements: { estanciaIds } });
      }

      await sequelize.query('DELETE FROM usuario WHERE id_usuario IN (:ids)', { replacements: { ids: usuariosCreados } });
    }
  } finally {
    await sequelize.close();
  }
});

describe('GET /api/v2/potrero/:id/ndvi y /dato-clima antes de cualquier estimación', () => {
  let token, tokenOtro, id_potrero;

  beforeAll(async () => {
    ({ token, id_potrero } = await crearEstanciaConPotrero());
    ({ token: tokenOtro } = await crearUsuario());
  });

  test('GET .../ndvi devuelve 404 si nunca se corrió una estimación forrajera', async () => {
    const res = await authHeader(request(app).get(`/api/v2/potrero/${id_potrero}/ndvi`), token);
    expect(res.status).toBe(404);
  });

  test('GET .../dato-clima devuelve 404 si nunca se corrió una estimación forrajera', async () => {
    const res = await authHeader(request(app).get(`/api/v2/potrero/${id_potrero}/dato-clima`), token);
    expect(res.status).toBe(404);
  });

  test('GET .../ndvi/consulta-rango devuelve mensaje vacío sin datos', async () => {
    const res = await authHeader(
      request(app).get(`/api/v2/potrero/${id_potrero}/ndvi/consulta-rango`),
      token
    );
    expect(res.status).toBe(200);
    expect(res.body.observaciones).toEqual([]);
  });

  test('GET .../ndvi devuelve 404 para un potrero ajeno', async () => {
    const res = await authHeader(request(app).get(`/api/v2/potrero/${id_potrero}/ndvi`), tokenOtro);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v2/potrero/:id/estimacion-forrajera', () => {
  let token, tokenOtro, id_potrero;

  beforeAll(async () => {
    ({ token, id_potrero } = await crearEstanciaConPotrero());
    ({ token: tokenOtro } = await crearUsuario());
  });

  test('sin token de sesión devuelve 401', async () => {
    const res = await request(app).post(`/api/v2/potrero/${id_potrero}/estimacion-forrajera`);
    expect(res.status).toBe(401);
  });

  test('devuelve 404 para un potrero ajeno', async () => {
    const res = await authHeader(request(app).post(`/api/v2/potrero/${id_potrero}/estimacion-forrajera`), tokenOtro);
    expect(res.status).toBe(404);
  });

  test('persiste observación satelital, dato climático y disponibilidad forrajera a partir de la respuesta del modelo', async () => {
    predictDmp.mockResolvedValueOnce(dmpResponse());

    const res = await authHeader(request(app).post(`/api/v2/potrero/${id_potrero}/estimacion-forrajera`), token);

    expect(res.status).toBe(201);
    expect(predictDmp).toHaveBeenCalledWith({ nombre_potrero: 'Potrero Modelo', geojson: potreroPolygon(0) });

    expect(Number(res.body.kg_materia_seca_ha)).toBe(45.6);
    expect(Number(res.body.indice_ndvi)).toBe(0.55);
    expect(res.body.superficie_analizada_ha).toBe('50.00');
    expect(res.body.version_modelo).toBe('dmp-model');
    expect(res.body.dmp_kg_ms_ha_periodo).toBe(320.3);
    expect(res.body.observacion.fuente).toBe('SENTINEL2');
    expect(Number(res.body.observacion.ndvi)).toBe(0.55);
    expect(res.body.clima).toMatchObject({ temperatura: '20.80', precipitacion: '4.20', humedad: '85.00' });

    const ndvi = await authHeader(request(app).get(`/api/v2/potrero/${id_potrero}/ndvi`), token);
    expect(ndvi.status).toBe(200);
    expect(Number(ndvi.body.ndvi)).toBe(0.55);

    const clima = await authHeader(request(app).get(`/api/v2/potrero/${id_potrero}/dato-clima`), token);
    expect(clima.status).toBe(200);
    expect(Number(clima.body.temperatura)).toBe(20.8);

    const historico = await authHeader(
      request(app).get(`/api/v2/potrero/${id_potrero}/estimacion-forrajera/historico`),
      token
    );
    expect(historico.body.disponibilidad).toHaveLength(1);
    expect(historico.body.disponibilidad[0].version_modelo).toBe('dmp-model');
  });

  test('si el modelo falla, no persiste nada y la última observación sigue siendo la vigente', async () => {
    const previa = await authHeader(request(app).get(`/api/v2/potrero/${id_potrero}/ndvi`), token);
    expect(previa.status).toBe(200);
    const idObservacionPrevia = previa.body.id_observacion;

    predictDmp.mockRejectedValueOnce(new ModeloPredictivoError('El modelo predictivo respondió 500.'));

    const res = await authHeader(request(app).post(`/api/v2/potrero/${id_potrero}/estimacion-forrajera`), token);
    expect(res.status).toBe(502);

    const despues = await authHeader(request(app).get(`/api/v2/potrero/${id_potrero}/ndvi`), token);
    expect(despues.status).toBe(200);
    expect(despues.body.id_observacion).toBe(idObservacionPrevia);
  });
});

describe('POST /api/v2/potrero/:id/estimacion-nutricional', () => {
  let token, tokenOtro, id_potrero;

  beforeAll(async () => {
    ({ token, id_potrero } = await crearEstanciaConPotrero());
    ({ token: tokenOtro } = await crearUsuario());
  });

  test('rechaza si el potrero no tiene animales con asignación vigente', async () => {
    const res = await authHeader(request(app).post(`/api/v2/potrero/${id_potrero}/estimacion-nutricional`), token);
    expect(res.status).toBe(400);
    expect(predictDmi).not.toHaveBeenCalled();
  });

  test('sin token de sesión devuelve 401', async () => {
    const res = await request(app).post(`/api/v2/potrero/${id_potrero}/estimacion-nutricional`);
    expect(res.status).toBe(401);
  });

  test('devuelve 404 para un potrero ajeno', async () => {
    const res = await authHeader(
      request(app).post(`/api/v2/potrero/${id_potrero}/estimacion-nutricional`),
      tokenOtro
    );
    expect(res.status).toBe(404);
  });

  test('agrega el dmi_kg_dia de cada animal y devuelve advertencias/predicciones sin persistirlas', async () => {
    const gA = await crearGanadoEnPotrero(token, id_potrero, { categoria: 'VACA', condicion_corporal: 3.5 });
    const gB = await crearGanadoEnPotrero(token, id_potrero, { categoria: 'NOVILLO' });

    predictDmi.mockResolvedValueOnce(
      dmiResponse({ advertencias: [`${gB.body.id_ganado}: peso fuera de rango observado`] })
    );

    const res = await authHeader(request(app).post(`/api/v2/potrero/${id_potrero}/estimacion-nutricional`), token);

    expect(res.status).toBe(201);
    expect(predictDmi).toHaveBeenCalledWith({
      animales: expect.arrayContaining([
        expect.objectContaining({
          animal_id: String(gA.body.id_ganado),
          categoria_terrabovina: 'Vaca',
          condicion_corporal: 3.5,
        }),
        expect.objectContaining({ animal_id: String(gB.body.id_ganado), categoria_terrabovina: 'Novillo' }),
      ]),
    });

    expect(res.body.cantidad_animales).toBe(2);
    expect(Number(res.body.kg_materia_seca_dia)).toBeCloseTo(10.1 + 8.53, 2);
    expect(res.body.version_modelo).toBe('dmi-model');
    expect(res.body.advertencias).toHaveLength(1);
    expect(res.body.predicciones).toHaveLength(2);

    const historico = await authHeader(
      request(app).get(`/api/v2/potrero/${id_potrero}/estimacion-nutricional/historico`),
      token
    );
    expect(historico.body.estimaciones).toHaveLength(1);
    expect(historico.body.estimaciones[0].advertencias).toBeUndefined();
  });

  test('si el modelo falla, no persiste ninguna estimación nueva', async () => {
    const antes = await authHeader(
      request(app).get(`/api/v2/potrero/${id_potrero}/estimacion-nutricional/historico`),
      token
    );
    const cantidadPrevia = antes.body.estimaciones.length;

    predictDmi.mockRejectedValueOnce(new ModeloPredictivoError('timeout'));

    const res = await authHeader(request(app).post(`/api/v2/potrero/${id_potrero}/estimacion-nutricional`), token);
    expect(res.status).toBe(502);

    const despues = await authHeader(
      request(app).get(`/api/v2/potrero/${id_potrero}/estimacion-nutricional/historico`),
      token
    );
    expect(despues.body.estimaciones).toHaveLength(cantidadPrevia);
  });
});
