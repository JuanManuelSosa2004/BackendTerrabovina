'use strict';

const ganadoRepository = require('../database/sql/ganado.repository');
const asignacionGanadoRepository = require('../database/sql/asignacionGanado.repository');
const { sequelize } = require('../database/sequelize');
const { isDuplicateEntryError } = require('../utils/dbErrors');
const { validarPesoParaCategoria } = require('../utils/pesoRango');
const { validarSexoParaCategoria } = require('../utils/sexoCategoria');

const UPDATABLE_FIELDS = [
  'numero_identificacion',
  'fecha_nacimiento',
  'sexo',
  'categoria',
  'peso_kg',
  'condicion_corporal',
  'estado_fisiologico',
  'observaciones',
];

// CA011: categoría, peso vivo y número de identificación son obligatorios.
// condicion_corporal es obligatoria sólo para categoria === 'VACA' (única
// categoría relevada de forma sistemática para esa variable, ver
// migración 20260801000001).
//
// numero_identificacion sólo se exige acá para el alta sin potrero
// (createEnEstancia): el alta con potrero (createEnPotrero) lo genera el
// server (id_estancia-id_potrero-secuencial) y ese campo se ignora si el
// cliente lo manda.
function validarCamposGanado(body, { requiereNumeroIdentificacion = true } = {}) {
  const { numero_identificacion, sexo, categoria, peso_kg, condicion_corporal } = body ?? {};
  if ((requiereNumeroIdentificacion && !numero_identificacion) || !sexo || !categoria || peso_kg === undefined) {
    return requiereNumeroIdentificacion
      ? 'numero_identificacion, sexo, categoria y peso_kg son obligatorios.'
      : 'sexo, categoria y peso_kg son obligatorios.';
  }
  if (categoria === 'VACA' && condicion_corporal === undefined) {
    return 'condicion_corporal es obligatoria para categoria VACA.';
  }
  return validarSexoParaCategoria(categoria, sexo) ?? validarPesoParaCategoria(categoria, peso_kg);
}

// #17: crea el animal sin potrero asignado.
async function createEnEstancia(req, res) {
  const errorValidacion = validarCamposGanado(req.body);
  if (errorValidacion) {
    return res.status(400).json({ error: errorValidacion });
  }

  const { numero_identificacion, fecha_nacimiento, sexo, categoria, peso_kg, condicion_corporal, estado_fisiologico, observaciones } =
    req.body;

  try {
    const ganado = await ganadoRepository.createGanado({
      id_estancia: req.estancia.id_estancia,
      numero_identificacion,
      fecha_nacimiento,
      sexo,
      categoria,
      peso_kg,
      condicion_corporal,
      estado_fisiologico,
      observaciones,
    });
    return res.status(201).json(ganado);
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      return res.status(409).json({ error: 'Ya existe un animal con ese numero_identificacion.' });
    }
    throw error;
  }
}

