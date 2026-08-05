'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../database/sequelize');
const asignacionGanadoRepository = require('../database/sql/asignacionGanado.repository');

async function getPotreroDeUsuario(id_potrero, id_usuario, transaction) {
  const rows = await sequelize.query(
    `SELECT p.id_potrero, p.id_estancia, e.id_usuario
     FROM \`potrero\` p JOIN \`estancia\` e ON e.id_estancia = p.id_estancia
     WHERE p.id_potrero = :id_potrero AND e.id_usuario = :id_usuario`,
    { replacements: { id_potrero, id_usuario }, type: QueryTypes.SELECT, transaction }
  );
  return rows[0] ?? null;
}

async function getGanadoDeEstancia(id_ganado, id_estancia, transaction) {
  const rows = await sequelize.query(
    'SELECT id_ganado, id_estancia FROM `ganado` WHERE id_ganado = :id_ganado AND id_estancia = :id_estancia AND activo = TRUE',
    { replacements: { id_ganado, id_estancia }, type: QueryTypes.SELECT, transaction }
  );
  return rows[0] ?? null;
}

// #23 (redefinido): cubre únicamente la primera asignación de un animal
// que todavía no tiene potrero (por ejemplo, uno dado de alta vía POST
// /estancia/:id/ganado sin potrero). Mover un animal que ya está asignado
// es responsabilidad de POST /potrero/:potreroId/traslado-ganado, que
// además deja auditoría del movimiento (quién, cuándo, por qué) — este
// endpoint la rechaza explícitamente para no dejar dos caminos abiertos
// para la misma operación.
async function crear(req, res) {
  const { id_potrero } = req.body ?? {};
  const idsGanado = Array.isArray(req.body?.id_ganado) ? req.body.id_ganado : [req.body?.id_ganado];

  if (!id_potrero || idsGanado.length === 0 || idsGanado.some((id) => !id)) {
    return res.status(400).json({ error: 'id_potrero y al menos un id_ganado son obligatorios.' });
  }

  try {
    const asignaciones = await sequelize.transaction(async (t) => {
      const potrero = await getPotreroDeUsuario(id_potrero, req.usuario.id_usuario, t);
      if (!potrero) {
        const err = new Error('El potrero indicado no existe.');
        err.status = 400;
        throw err;
      }

      const resultados = [];
      const hoy = new Date().toISOString().slice(0, 10);

      for (const id_ganado of idsGanado) {
        const ganado = await getGanadoDeEstancia(id_ganado, potrero.id_estancia, t);
        if (!ganado) {
          const err = new Error(`El animal ${id_ganado} no existe o no pertenece a la misma estancia que el potrero.`);
          err.status = 400;
          throw err;
        }

        const activa = await asignacionGanadoRepository.getAsignacionActivaByGanado(id_ganado, t);
        if (activa) {
          const err = new Error(
            `El animal ${id_ganado} ya tiene una asignación activa; para moverlo use POST /potrero/:potreroId/traslado-ganado.`
          );
          err.status = 400;
          throw err;
        }

        const nueva = await asignacionGanadoRepository.crearAsignacion(
          { id_ganado, id_potrero, fecha_desde: hoy, estado: 'ACTIVA' },
          t
        );
        resultados.push(nueva);
      }

      return resultados;
    });

    return res.status(201).json(Array.isArray(req.body.id_ganado) ? asignaciones : asignaciones[0]);
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({ error: error.message });
    }
    throw error;
  }
}

// #24: requireAsignacionOwnership ya validó pertenencia.
async function getById(req, res) {
  const asignacion = await asignacionGanadoRepository.getAsignacionById(req.asignacion.id_asignacion);
  return res.json(asignacion);
}

function parseVigente(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

// #25: historial de asignaciones de toda la estancia, con filtros
// opcionales (potrero, animal, sólo vigentes, rango de fecha_desde).
async function listHistorialByEstancia(req, res) {
  const { id_potrero, id_ganado, vigente, desde, hasta } = req.query;
  const historial = await asignacionGanadoRepository.getHistorialByEstancia(req.estancia.id_estancia, {
    id_potrero,
    id_ganado,
    vigente: parseVigente(vigente),
    desde,
    hasta,
  });
  return res.json(historial);
}

// requirePotreroOwnership ya validó pertenencia. A diferencia de
// GET /potrero/:id/ganado (ganado.controller, sólo lo vigente), esto
// devuelve todo el historial de ese potrero.
async function listHistorialByPotrero(req, res) {
  const { id_ganado, vigente, desde, hasta } = req.query;
  const historial = await asignacionGanadoRepository.getHistorialByPotrero(req.potrero.id_potrero, {
    id_ganado,
    vigente: parseVigente(vigente),
    desde,
    hasta,
  });
  return res.json(historial);
}

// requireGanadoOwnership ya validó pertenencia. Complementa a
// GET /ganado/:id/recorrido (trasladoGanado.controller, vista por
// traslado): esta es la vista asignación a asignación.
async function listHistorialByGanado(req, res) {
  const { vigente, desde, hasta } = req.query;
  const historial = await asignacionGanadoRepository.getHistorialByGanado(req.ganado.id_ganado, {
    vigente: parseVigente(vigente),
    desde,
    hasta,
  });
  return res.json(historial);
}

module.exports = { crear, getById, listHistorialByEstancia, listHistorialByPotrero, listHistorialByGanado };
