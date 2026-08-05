'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const HEADER_FIELDS =
  't.id_traslado, t.id_estancia, t.id_potrero_origen, t.id_potrero_destino, ' +
  't.fecha_movimiento, t.observaciones, t.id_usuario, t.created_at, t.updated_at';

// mysql2 escapea un objeto Date usado como replacement con la zona horaria
// LOCAL del proceso, no con la `timezone: '+00:00'` configurada en
// sequelize.js (esa opción sólo fija la variable de sesión `time_zone`,
// irrelevante para una columna DATETIME naive). Se formatea a mano acá,
// mismo motivo por el que fecha_desde/fecha_hasta de asignacion_ganado
// siempre viajan como string 'YYYY-MM-DD' y nunca como Date.
function toMysqlDatetimeUtc(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

async function crearTraslado(
  { id_estancia, id_potrero_origen, id_potrero_destino, fecha_movimiento, observaciones, id_usuario },
  transaction
) {
  const [insertId] = await sequelize.query(
    `INSERT INTO \`traslado_ganado\`
       (id_estancia, id_potrero_origen, id_potrero_destino, fecha_movimiento, observaciones, id_usuario, created_at, updated_at)
     VALUES
       (:id_estancia, :id_potrero_origen, :id_potrero_destino, :fecha_movimiento, :observaciones, :id_usuario, NOW(), NOW())`,
    {
      replacements: {
        id_estancia,
        id_potrero_origen,
        id_potrero_destino,
        fecha_movimiento: toMysqlDatetimeUtc(fecha_movimiento),
        observaciones: observaciones ?? null,
        id_usuario,
      },
      type: QueryTypes.INSERT,
      transaction,
    }
  );
  return { id_traslado: insertId };
}

async function crearDetalle({ id_traslado, id_ganado, id_asignacion_origen, id_asignacion_destino }, transaction) {
  await sequelize.query(
    `INSERT INTO \`traslado_ganado_detalle\`
       (id_traslado, id_ganado, id_asignacion_origen, id_asignacion_destino, created_at)
     VALUES
       (:id_traslado, :id_ganado, :id_asignacion_origen, :id_asignacion_destino, NOW())`,
    {
      replacements: { id_traslado, id_ganado, id_asignacion_origen, id_asignacion_destino },
      type: QueryTypes.INSERT,
      transaction,
    }
  );
}

// Cabecera + potreros + usuario responsable + detalle de animales, para
// las respuestas de alta (#1) y de detalle por id (#3).
async function getTrasladoConDetalleById(id_traslado, transaction) {
  const rows = await sequelize.query(
    `SELECT ${HEADER_FIELDS},
            u.nombre AS usuario_nombre, u.email AS usuario_email,
            po.nombre AS origen_nombre, pd.nombre AS destino_nombre
     FROM \`traslado_ganado\` t
     JOIN \`usuario\` u ON u.id_usuario = t.id_usuario
     JOIN \`potrero\` po ON po.id_potrero = t.id_potrero_origen
     JOIN \`potrero\` pd ON pd.id_potrero = t.id_potrero_destino
     WHERE t.id_traslado = :id_traslado`,
    { replacements: { id_traslado }, type: QueryTypes.SELECT, transaction }
  );
  const cabecera = rows[0];
  if (!cabecera) return null;

  const detalles = await sequelize.query(
    `SELECT d.id_ganado, g.numero_identificacion, g.categoria,
            d.id_asignacion_origen, d.id_asignacion_destino
     FROM \`traslado_ganado_detalle\` d
     JOIN \`ganado\` g ON g.id_ganado = d.id_ganado
     WHERE d.id_traslado = :id_traslado
     ORDER BY g.numero_identificacion`,
    { replacements: { id_traslado }, type: QueryTypes.SELECT, transaction }
  );

  return {
    id_traslado: cabecera.id_traslado,
    id_estancia: cabecera.id_estancia,
    fecha_movimiento: cabecera.fecha_movimiento,
    observaciones: cabecera.observaciones,
    created_at: cabecera.created_at,
    updated_at: cabecera.updated_at,
    usuario: { id_usuario: cabecera.id_usuario, nombre: cabecera.usuario_nombre, email: cabecera.usuario_email },
    potrero_origen: { id_potrero: cabecera.id_potrero_origen, nombre: cabecera.origen_nombre },
    potrero_destino: { id_potrero: cabecera.id_potrero_destino, nombre: cabecera.destino_nombre },
    detalles,
  };
}

// #2: listado paginado con filtros, siempre acotado a una estancia (la
// del usuario autenticado: la resuelve el controller antes de llamar acá).
async function listar({
  id_estancia,
  desde,
  hasta,
  id_potrero_origen,
  id_potrero_destino,
  id_ganado,
  page,
  limit,
}) {
  const conditions = ['t.id_estancia = :id_estancia'];
  const replacements = { id_estancia };
  const joins = [];

  if (desde) {
    conditions.push('t.fecha_movimiento >= :desde');
    replacements.desde = desde;
  }
  if (hasta) {
    conditions.push('t.fecha_movimiento <= :hasta');
    replacements.hasta = hasta;
  }
  if (id_potrero_origen) {
    conditions.push('t.id_potrero_origen = :id_potrero_origen');
    replacements.id_potrero_origen = id_potrero_origen;
  }
  if (id_potrero_destino) {
    conditions.push('t.id_potrero_destino = :id_potrero_destino');
    replacements.id_potrero_destino = id_potrero_destino;
  }
  if (id_ganado) {
    joins.push(
      'JOIN `traslado_ganado_detalle` filtro_ganado ON filtro_ganado.id_traslado = t.id_traslado AND filtro_ganado.id_ganado = :id_ganado'
    );
    replacements.id_ganado = id_ganado;
  }

  const whereClause = conditions.join(' AND ');
  const joinClause = joins.join(' ');

  const [{ total }] = await sequelize.query(
    `SELECT COUNT(*) AS total FROM \`traslado_ganado\` t ${joinClause} WHERE ${whereClause}`,
    { replacements, type: QueryTypes.SELECT }
  );

  const data = await sequelize.query(
    `SELECT ${HEADER_FIELDS} FROM \`traslado_ganado\` t ${joinClause}
     WHERE ${whereClause}
     ORDER BY t.fecha_movimiento DESC, t.id_traslado DESC
     LIMIT :limit OFFSET :offset`,
    { replacements: { ...replacements, limit, offset: (page - 1) * limit }, type: QueryTypes.SELECT }
  );

  return { data, total: Number(total) };
}

// #4: traslados que llegaron (entradas) o salieron (salidas) de un
// potrero. `direccion` ya viene validada por el controller a uno de estos
// dos literales, así que interpolar el nombre de columna es seguro.
async function getTrasladosByPotrero(id_potrero, direccion) {
  const columna = direccion === 'entradas' ? 'id_potrero_destino' : 'id_potrero_origen';
  return sequelize.query(
    `SELECT ${HEADER_FIELDS} FROM \`traslado_ganado\` t
     WHERE t.${columna} = :id_potrero
     ORDER BY t.fecha_movimiento DESC, t.id_traslado DESC`,
    { replacements: { id_potrero }, type: QueryTypes.SELECT }
  );
}

// #5: recorrido cronológico de un animal a través de sus traslados.
async function getRecorridoByGanado(id_ganado, { desde, hasta } = {}) {
  const conditions = ['d.id_ganado = :id_ganado'];
  const replacements = { id_ganado };
  if (desde) {
    conditions.push('t.fecha_movimiento >= :desde');
    replacements.desde = desde;
  }
  if (hasta) {
    conditions.push('t.fecha_movimiento <= :hasta');
    replacements.hasta = hasta;
  }

  const rows = await sequelize.query(
    `SELECT t.id_traslado, t.fecha_movimiento, t.observaciones,
            po.id_potrero AS origen_id_potrero, po.nombre AS origen_nombre,
            pd.id_potrero AS destino_id_potrero, pd.nombre AS destino_nombre
     FROM \`traslado_ganado_detalle\` d
     JOIN \`traslado_ganado\` t ON t.id_traslado = d.id_traslado
     JOIN \`potrero\` po ON po.id_potrero = t.id_potrero_origen
     JOIN \`potrero\` pd ON pd.id_potrero = t.id_potrero_destino
     WHERE ${conditions.join(' AND ')}
     ORDER BY t.fecha_movimiento ASC, t.id_traslado ASC`,
    { replacements, type: QueryTypes.SELECT }
  );

  return rows.map((row) => ({
    id_traslado: row.id_traslado,
    fecha_movimiento: row.fecha_movimiento,
    observaciones: row.observaciones,
    potrero_origen: { id_potrero: row.origen_id_potrero, nombre: row.origen_nombre },
    potrero_destino: { id_potrero: row.destino_id_potrero, nombre: row.destino_nombre },
  }));
}

// #6: analíticas agregadas de traslados de una estancia en un período.
// Permanencia promedio y ocupación histórica quedan afuera a propósito
// (dependen de asignacion_ganado, no de este recurso — ver PR).
async function getAnaliticasByEstancia(id_estancia, { desde, hasta } = {}) {
  const conditions = ['t.id_estancia = :id_estancia'];
  const replacements = { id_estancia };
  if (desde) {
    conditions.push('t.fecha_movimiento >= :desde');
    replacements.desde = desde;
  }
  if (hasta) {
    conditions.push('t.fecha_movimiento <= :hasta');
    replacements.hasta = hasta;
  }
  const whereClause = conditions.join(' AND ');

  const [totales] = await sequelize.query(
    `SELECT COUNT(DISTINCT t.id_traslado) AS total_traslados, COUNT(d.id_ganado) AS total_animales_movidos
     FROM \`traslado_ganado\` t
     JOIN \`traslado_ganado_detalle\` d ON d.id_traslado = t.id_traslado
     WHERE ${whereClause}`,
    { replacements, type: QueryTypes.SELECT }
  );

  const entradasPorPotrero = await sequelize.query(
    `SELECT t.id_potrero_destino AS id_potrero, p.nombre, COUNT(d.id_ganado) AS cantidad_animales
     FROM \`traslado_ganado\` t
     JOIN \`traslado_ganado_detalle\` d ON d.id_traslado = t.id_traslado
     JOIN \`potrero\` p ON p.id_potrero = t.id_potrero_destino
     WHERE ${whereClause}
     GROUP BY t.id_potrero_destino, p.nombre
     ORDER BY cantidad_animales DESC`,
    { replacements, type: QueryTypes.SELECT }
  );

  const salidasPorPotrero = await sequelize.query(
    `SELECT t.id_potrero_origen AS id_potrero, p.nombre, COUNT(d.id_ganado) AS cantidad_animales
     FROM \`traslado_ganado\` t
     JOIN \`traslado_ganado_detalle\` d ON d.id_traslado = t.id_traslado
     JOIN \`potrero\` p ON p.id_potrero = t.id_potrero_origen
     WHERE ${whereClause}
     GROUP BY t.id_potrero_origen, p.nombre
     ORDER BY cantidad_animales DESC`,
    { replacements, type: QueryTypes.SELECT }
  );

  const matrizOrigenDestino = await sequelize.query(
    `SELECT t.id_potrero_origen, po.nombre AS potrero_origen_nombre,
            t.id_potrero_destino, pd.nombre AS potrero_destino_nombre,
            COUNT(d.id_ganado) AS cantidad_animales
     FROM \`traslado_ganado\` t
     JOIN \`traslado_ganado_detalle\` d ON d.id_traslado = t.id_traslado
     JOIN \`potrero\` po ON po.id_potrero = t.id_potrero_origen
     JOIN \`potrero\` pd ON pd.id_potrero = t.id_potrero_destino
     WHERE ${whereClause}
     GROUP BY t.id_potrero_origen, po.nombre, t.id_potrero_destino, pd.nombre
     ORDER BY cantidad_animales DESC`,
    { replacements, type: QueryTypes.SELECT }
  );

  // Último traslado que tocó cada potrero (como origen o como destino):
  // se unifican ambos roles en una sola serie y se toma el más reciente
  // por potrero con ROW_NUMBER() (MySQL 8, ya usado en otras partes del
  // proyecto vía funciones espaciales de la misma versión).
  const ultimoPorPotrero = await sequelize.query(
    `SELECT ranked.id_potrero, p.nombre, ranked.id_traslado, ranked.fecha_movimiento
     FROM (
       SELECT id_potrero, id_traslado, fecha_movimiento,
              ROW_NUMBER() OVER (PARTITION BY id_potrero ORDER BY fecha_movimiento DESC, id_traslado DESC) AS rn
       FROM (
         SELECT t.id_potrero_origen AS id_potrero, t.id_traslado, t.fecha_movimiento
         FROM \`traslado_ganado\` t
         WHERE ${whereClause}
         UNION ALL
         SELECT t.id_potrero_destino AS id_potrero, t.id_traslado, t.fecha_movimiento
         FROM \`traslado_ganado\` t
         WHERE ${whereClause}
       ) tocados
     ) ranked
     JOIN \`potrero\` p ON p.id_potrero = ranked.id_potrero
     WHERE ranked.rn = 1`,
    { replacements, type: QueryTypes.SELECT }
  );

  return {
    totalTraslados: Number(totales?.total_traslados ?? 0),
    totalAnimalesMovidos: Number(totales?.total_animales_movidos ?? 0),
    entradasPorPotrero,
    salidasPorPotrero,
    matrizOrigenDestino,
    rutasMasFrecuentes: matrizOrigenDestino.slice(0, 5),
    ultimoTrasladoPorPotrero: ultimoPorPotrero,
  };
}

module.exports = {
  crearTraslado,
  crearDetalle,
  getTrasladoConDetalleById,
  listar,
  getTrasladosByPotrero,
  getRecorridoByGanado,
  getAnaliticasByEstancia,
};
