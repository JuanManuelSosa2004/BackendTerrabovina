'use strict';
module.exports = {
  async up(q, S) {
    const tables = await q.showAllTables();
    if (tables.includes('intrapotrero_version')) return;
    await q.createTable('intrapotrero_version', {
      id: {type:S.INTEGER,primaryKey:true,autoIncrement:true},
      id_potrero: {type:S.INTEGER,allowNull:false,references:{model:'potrero',key:'id_potrero'},onDelete:'CASCADE'},
      id_usuario: {type:S.INTEGER,allowNull:false},
      vigente_desde: {type:S.DATEONLY,allowNull:false},
      geometria_potrero: {type:S.JSON,allowNull:false},
      configuracion: {type:S.JSON,allowNull:false},
      analisis: {type:S.JSON,allowNull:false},
      created_at: {type:S.DATE,allowNull:false,defaultValue:S.literal('CURRENT_TIMESTAMP')},
    });
    await q.addIndex('intrapotrero_version',['id_potrero','id']);
  },
  async down(q) { await q.dropTable('intrapotrero_version'); },
};
