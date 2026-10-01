'use strict';
module.exports={
  async up(q,S){
    const tables=await q.showAllTables();
    const id={type:S.INTEGER,primaryKey:true,autoIncrement:true};
    const estancia={type:S.INTEGER,allowNull:false,references:{model:'estancia',key:'id_estancia'},onDelete:'RESTRICT'};
    if(!tables.includes('rotacion_config')) await q.createTable('rotacion_config',{
      id_estancia:{...estancia,primaryKey:true},revision:{type:S.INTEGER,allowNull:false,defaultValue:0},
      datos:{type:S.JSON,allowNull:false},updated_at:{type:S.DATE,allowNull:false,defaultValue:S.literal('CURRENT_TIMESTAMP')}
    });
    if(!tables.includes('rotacion_demanda')) await q.createTable('rotacion_demanda',{
      id_ganado:{type:S.INTEGER,primaryKey:true,references:{model:'ganado',key:'id_ganado'},onDelete:'RESTRICT'},
      kg_dia:{type:S.DECIMAL(12,4),allowNull:false},atributos_hash:{type:S.STRING(64),allowNull:false},
      modelo:{type:S.STRING(120),allowNull:false},calculado_en:{type:S.DATE,allowNull:false}
    });
    if(!tables.includes('rotacion_observacion')) await q.createTable('rotacion_observacion',{
      id,id_estancia:estancia,id_potrero:{type:S.INTEGER,allowNull:false,references:{model:'potrero',key:'id_potrero'}},
      fecha:{type:S.DATEONLY,allowNull:false},datos:{type:S.JSON,allowNull:false},id_usuario:{type:S.INTEGER,allowNull:false},
      created_at:{type:S.DATE,allowNull:false,defaultValue:S.literal('CURRENT_TIMESTAMP')}
    });
    if(!tables.includes('rotacion_plan')) await q.createTable('rotacion_plan',{
      id,id_estancia:estancia,id_usuario:{type:S.INTEGER,allowNull:false},
      estado:{type:S.STRING(30),allowNull:false},snapshot_hash:{type:S.STRING(64),allowNull:false},
      snapshot:{type:S.JSON,allowNull:false},resultado:{type:S.JSON,allowNull:false},
      created_at:{type:S.DATE,allowNull:false,defaultValue:S.literal('CURRENT_TIMESTAMP')}
    });
    if(!tables.includes('rotacion_ejecucion')) {
      await q.createTable('rotacion_ejecucion',{
        id,id_plan:{type:S.INTEGER,allowNull:false,references:{model:'rotacion_plan',key:'id'}},
        paso:{type:S.STRING(100),allowNull:false},id_traslado:{type:S.INTEGER,allowNull:false,references:{model:'traslado_ganado',key:'id_traslado'}},
        created_at:{type:S.DATE,allowNull:false,defaultValue:S.literal('CURRENT_TIMESTAMP')}
      });
      await q.addIndex('rotacion_ejecucion',['id_plan','paso'],{unique:true});
    }
  },
  async down(q){for(const t of ['rotacion_ejecucion','rotacion_plan','rotacion_observacion','rotacion_demanda','rotacion_config']) await q.dropTable(t);}
};
