'use strict';

process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../src/app');
const { sequelize } = require('../src/database/sequelize');
const disponibilidadForrajeraRepository = require('../src/database/sql/disponibilidadForrajera.repository');

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

function authHeader(req, token) {
  return req.set('Authorization', `Bearer ${token}`);
}

function fechaHaceNDias(n) {
  const fecha = new Date();
  fecha.setUTCDate(fecha.getUTCDate() - n);
  return fecha.toISOString().slice(0, 19).replace('T', ' ');
}

const usuariosCreados = [];

async function crearUsuario() {
  const email = `analiticas-${Date.now()}-${Math.random()}@example.com`;
  await request(app).post('/api/v2/auth/registro').send({ nombre: 'Analiticas Test', email, password: 'password123' });
  const login = await request(app).post('/api/v2/auth/login').send({ email, password: 'password123' });
  usuariosCreados.push(login.body.usuario.id_usuario);
  return { token: login.body.token, id_usuario: login.body.usuario.id_usuario };
}

beforeAll(async () => {
  await sequelize.authenticate();
});

afterAll(async () => {
  try {
    if (usuariosCreados.length > 0) {
      const { QueryTypes } = require('sequelize');
      const estancias = await sequelize.query('SELECT id_estancia FROM estancia WHERE id_usuario IN (:ids)', {
        replacements: { ids: usuariosCreados },
        type: QueryTypes.SELECT,
      });
      const estanciaIds = estancias.map((e) => e.id_estancia);
      if (estanciaIds.length > 0) {
        const potreros = await sequelize.query('SELECT id_potrero FROM potrero WHERE id_estancia IN (:ids)', {
          replacements: { ids: estanciaIds },
          type: QueryTypes.SELECT,
        });
        const potreroIds = potreros.map((p) => p.id_potrero);
        if (potreroIds.length > 0) {
          await sequelize.query('DELETE FROM disponibilidad_forrajera WHERE id_potrero IN (:ids)', {
            replacements: { ids: potreroIds },
          });
        }
        await sequelize.query(
          'DELETE FROM asignacion_ganado WHERE id_ganado IN (SELECT id_ganado FROM ganado WHERE id_estancia IN (:ids))',
          { replacements: { ids: estanciaIds } }
        );
        await sequelize.query('DELETE FROM ganado WHERE id_estancia IN (:ids)', { replacements: { ids: estanciaIds } });
        await sequelize.query('DELETE FROM potrero WHERE id_estancia IN (:ids)', { replacements: { ids: estanciaIds } });
        await sequelize.query('DELETE FROM estancia WHERE id_estancia IN (:ids)', { replacements: { ids: estanciaIds } });
      }
      await sequelize.query('DELETE FROM usuario WHERE id_usuario IN (:ids)', { replacements: { ids: usuariosCreados } });
    }
  } finally {
    await sequelize.close();
  }
});

