'use strict';
module.exports = {
  async up(q, S) {
    const columns = await q.describeTable('potrero');
    if (!columns.habilitado_ganado) await q.addColumn('potrero', 'habilitado_ganado', {
      type: S.BOOLEAN, allowNull: false, defaultValue: true,
    });
  },
  async down(q) { await q.removeColumn('potrero', 'habilitado_ganado'); },
};
