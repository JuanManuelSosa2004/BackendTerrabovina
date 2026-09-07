'use strict';
module.exports = {
  async up(q, S) {
    const columns = await q.describeTable('asignacion_ganado');
    if (columns.dmi_ingreso_kg_dia) return;
    try { await q.addColumn('asignacion_ganado', 'dmi_ingreso_kg_dia', { type:S.DECIMAL(12,4), allowNull:true }); }
    catch (error) { if (error.original?.code !== 'ER_DUP_FIELDNAME') throw error; }
  },
  async down(q) { await q.removeColumn('asignacion_ganado', 'dmi_ingreso_kg_dia'); },
};
