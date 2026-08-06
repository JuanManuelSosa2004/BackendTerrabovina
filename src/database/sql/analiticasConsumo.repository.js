'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

// Analíticas agregadas de una estancia para las gráficas del dashboard
// (torta de carga animal, torta de forraje, línea de crecimiento). Igual
// que trasladoGanado.repository#getAnaliticasByEstancia: varias queries
// independientes compuestas en un solo objeto.
async function getAnaliticasConsumo(id_estancia) {
  const distribucionCargaAnimalRaw = await sequelize.query(
    `SELECT categoria, COUNT(*) AS cantidad_animales
     FROM \`ganado\`
     WHERE id_estancia = :id_estancia AND activo = TRUE
     GROUP BY categoria
     ORDER BY cantidad_animales DESC`,
    { replacements: { id_estancia }, type: QueryTypes.SELECT }
  );
  const distribucionCargaAnimal = distribucionCargaAnimalRaw.map((row) => ({
    categoria: row.categoria,
    cantidad_animales: Number(row.cantidad_animales),
  }));

  // Última medición de disponibilidad forrajera por potrero de la estancia
  // (ROW_NUMBER() PARTITION BY id_potrero, mismo patrón que
  // trasladoGanado.repository#getAnaliticasByEstancia usa para "último
  // traslado por potrero"). Potreros sin ninguna medición quedan afuera:
  // no hay forraje que repartir en la torta si nunca se calculó.
  const ultimaPorPotrero = await sequelize.query(
    `SELECT ranked.id_potrero, p.nombre, ranked.kg_materia_seca_ha, ranked.superficie_analizada_ha
     FROM (
       SELECT df.id_potrero, df.kg_materia_seca_ha, df.superficie_analizada_ha,
              ROW_NUMBER() OVER (PARTITION BY df.id_potrero ORDER BY df.fecha_calculo DESC, df.id_disponibilidad DESC) AS rn
       FROM \`disponibilidad_forrajera\` df
       JOIN \`potrero\` p2 ON p2.id_potrero = df.id_potrero
       WHERE p2.id_estancia = :id_estancia
     ) ranked
     JOIN \`potrero\` p ON p.id_potrero = ranked.id_potrero
     WHERE ranked.rn = 1`,
    { replacements: { id_estancia }, type: QueryTypes.SELECT }
  );

  const conForraje = ultimaPorPotrero.map((row) => ({
    id_potrero: row.id_potrero,
    nombre: row.nombre,
    kg_materia_seca_total: Number(row.kg_materia_seca_ha) * Number(row.superficie_analizada_ha ?? 0),
  }));
  const totalForraje = conForraje.reduce((total, p) => total + p.kg_materia_seca_total, 0);
  const distribucionForraje = conForraje.map((p) => ({
    ...p,
    kg_materia_seca_total: Number(p.kg_materia_seca_total.toFixed(2)),
    porcentaje: totalForraje > 0 ? Number(((p.kg_materia_seca_total / totalForraje) * 100).toFixed(2)) : 0,
  }));

  // Promedio de kg MS/ha entre potreros de la estancia por día calculado,
  // últimos 7 días de calendario. No se rellenan días sin ninguna medición
  // (las filas de disponibilidad_forrajera se crean a demanda, no por cron
  // diario): la serie queda con los huecos que haya, el frontend decide
  // cómo dibujarlos.
  // fecha_calculo es DATETIME (guarda hora real, ver toMysqlDatetimeUtc):
  // se agrupa por DATE() para que dos cálculos del mismo potrero el mismo
  // día de calendario, a horas distintas, caigan en el mismo punto.
  const crecimientoForraje7diasRaw = await sequelize.query(
    `SELECT DATE(df.fecha_calculo) AS fecha, AVG(df.kg_materia_seca_ha) AS kg_materia_seca_ha_promedio
     FROM \`disponibilidad_forrajera\` df
     JOIN \`potrero\` p ON p.id_potrero = df.id_potrero
     WHERE p.id_estancia = :id_estancia
       AND df.fecha_calculo >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
     GROUP BY DATE(df.fecha_calculo)
     ORDER BY fecha ASC`,
    { replacements: { id_estancia }, type: QueryTypes.SELECT }
  );
  const crecimientoForraje7dias = crecimientoForraje7diasRaw.map((row) => ({
    fecha: row.fecha,
    kg_materia_seca_ha_promedio: Number(Number(row.kg_materia_seca_ha_promedio).toFixed(2)),
  }));

  return { distribucionCargaAnimal, distribucionForraje, crecimientoForraje7dias };
}

module.exports = { getAnaliticasConsumo };