// #18: crea el animal y su primera asignación en la misma transacción
// (docs/backend-gap-analysis.md §3, regla #18); id_estancia se deriva del
// potrero, no se recibe del cliente.
//
// numero_identificacion (número de caravana) lo arma el server con la
// convención id_estancia-id_potrero-secuencial: se genera una sola vez acá
// y queda fijo como texto plano, no se recalcula después. El "id_potrero"
// del número identifica el potrero de alta, no el potrero actual — si el
// animal se traslada o ese potrero se da de baja más adelante, el número
// no cambia (igual que una caravana física real no se recambia cuando el
// animal cambia de potrero). El potrero actual siempre se resuelve por
// asignacion_ganado (ver id_potrero_actual en la respuesta), nunca por
// este número.
//
// El secuencial sale de countGanadoHistoricoByPotrero: cuenta el histórico
// completo de asignaciones del potrero (no sólo el ganado vigente), para
// no reusar el número de un animal dado de baja.
async function createEnPotrero(req, res) {
  const errorValidacion = validarCamposGanado(req.body, { requiereNumeroIdentificacion: false });
  if (errorValidacion) {
    return res.status(400).json({ error: errorValidacion });
  }

  const { fecha_nacimiento, sexo, categoria, peso_kg, condicion_corporal, estado_fisiologico, observaciones } = req.body;
  const id_potrero = req.potrero.id_potrero;
  const id_estancia = req.potrero.id_estancia;
  let fecha_desde, dmi_ingreso_kg_dia = null;
  try {
    fecha_desde = require('../utils/diasPrevios').fechaIngreso(req.body.dias_previos_potrero);
    if (fecha_nacimiento && fecha_desde.slice(0,10) < fecha_nacimiento) return res.status(400).json({error:'La entrada no puede ser anterior al nacimiento.'});
  } catch (error) { return res.status(400).json({error:error.message}); }
  if (req.body.dias_previos_potrero !== undefined) {
    try {
      const { aAnimalDelModelo } = require('./estimacion.controller');
      const prediction = await require('../services/modeloPredictivo.client').predictDmi({ animales:[aAnimalDelModelo({...req.body,id_ganado:'nuevo'})] });
      dmi_ingreso_kg_dia = Number(prediction.predicciones?.[0]?.dmi_kg_dia);
      if (!Number.isFinite(dmi_ingreso_kg_dia) || dmi_ingreso_kg_dia < 0) throw Error('DMI de ingreso inválido.');
    } catch (error) { return res.status(502).json({error:`No se registró el animal: ${error.message}`}); }
  }

  try {
    const ganado = await sequelize.transaction(async (t) => {
      const secuencial = (await asignacionGanadoRepository.countGanadoHistoricoByPotrero(id_potrero, t)) + 1;
      const numero_identificacion = `${id_estancia}-${id_potrero}-${secuencial}`;

      const nuevo = await ganadoRepository.createGanado(
        {
          id_estancia,
          numero_identificacion,
          fecha_nacimiento,
          sexo,
          categoria,
          peso_kg,
          condicion_corporal,
          estado_fisiologico,
          observaciones,
        },
        t
      );
      await asignacionGanadoRepository.crearAsignacion(
        { id_ganado: nuevo.id_ganado, id_potrero, fecha_desde, estado: 'ACTIVA', dmi_ingreso_kg_dia },
        t
      );
      return nuevo;
    });
    const saved = await ganadoRepository.getGanadoById(ganado.id_ganado);
    const actualizacion_stock = req.body.dias_previos_potrero !== undefined
      ? require('./estimacion.controller').iniciarStock(id_potrero, undefined, true) : undefined;
    return res.status(201).json({...saved, actualizacion_stock});
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      // Colisión entre dos altas simultáneas en el mismo potrero (mismo
      // secuencial calculado antes de que la otra terminara de insertar):
      // el cliente puede simplemente reintentar la solicitud.
      return res.status(409).json({ error: 'Colisión generando numero_identificacion, reintente la solicitud.' });
    }
    throw error;
  }
}

// #19
async function listByEstancia(req, res) {
  const ganado = await ganadoRepository.getGanadoByEstancia(req.estancia.id_estancia);
  return res.json(ganado);
}

// #20: requireGanadoOwnership ya validó pertenencia.
async function getById(req, res) {
  const ganado = await ganadoRepository.getGanadoById(req.ganado.id_ganado);
  return res.json(ganado);
}

