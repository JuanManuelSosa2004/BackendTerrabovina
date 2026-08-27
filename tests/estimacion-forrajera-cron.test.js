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
const { predictDmp, ModeloPredictivoError } = require('../src/services/modeloPredictivo.client');
const observacionSatelitalRepository = require('../src/database/sql/observacionSatelital.repository');
const disponibilidadForrajeraRepository = require('../src/database/sql/disponibilidadForrajera.repository');
const {
  CADENCIA_DIAS,
  necesitaEstimacion,
  ejecutarCicloEstimacionForrajera,
} = require('../src/jobs/estimacionForrajeraCron.job');

function polygon(coords) {
  return { type: 'Polygon', coordinates: [coords] };
}

// Mismo esquema de separación por boxIndex que ndvi-clima-estimaciones.test.js:
// cada estancia ocupa su propia franja de longitud para no chocar con la
// validación de solape entre estancias.
function bigPolygon(boxIndex) {
  const lonBase = -130 + boxIndex * 6;
  return polygon([
    [lonBase, -40],
    [lonBase + 5, -40],
    [lonBase + 5, -30],
    [lonBase, -30],
    [lonBase, -40],
  ]);
}

function potreroPolygon(boxIndex) {
  const lonBase = -130 + boxIndex * 6;
  return polygon([
    [lonBase + 1, -39],
    [lonBase + 1.3, -39],
    [lonBase + 1.3, -38.7],
    [lonBase + 1, -38.7],
    [lonBase + 1, -39],
  ]);
}

// Fecha de captura fija: es anterior a "hoy" (2026-08-24) en más de
// CADENCIA_DIAS, así que sirve tanto para poblar una observación "vencida"
// como para que el mock del modelo devuelva la MISMA fecha y ejercite el
// chequeo de duplicados (evitarDuplicados) del servicio.
const FECHA_CAPTURA_FIJA = '2026-07-31';

function dmpResponse(overrides = {}) {
  return {
    datos_imagen_satelital: {
      cobertura_suelo_mapbiomas: 'Pasturas',
      fecha_exacta_captura: FECHA_CAPTURA_FIJA,
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

const usuariosCreados = [];
let nextBoxIndex = 0;
let contadorNombres = 0;

function authHeader(req, token) {
  return req.set('Authorization', `Bearer ${token}`);
}

async function crearUsuario() {
  const email = `cron-${Date.now()}-${nextBoxIndex}-${Math.random()}@example.com`;
  await request(app).post('/api/v2/auth/registro').send({ nombre: 'Cron Test', email, password: 'password123' });
  const login = await request(app).post('/api/v2/auth/login').send({ email, password: 'password123' });
  usuariosCreados.push(login.body.usuario.id_usuario);
  return { token: login.body.token };
}

// Cada potrero recibe un nombre único para poder filtrar
// predictDmp.mock.calls por potrero, dado que getPotrerosActivos() es
// global y el ciclo puede tocar potreros de tests anteriores en el mismo
// archivo.
async function crearPotrero() {
  const boxIndex = nextBoxIndex++;
  contadorNombres += 1;
  const nombre = `Potrero Cron ${Date.now()}-${contadorNombres}`;
  const { token } = await crearUsuario();
  const estancia = await authHeader(request(app).post('/api/v2/estancia'), token).send({
    nombre: 'Estancia Cron',
    geom: bigPolygon(boxIndex),
  });
  const potrero = await authHeader(request(app).post(`/api/v2/estancia/${estancia.body.id_estancia}/potrero`), token).send({
    nombre,
    superficie_ha: 50,
    geom: potreroPolygon(boxIndex),
  });
  return { id_potrero: potrero.body.id_potrero, nombre };
}

function llamadasPara(nombre) {
  return predictDmp.mock.calls.filter(([arg]) => arg.nombre_potrero === nombre);
}

beforeEach(() => {
  predictDmp.mockReset();
  predictDmp.mockImplementation(() => Promise.resolve(dmpResponse()));
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
        // No se borran a mano observacion_satelital/dato_climatico/
        // disponibilidad_forrajera: el DELETE de potrero cascadea a las
        // tres (todas tienen ON DELETE CASCADE hacia potrero). Borrarlas
        // manualmente en un orden fijo es frágil desde que
        // disponibilidad_forrajera.id_observacion referencia
        // observacion_satelital con RESTRICT (migración 20260824000002):
        // ese orden quedaría mal apenas cambie el esquema otra vez.
        await sequelize.query('DELETE FROM potrero WHERE id_estancia IN (:estanciaIds)', { replacements: { estanciaIds } });
        await sequelize.query('DELETE FROM estancia WHERE id_estancia IN (:estanciaIds)', { replacements: { estanciaIds } });
      }

      await sequelize.query('DELETE FROM usuario WHERE id_usuario IN (:ids)', { replacements: { ids: usuariosCreados } });
    }
  } finally {
    await sequelize.close();
  }
});

