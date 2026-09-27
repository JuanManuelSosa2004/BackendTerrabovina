'use strict';
const repo=require('../database/sql/intrapotrero.repository');
const paddocks=require('../database/sql/potrero.repository');
const stocks=require('../database/sql/estimacionStock.repository');
const cattle=require('../database/sql/ganado.repository');
const {sequelize}=require('../database/sequelize');
const {analyzeIntrapaddock,ModeloPredictivoError}=require('../services/modeloPredictivo.client');
const {sameGeometry,summarize}=require('../services/intrapotrero.service');
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function errorResponse(error,res) {
  if (error instanceof ModeloPredictivoError) {
    let detail; try {detail=JSON.parse(error.detail).error;} catch { /* non-JSON upstream */ }
    return res.status(error.status===422?422:503).json({error:detail||'No se pudo consultar el análisis. La última versión guardada se conserva.'});
  }
  throw error;
}
async function get(req,res) {
  const id=req.potrero.id_potrero;
  const [p,version,stock,animals]=await Promise.all([paddocks.getPotreroById(id),repo.latest(id),stocks.getUltimaByPotrero(id),cattle.getGanadoByPotrero(id)]);
  const changed=version && !sameGeometry(version.geometria_potrero,p.geom);
  try {
    const analysis=await analyzeIntrapaddock({geojson:p.geom,fecha:today(),configuracion:changed?{zonas:[]}:version?.configuracion??{zonas:[]}});
    return res.json({version:version?.id??null,vigente_desde:version?.vigente_desde??null,guardado_en:version?.created_at??null,
      limites_modificados:Boolean(changed),requiere_revision:Boolean(changed),analisis:analysis,
      resumen:summarize(analysis,stock,animals.length,changed?null:version?.id??null),
      configuracion:version?.configuracion??{zonas:[]}});
  } catch(error) {
    if (version && error instanceof ModeloPredictivoError) return res.json({version:version.id,configuracion:version.configuracion,
      analisis:version.analisis,guardado_en:version.created_at,vigente_desde:version.vigente_desde,
      limites_modificados:Boolean(changed),requiere_revision:true,sin_actualizar:true,
      advertencia:'Servicio de análisis no disponible. Se muestra la última versión guardada con su fecha.'});
    return errorResponse(error,res);
  }
}
async function save(req,res) {
  const id=req.potrero.id_potrero,body=req.body;
  if (!body || !Number.isInteger(body.version_base) || body.version_base<0 || !Array.isArray(body.zonas))
    return res.status(400).json({error:'Se requieren version_base y zonas.'});
  const p=await paddocks.getPotreroById(id);
  if (!p?.activo) return res.status(409).json({error:'El potrero está inactivo.'});
  let analysis;
  try {analysis=await analyzeIntrapaddock({geojson:p.geom,fecha:today(),configuracion:{zonas:body.zonas}});}
  catch(error){return errorResponse(error,res);}
  const result=await sequelize.transaction(async transaction=>{
    await sequelize.query('SELECT id_potrero FROM potrero WHERE id_potrero=:id FOR UPDATE',{replacements:{id},transaction});
    const current=await repo.latest(id,transaction);
    const fresh=await paddocks.getPotreroById(id,transaction);
    if ((current?.id??0)!==body.version_base || !fresh.activo || !sameGeometry(fresh.geom,p.geom)) return null;
    return repo.create({id_potrero:id,id_usuario:req.usuario.id_usuario,vigente_desde:today(),geometria_potrero:p.geom,
      configuracion:analysis.configuracion,analisis:analysis},transaction);
  });
  if (!result) return res.status(409).json({error:'El potrero cambió en otra sesión. Recargá antes de guardar.'});
  return res.status(201).json({version:result.id,vigente_desde:result.vigente_desde,guardado_en:result.created_at,
    configuracion:result.configuracion,analisis:analysis,mensaje:'Zonas guardadas. Actualizá el balance para reflejar la superficie accesible. El relieve no ajusta el crecimiento.'});
}
async function history(req,res) {
  const versions=await repo.history(req.potrero.id_potrero);
  return res.json({versiones:versions.map(v=>({id:v.id,vigente_desde:v.vigente_desde,created_at:v.created_at,
    cantidad_zonas:v.configuracion.zonas.length,configuracion:v.configuracion}))});
}
module.exports={get,save,history};