// No está en los 35 endpoints de la V2, pero sin ella no hay forma de
// actualizar peso ni condición corporal, que son las entradas del modelo
// de estimación de demanda (docs/backend-gap-analysis.md §5.4).
async function update(req, res) {
  const fields = {};
  for (const key of UPDATABLE_FIELDS) {
    if (req.body?.[key] !== undefined) fields[key] = req.body[key];
  }
  if (Object.keys(fields).length === 0) {
    return res.status(400).json({ error: 'No hay campos para actualizar.' });
  }

  if (fields.categoria !== undefined || fields.peso_kg !== undefined || fields.sexo !== undefined) {
    const actual = await ganadoRepository.getGanadoById(req.ganado.id_ganado);
    const categoria = fields.categoria ?? actual.categoria;
    const errorValidacion =
      validarSexoParaCategoria(categoria, fields.sexo ?? actual.sexo) ??
      validarPesoParaCategoria(categoria, fields.peso_kg ?? actual.peso_kg);
    if (errorValidacion) {
      return res.status(400).json({ error: errorValidacion });
    }
  }

  try {
    const ganado = await ganadoRepository.updateGanado(req.ganado.id_ganado, fields);
    return res.json(ganado);
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      return res.status(409).json({ error: 'Ya existe un animal con ese numero_identificacion.' });
    }
    throw error;
  }
}

// #21: baja lógica; si el animal tenía una asignación activa, se cierra
// en la misma transacción (docs/backend-gap-analysis.md §5.3).
async function remove(req, res) {
  const id_ganado = req.ganado.id_ganado;

  await sequelize.transaction(async (t) => {
    const asignacionActiva = await asignacionGanadoRepository.getAsignacionActivaByGanado(id_ganado, t);
    if (asignacionActiva) {
      const hoy = new Date().toISOString().slice(0, 10);
      await asignacionGanadoRepository.cerrarAsignacion(asignacionActiva.id_asignacion, hoy, 'FINALIZADA', t);
    }
    await ganadoRepository.darDeBaja(id_ganado, t);
  });

  return res.json({ deleted: true });
}

// Batch de update() (no está en los 35 endpoints de la V2, igual que
// update()): reemplaza el loop de PATCH /ganado/:id por animal que hacía
// el frontend para acciones masivas (p. ej. cambio de categoría). Mismo
// criterio todo-o-nada que removeMultiple: si algún id no existe, no
// pertenece al usuario o está dado de baja, rollback completo y 404.
async function updateMultiple(req, res) {
  const items = Array.isArray(req.body?.ganado) ? req.body.ganado : [];

  if (items.length === 0 || items.some((item) => !item?.id_ganado)) {
    return res.status(400).json({ error: 'Se requiere un arreglo ganado con al menos un id_ganado.' });
  }

  const fieldsById = new Map();
  for (const item of items) {
    const fields = {};
    for (const key of UPDATABLE_FIELDS) {
      if (item[key] !== undefined) fields[key] = item[key];
    }
    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ error: `No hay campos para actualizar en el animal ${item.id_ganado}.` });
    }
    fieldsById.set(item.id_ganado, fields);
  }

  const noEncontrados = [];

  try {
    const actualizados = await sequelize.transaction(async (t) => {
      for (const id_ganado of fieldsById.keys()) {
        const ganado = await ganadoRepository.getGanadoDeUsuario(id_ganado, req.usuario.id_usuario, t);
        if (!ganado) noEncontrados.push(id_ganado);
      }
      if (noEncontrados.length > 0) {
        const err = new Error('Algún animal no existe, no pertenece al usuario o está dado de baja.');
        err.status = 404;
        throw err;
      }

      for (const [id_ganado, fields] of fieldsById) {
        if (fields.categoria === undefined && fields.peso_kg === undefined && fields.sexo === undefined) continue;
        const actual = await ganadoRepository.getGanadoById(id_ganado, t);
        const categoria = fields.categoria ?? actual.categoria;
        const errorValidacion =
          validarSexoParaCategoria(categoria, fields.sexo ?? actual.sexo) ??
          validarPesoParaCategoria(categoria, fields.peso_kg ?? actual.peso_kg);
        if (errorValidacion) {
          const err = new Error(`Animal ${id_ganado}: ${errorValidacion}`);
          err.status = 400;
          throw err;
        }
      }

      const resultados = [];
      for (const [id_ganado, fields] of fieldsById) {
        resultados.push(await ganadoRepository.updateGanado(id_ganado, fields, t));
      }
      return resultados;
    });

    return res.json({ updated: true, actualizados, noEncontrados: [] });
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ error: error.message, noEncontrados });
    }
    if (error.status === 400) {
      return res.status(400).json({ error: error.message });
    }
    if (isDuplicateEntryError(error)) {
      return res.status(409).json({ error: 'Ya existe un animal con ese numero_identificacion.' });
    }
    throw error;
  }
}

