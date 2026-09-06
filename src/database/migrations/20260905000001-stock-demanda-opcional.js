'use strict';
module.exports = {
  async up(q, S) {
    await q.changeColumn('estimacion_stock', 'id_estimacion_demanda', {type:S.INTEGER,allowNull:true});
  },
  async down(q, S) {
    // No borrar estimaciones sin ganado para revertir.
    const [rows] = await q.sequelize.query('SELECT COUNT(*) AS total FROM estimacion_stock WHERE id_estimacion_demanda IS NULL');
    if (Number(rows[0].total)) throw Error('Hay estimaciones sin DMI; no se puede exigir demanda sin perder datos.');
    await q.changeColumn('estimacion_stock', 'id_estimacion_demanda', {type:S.INTEGER,allowNull:false});
  },
};
