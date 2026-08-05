'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../database/sequelize');
const trasladoGanadoRepository = require('../database/sql/trasladoGanado.repository');
const asignacionGanadoRepository = require('../database/sql/asignacionGanado.repository');
const estanciaRepository = require('../database/sql/estancia.repository');

const DIRECCIONES_VALIDAS = ['entradas', 'salidas'];
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

async function getPotreroDestinoDeUsuario(id_potrero, id_usuario, transaction) {
  const rows = await sequelize.query(
    `SELECT p.id_potrero, p.id_estancia, e.id_usuario
     FROM \`potrero\` p JOIN \`estancia\` e ON e.id_estancia = p.id_estancia
     WHERE p.id_potrero = :id_potrero AND e.id_usuario = :id_usuario`,
    { replacements: { id_potrero, id_usuario }, type: QueryTypes.SELECT, transaction }
  );
  return rows[0] ?? null;
}

// Animal activo, de la misma estancia y con asignación vigente
// justamente en el potrero origen (no en cualquier otro).
async function getGanadoConAsignacionActivaEnPotrero(id_ganado, id_estancia, id_potrero, transaction) {
  const rows = await sequelize.query(
    `SELECT g.id_ganado, a.id_asignacion
     FROM \`ganado\` g
     JOIN \`asignacion_ganado\` a ON a.id_ganado = g.id_ganado AND a.fecha_hasta IS NULL
     WHERE g.id_ganado = :id_ganado AND g.id_estancia = :id_estancia AND g.activo = TRUE
       AND a.id_potrero = :id_potrero`,
    { replacements: { id_ganado, id_estancia, id_potrero }, type: QueryTypes.SELECT, transaction }
  );
  return rows[0] ?? null;
}

function fechaSolo(fecha) {
  return new Date(fecha).toISOString().slice(0, 10);
}

// #1: traslada un lote de animales de un potrero a otro, cerrando cada
// asignación origen y abriendo la de destino, y dejando un registro
// operativo (traslado_ganado + detalle) del movimiento en sí. Todo en una
// única transacción: si un animal del lote es inválido, no se mueve nada.
async function crear(req, res) {
  const id_potrero_origen = req.potrero.id_potrero;
  const id_estancia = req.potrero.id_estancia;
  const { id_potrero_destino, fecha_movimiento, observaciones } = req.body ?? {};
  const idsGanado = Array.isArray(req.body?.id_ganado) ? req.body.id_ganado : [];

  if (!id_potrero_destino || !fecha_movimiento) {
    return res.status(400).json({ error: 'id_potrero_destino y fecha_movimiento son obligatorios.' });
  }
  // MySQL no acepta el formato ISO 8601 con "T"/"Z" como literal DATETIME:
  // se parsea a Date acá y esa instancia es la que viaja al INSERT (igual
  // que fecha_generacion/fecha_calculo en recomendacion/estimacion).
  const fechaMovimientoDate = new Date(fecha_movimiento);
  if (Number.isNaN(fechaMovimientoDate.getTime())) {
    return res.status(400).json({ error: 'fecha_movimiento no es una fecha válida.' });
  }
  if (idsGanado.length === 0 || idsGanado.some((id) => !id)) {
    return res.status(400).json({ error: 'id_ganado debe ser un arreglo no vacío de ids válidos.' });
  }
  if (new Set(idsGanado).size !== idsGanado.length) {
    return res.status(400).json({ error: 'id_ganado no debe tener animales duplicados.' });
  }
  if (Number(id_potrero_destino) === Number(id_potrero_origen)) {
    return res.status(400).json({ error: 'El potrero destino debe ser distinto del potrero origen.' });
  }

  try {
    const id_traslado = await sequelize.transaction(async (t) => {
      const destino = await getPotreroDestinoDeUsuario(id_potrero_destino, req.usuario.id_usuario, t);
      if (!destino || destino.id_estancia !== id_estancia) {
        const err = new Error('El potrero destino no existe o no pertenece a la misma estancia.');
        err.status = 400;
        throw err;
      }

      const cabecera = await trasladoGanadoRepository.crearTraslado(
        {
          id_estancia,
          id_potrero_origen,
          id_potrero_destino,
          fecha_movimiento: fechaMovimientoDate,
          observaciones,
          id_usuario: req.usuario.id_usuario,
        },
        t
      );

      const fechaMovimiento = fechaSolo(fechaMovimientoDate);

      for (const id_ganado of idsGanado) {
        const ganado = await getGanadoConAsignacionActivaEnPotrero(id_ganado, id_estancia, id_potrero_origen, t);
        if (!ganado) {
          const err = new Error(
            `El animal ${id_ganado} no existe, no pertenece a la estancia o no tiene una asignación activa en el potrero origen.`
          );
          err.status = 400;
          throw err;
        }

        await asignacionGanadoRepository.cerrarAsignacion(ganado.id_asignacion, fechaMovimiento, 'FINALIZADA', t);
        const nuevaAsignacion = await asignacionGanadoRepository.crearAsignacion(
          { id_ganado, id_potrero: id_potrero_destino, fecha_desde: fechaMovimiento, estado: 'ACTIVA' },
          t
        );
        await trasladoGanadoRepository.crearDetalle(
          {
            id_traslado: cabecera.id_traslado,
            id_ganado,
            id_asignacion_origen: ganado.id_asignacion,
            id_asignacion_destino: nuevaAsignacion.id_asignacion,
          },
          t
        );
      }

      return cabecera.id_traslado;
    });

    const resultado = await trasladoGanadoRepository.getTrasladoConDetalleById(id_traslado);
    return res.status(201).json(resultado);
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({ error: error.message });
    }
    throw error;
  }
}

