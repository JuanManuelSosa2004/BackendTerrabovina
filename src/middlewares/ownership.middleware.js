'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../database/sequelize');

// RNF007: un usuario sólo puede acceder a los recursos de su propia cuenta.
// Ante un recurso ajeno se responde 404 (no 403) para no revelar que el
// recurso existe, igual que el login no revela si el correo está
// registrado (CA023).
const NOT_FOUND = { error: 'Recurso no encontrado.' };

function requireEstanciaOwnership(paramName = 'estanciaId') {
  return async (req, res, next) => {
    const id = req.params[paramName];
    const rows = await sequelize.query('SELECT id_estancia, id_usuario FROM `estancia` WHERE id_estancia = :id', {
      replacements: { id },
      type: QueryTypes.SELECT,
    });
    const estancia = rows[0];
    if (!estancia || estancia.id_usuario !== req.usuario.id_usuario) {
      return res.status(404).json(NOT_FOUND);
    }
    req.estancia = estancia;
    next();
  };
}

function requirePotreroOwnership(paramName = 'potreroId') {
  return async (req, res, next) => {
    const id = req.params[paramName];
    const rows = await sequelize.query(
      `SELECT p.id_potrero, p.id_estancia, e.id_usuario
       FROM \`potrero\` p JOIN \`estancia\` e ON e.id_estancia = p.id_estancia
       WHERE p.id_potrero = :id`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );
    const potrero = rows[0];
    if (!potrero || potrero.id_usuario !== req.usuario.id_usuario) {
      return res.status(404).json(NOT_FOUND);
    }
    req.potrero = potrero;
    next();
  };
}

function requireGanadoOwnership(paramName = 'ganadoId') {
  return async (req, res, next) => {
    const id = req.params[paramName];
    const rows = await sequelize.query(
      `SELECT g.id_ganado, g.id_estancia, e.id_usuario
       FROM \`ganado\` g JOIN \`estancia\` e ON e.id_estancia = g.id_estancia
       WHERE g.id_ganado = :id`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );
    const ganado = rows[0];
    if (!ganado || ganado.id_usuario !== req.usuario.id_usuario) {
      return res.status(404).json(NOT_FOUND);
    }
    req.ganado = ganado;
    next();
  };
}

function requireAsignacionOwnership(paramName = 'asignacionId') {
  return async (req, res, next) => {
    const id = req.params[paramName];
    const rows = await sequelize.query(
      `SELECT a.id_asignacion, g.id_estancia, e.id_usuario
       FROM \`asignacion_ganado\` a
       JOIN \`ganado\` g ON g.id_ganado = a.id_ganado
       JOIN \`estancia\` e ON e.id_estancia = g.id_estancia
       WHERE a.id_asignacion = :id`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );
    const asignacion = rows[0];
    if (!asignacion || asignacion.id_usuario !== req.usuario.id_usuario) {
      return res.status(404).json(NOT_FOUND);
    }
    req.asignacion = asignacion;
    next();
  };
}

function requireTrasladoGanadoOwnership(paramName = 'trasladoId') {
  return async (req, res, next) => {
    const id = req.params[paramName];
    const rows = await sequelize.query(
      `SELECT t.id_traslado, t.id_estancia, e.id_usuario
       FROM \`traslado_ganado\` t
       JOIN \`estancia\` e ON e.id_estancia = t.id_estancia
       WHERE t.id_traslado = :id`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );
    const traslado = rows[0];
    if (!traslado || traslado.id_usuario !== req.usuario.id_usuario) {
      return res.status(404).json(NOT_FOUND);
    }
    req.traslado = traslado;
    next();
  };
}

module.exports = {
  requireEstanciaOwnership,
  requirePotreroOwnership,
  requireGanadoOwnership,
  requireAsignacionOwnership,
  requireTrasladoGanadoOwnership,
};