describe('GET /api/v2/estancia/:estanciaId/analiticas', () => {
  let token, id_estancia, potreroA, potreroB;

  beforeAll(async () => {
    ({ token } = await crearUsuario());
    const estancia = await authHeader(request(app).post('/api/v2/estancia'), token).send({
      nombre: 'Estancia Analiticas',
      geom: bigPolygon(),
    });
    id_estancia = estancia.body.id_estancia;

    const pA = await authHeader(request(app).post(`/api/v2/estancia/${id_estancia}/potrero`), token).send({
      nombre: 'Potrero A',
      geom: potreroPolygon(0),
      superficie_ha: 10,
    });
    const pB = await authHeader(request(app).post(`/api/v2/estancia/${id_estancia}/potrero`), token).send({
      nombre: 'Potrero B',
      geom: potreroPolygon(1),
      superficie_ha: 20,
    });
    potreroA = pA.body.id_potrero;
    potreroB = pB.body.id_potrero;

    await authHeader(request(app).post(`/api/v2/estancia/${id_estancia}/ganado`), token).send({
      numero_identificacion: `AN-NOV-1-${Date.now()}`,
      sexo: 'M',
      categoria: 'NOVILLO',
      peso_kg: 150,
    });
    await authHeader(request(app).post(`/api/v2/estancia/${id_estancia}/ganado`), token).send({
      numero_identificacion: `AN-NOV-2-${Date.now()}`,
      sexo: 'M',
      categoria: 'NOVILLO',
      peso_kg: 200,
    });
    await authHeader(request(app).post(`/api/v2/estancia/${id_estancia}/ganado`), token).send({
      numero_identificacion: `AN-VACA-${Date.now()}`,
      sexo: 'F',
      categoria: 'VACA',
      peso_kg: 300,
      condicion_corporal: 3,
    });

    // Potrero A: 3 mediciones dentro de la ventana de 7 días + 1 vieja
    // (fuera de ventana, no debe entrar al promedio de crecimiento).
    await disponibilidadForrajeraRepository.crear({
      id_potrero: potreroA,
      fecha_calculo: fechaHaceNDias(10),
      kg_materia_seca_ha: 999,
      superficie_analizada_ha: 10,
      version_modelo: 'test',
    });
    await disponibilidadForrajeraRepository.crear({
      id_potrero: potreroA,
      fecha_calculo: fechaHaceNDias(6),
      kg_materia_seca_ha: 80,
      superficie_analizada_ha: 10,
      version_modelo: 'test',
    });
    await disponibilidadForrajeraRepository.crear({
      id_potrero: potreroA,
      fecha_calculo: fechaHaceNDias(3),
      kg_materia_seca_ha: 90,
      superficie_analizada_ha: 10,
      version_modelo: 'test',
    });
    await disponibilidadForrajeraRepository.crear({
      id_potrero: potreroA,
      fecha_calculo: fechaHaceNDias(0),
      kg_materia_seca_ha: 100,
      superficie_analizada_ha: 10,
      version_modelo: 'test',
    });

    // Potrero B: una sola medición, hoy.
    await disponibilidadForrajeraRepository.crear({
      id_potrero: potreroB,
      fecha_calculo: fechaHaceNDias(0),
      kg_materia_seca_ha: 50,
      superficie_analizada_ha: 20,
      version_modelo: 'test',
    });
  });

  test('sin token de sesión devuelve 401', async () => {
    const res = await request(app).get(`/api/v2/estancia/${id_estancia}/analiticas`);
    expect(res.status).toBe(401);
  });

  test('devuelve 404 para una estancia ajena', async () => {
    const { token: tokenOtro } = await crearUsuario();
    const res = await authHeader(request(app).get(`/api/v2/estancia/${id_estancia}/analiticas`), tokenOtro);
    expect(res.status).toBe(404);
  });

  test('agrega distribución de carga animal, forraje por potrero y crecimiento de los últimos 7 días', async () => {
    const res = await authHeader(request(app).get(`/api/v2/estancia/${id_estancia}/analiticas`), token);
    expect(res.status).toBe(200);

    const novillo = res.body.distribucionCargaAnimal.find((c) => c.categoria === 'NOVILLO');
    const vaca = res.body.distribucionCargaAnimal.find((c) => c.categoria === 'VACA');
    expect(novillo.cantidad_animales).toBe(2);
    expect(vaca.cantidad_animales).toBe(1);

    // Sólo cuenta la última medición por potrero (hoy: A=100x10=1000, B=50x20=1000).
    const forrajeA = res.body.distribucionForraje.find((p) => p.id_potrero === potreroA);
    const forrajeB = res.body.distribucionForraje.find((p) => p.id_potrero === potreroB);
    expect(forrajeA.kg_materia_seca_total).toBeCloseTo(1000, 1);
    expect(forrajeB.kg_materia_seca_total).toBeCloseTo(1000, 1);
    expect(forrajeA.porcentaje).toBeCloseTo(50, 1);
    expect(forrajeB.porcentaje).toBeCloseTo(50, 1);

    // 3 días con al menos una medición dentro de la ventana: -6 (80), -3 (90), hoy (avg(100,50)=75).
    // La medición de hace 10 días (999) queda fuera de la ventana de 7 días.
    const promedios = res.body.crecimientoForraje7dias.map((d) => d.kg_materia_seca_ha_promedio).sort((a, b) => a - b);
    expect(promedios).toEqual([75, 80, 90]);
  });
});
