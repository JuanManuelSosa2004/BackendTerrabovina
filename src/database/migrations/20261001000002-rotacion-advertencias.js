'use strict';
module.exports={async up(q,S){const cols=await q.describeTable('rotacion_demanda');if(!cols.advertencias)await q.addColumn('rotacion_demanda','advertencias',{type:S.JSON,allowNull:true});},async down(q){await q.removeColumn('rotacion_demanda','advertencias');}};