describe('necesitaEstimacion', () => {
  test('un potrero sin observaciones necesita estimación', async () => {
    const { id_potrero } = await crearPotrero();
    await expect(necesitaEstimacion(id_potrero)).resolves.toBe(true);
  });

  test('una observación de hoy no dispara una nueva estimación', async () => {
    const { id_potrero } = await crearPotrero();
    await observacionSatelitalRepository.crearObservacion({
      id_potrero,
      fuente: 'SENTINEL2',
      fecha: new Date().toISOString().slice(0, 10),
      ndvi: 0.5,
      nubosidad: 5,
      cobertura_suelo_mapbiomas: 'Pasturas',
    });
    await expect(necesitaEstimacion(id_potrero)).resolves.toBe(false);
  });

  test(`una observación de más de ${CADENCIA_DIAS} días atrás sí la dispara`, async () => {
    const { id_potrero } = await crearPotrero();
    await observacionSatelitalRepository.crearObservacion({
      id_potrero,
      fuente: 'SENTINEL2',
      fecha: FECHA_CAPTURA_FIJA,
      ndvi: 0.5,
      nubosidad: 5,
      cobertura_suelo_mapbiomas: 'Pasturas',
    });
    await expect(necesitaEstimacion(id_potrero)).resolves.toBe(true);
  });
});

describe('ejecutarCicloEstimacionForrajera', () => {
  test('estima un potrero recién creado, sin observaciones previas', async () => {
    const { id_potrero, nombre } = await crearPotrero();

    await ejecutarCicloEstimacionForrajera();

    expect(llamadasPara(nombre)).toHaveLength(1);

    const observacion = await observacionSatelitalRepository.getUltimaByPotrero(id_potrero);
    expect(observacion).not.toBeNull();
    expect(observacion.cobertura_suelo_mapbiomas).toBe('Pasturas');

    const disponibilidad = await disponibilidadForrajeraRepository.getUltimaByPotrero(id_potrero);
    expect(Number(disponibilidad.kg_materia_seca_ha)).toBe(45.6);
    expect(disponibilidad.id_observacion).toBe(observacion.id_observacion);
    expect(disponibilidad.fecha_observacion).toBe(observacion.fecha);
  });

  test('no reestima un potrero con observación reciente', async () => {
    const { id_potrero, nombre } = await crearPotrero();
    await observacionSatelitalRepository.crearObservacion({
      id_potrero,
      fuente: 'SENTINEL2',
      fecha: new Date().toISOString().slice(0, 10),
      ndvi: 0.5,
      nubosidad: 5,
      cobertura_suelo_mapbiomas: 'Pasturas',
    });

    await ejecutarCicloEstimacionForrajera();

    expect(llamadasPara(nombre)).toHaveLength(0);
  });

  test('cadencia vencida pero sin escena nueva: se intenta pero no se duplica la fila', async () => {
    const { id_potrero, nombre } = await crearPotrero();
    const previa = await observacionSatelitalRepository.crearObservacion({
      id_potrero,
      fuente: 'SENTINEL2',
      fecha: FECHA_CAPTURA_FIJA,
      ndvi: 0.5,
      nubosidad: 5,
      cobertura_suelo_mapbiomas: 'Pasturas',
    });

    await ejecutarCicloEstimacionForrajera();

    // Se intentó (la cadencia estaba vencida)...
    expect(llamadasPara(nombre)).toHaveLength(1);
    // ...pero el modelo devolvió la misma escena, así que no hay fila nueva.
    const historial = await observacionSatelitalRepository.getHistorialByPotrero(id_potrero);
    expect(historial).toHaveLength(1);
    expect(historial[0].id_observacion).toBe(previa.id_observacion);
  });

  test('un potrero que falla no aborta el ciclo para el resto', async () => {
    const potreroFalla = await crearPotrero();
    const potreroOk = await crearPotrero();

    predictDmp.mockImplementation(({ nombre_potrero }) => {
      if (nombre_potrero === potreroFalla.nombre) {
        return Promise.reject(new ModeloPredictivoError('El modelo predictivo respondió 500.'));
      }
      return Promise.resolve(dmpResponse());
    });

    const resultado = await ejecutarCicloEstimacionForrajera();

    expect(resultado.errores).toBeGreaterThanOrEqual(1);
    expect(llamadasPara(potreroFalla.nombre)).toHaveLength(1);
    expect(llamadasPara(potreroOk.nombre)).toHaveLength(1);

    const observacionFalla = await observacionSatelitalRepository.getUltimaByPotrero(potreroFalla.id_potrero);
    expect(observacionFalla).toBeNull();

    const observacionOk = await observacionSatelitalRepository.getUltimaByPotrero(potreroOk.id_potrero);
    expect(observacionOk).not.toBeNull();
  });
});