// #21 bis: baja lógica de uno o varios animales en una sola transacción.
// Todo o nada: si algún id no existe, no pertenece al usuario o ya está
// inactivo, se hace rollback completo y se responde 404 (mismo criterio
// que POST /potrero/:id/traslado-ganado para lotes inválidos). Cada baja
// replica remove(): cierra la asignación activa del animal, si tenía una,
// antes de marcarlo inactivo.
async function removeMultiple(req, res) {
  const idsGanado = Array.isArray(req.body?.id_ganado) ? req.body.id_ganado : [req.body?.id_ganado];

  if (idsGanado.length === 0 || idsGanado.some((id) => !id)) {
    return res.status(400).json({ error: 'Se requiere al menos un id_ganado.' });
  }

  const noEncontrados = [];

  try {
    await sequelize.transaction(async (t) => {
      for (const id_ganado of idsGanado) {
        const ganado = await ganadoRepository.getGanadoDeUsuario(id_ganado, req.usuario.id_usuario, t);
        if (!ganado) noEncontrados.push(id_ganado);
      }
      if (noEncontrados.length > 0) {
        const err = new Error('Algún animal no existe, no pertenece al usuario o ya está dado de baja.');
        err.status = 404;
        throw err;
      }

      const hoy = new Date().toISOString().slice(0, 10);
      for (const id_ganado of idsGanado) {
        const asignacionActiva = await asignacionGanadoRepository.getAsignacionActivaByGanado(id_ganado, t);
        if (asignacionActiva) {
          await asignacionGanadoRepository.cerrarAsignacion(asignacionActiva.id_asignacion, hoy, 'FINALIZADA', t);
        }
        await ganadoRepository.darDeBaja(id_ganado, t);
      }
    });
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ error: error.message, noEncontrados });
    }
    throw error;
  }

  return res.json({ deleted: true, eliminados: idsGanado, noEncontrados: [] });
}

// #22
async function listByPotrero(req, res) {
  const ganado = await ganadoRepository.getGanadoByPotrero(req.potrero.id_potrero);
  return res.json(ganado);
}

async function createLoteEnPotrero(req,res) {
  const estimation=require('./estimacion.controller');
  try {
    const result=await require('../services/cattleBatch').createBatch({animals:req.body?.animales,potrero:req.potrero},{
      validate:validarCamposGanado,entryDate:require('../utils/diasPrevios').fechaIngreso,
      predict:require('../services/modeloPredictivo.client').predictDmi,mapAnimal:estimation.aAnimalDelModelo,
      transaction:fn=>sequelize.transaction(fn),
      lock:(id,t)=>sequelize.query('SELECT id_potrero FROM potrero WHERE id_potrero = :id FOR UPDATE',{replacements:{id},transaction:t}),
      count:asignacionGanadoRepository.countGanadoHistoricoByPotrero,create:ganadoRepository.createGanado,
      assign:asignacionGanadoRepository.crearAsignacion,refresh:estimation.iniciarStock,
    });
    return res.status(201).json(result);
  } catch(error) {
    if(error.status) return res.status(error.status).json({error:error.message});
    if(error.name==='ModeloPredictivoError') return res.status(502).json({error:'No se registró el lote: '+error.message});
    if(isDuplicateEntryError(error)) return res.status(409).json({error:'No se registró el lote por una colisión. Reintentá.'});
    throw error;
  }
}

module.exports = {
  createLoteEnPotrero,
  createEnEstancia,
  createEnPotrero,
  listByEstancia,
  getById,
  update,
  updateMultiple,
  remove,
  removeMultiple,
  listByPotrero,
};