// #2: listado paginado de traslados, siempre acotado a la estancia del
// usuario autenticado (relación 1:1 usuario-estancia).
async function listar(req, res) {
  const estanciaPropia = await estanciaRepository.getEstanciaByUsuario(req.usuario.id_usuario);
  if (!estanciaPropia) {
    return res.status(404).json({ error: 'El usuario no tiene una estancia registrada.' });
  }

  const { estanciaId, desde, hasta, id_potrero_origen, id_potrero_destino, id_ganado, page, limit } = req.query;

  if (estanciaId && Number(estanciaId) !== estanciaPropia.id_estancia) {
    return res.status(404).json({ error: 'Recurso no encontrado.' });
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(MAX_LIMIT, Math.max(1, Number(limit) || DEFAULT_LIMIT));

  const { data, total } = await trasladoGanadoRepository.listar({
    id_estancia: estanciaPropia.id_estancia,
    desde,
    hasta,
    id_potrero_origen,
    id_potrero_destino,
    id_ganado,
    page: pageNum,
    limit: limitNum,
  });

  return res.json({
    data,
    page: pageNum,
    limit: limitNum,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limitNum),
  });
}

// #3: requireTrasladoGanadoOwnership ya validó pertenencia.
async function getById(req, res) {
  const traslado = await trasladoGanadoRepository.getTrasladoConDetalleById(req.traslado.id_traslado);
  return res.json(traslado);
}

// #4: requirePotreroOwnership ya validó pertenencia del potrero.
async function listByPotrero(req, res) {
  const { direccion } = req.query;
  if (!DIRECCIONES_VALIDAS.includes(direccion)) {
    return res.status(400).json({ error: 'direccion debe ser "entradas" o "salidas".' });
  }
  const traslados = await trasladoGanadoRepository.getTrasladosByPotrero(req.potrero.id_potrero, direccion);
  return res.json(traslados);
}

// #5: requireGanadoOwnership ya validó pertenencia del animal.
async function recorridoByGanado(req, res) {
  const { desde, hasta } = req.query;
  const recorrido = await trasladoGanadoRepository.getRecorridoByGanado(req.ganado.id_ganado, { desde, hasta });
  return res.json(recorrido);
}

// #6: requireEstanciaOwnership ya validó pertenencia de la estancia.
async function analiticas(req, res) {
  const { desde, hasta } = req.query;
  const resultado = await trasladoGanadoRepository.getAnaliticasByEstancia(req.estancia.id_estancia, { desde, hasta });
  return res.json(resultado);
}

module.exports = { crear, listar, getById, listByPotrero, recorridoByGanado, analiticas };
