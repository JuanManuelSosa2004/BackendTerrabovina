'use strict';
const KEYS=['min','central','max'];
const sameGeometry=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function revisionForDay(revisions,fecha,geom) {
  // Select latest revision first; do not revive an older version on boundary changes.
  const revision=revisions.filter(r=>r.vigente_desde<=fecha).at(-1);
  return revision && sameGeometry(revision.geometria_potrero,geom) ? revision : null;
}
function applyEnvironments(row,revisions,geom) {
  row.base_bruto ??= {...row.bruto};
  row.base_utilizable ??= {...row.utilizable};
  const revision=revisionForDay(revisions,row.fecha,geom);
  const month=Number(row.fecha.slice(5,7))-1;
  const factor=revision?.analisis.factor_mensual?.[month] ?? 1;
  if (!Number.isFinite(factor) || factor<0) throw Error('Factor ambiental inválido.');
  row.bruto=Object.fromEntries(KEYS.map(k=>[k,row.base_bruto[k]*factor]));
  row.utilizable=Object.fromEntries(KEYS.map(k=>[k,row.base_utilizable[k]*factor]));
  row.intrapotrero={version:revision?.id??null,factor,matriz:revision?.analisis.matriz_version??null};
  return row;
}
function summarize(analysis,stock,animals=0,revisionId=null) {
  const area=analysis.superficie_total_ha, accessible=analysis.superficie_pastoreable_ha;
  const share=area>0 ? Math.max(0,Math.min(1,accessible/area)) : 0;
  const month=Number(analysis.fecha.slice(5,7))-1;
  const gross=Number(stock?.crecimiento_bruto_kg_ms_ha_dia);
  const usable=Number(stock?.crecimiento_utilizable_kg_ms_ha_dia);
  const stockTotal=Number(stock?.stock_final_total_kg_ms);
  const lastDay=stock?.detalle_json?.seguimiento_diario?.dias?.at(-1);
  const currentVersion=lastDay?.intrapotrero?.version??null;
  const pending=revisionId!==currentVersion;
  const ratio=analysis.referencia_ponderada_mensual[month]>0
    ? analysis.referencia_accesible_mensual[month]/analysis.referencia_ponderada_mensual[month] : share;
  const valid=stock && stock.fecha_objetivo===analysis.fecha && !pending;
  return {superficie_total_ha:area,superficie_pastoreable_ha:accessible,
    animales:animals,carga_cabezas_ha_pastoreable:accessible>0?animals/accessible:null,
    crecimiento_bruto_kg_ms_ha_dia:valid&&Number.isFinite(gross)?gross:null,
    crecimiento_utilizable_total_kg_ms_dia:valid&&Number.isFinite(usable)?usable*area:null,
    crecimiento_accesible_total_kg_ms_dia:valid&&Number.isFinite(usable)?usable*area*ratio:null,
    stock_estimado_total_kg_ms:stock&&Number.isFinite(stockTotal)?stockTotal:null,
    stock_accesible_proxy_kg_ms:valid&&Number.isFinite(stockTotal)?stockTotal*share:null,
    stock_fecha:stock?.fecha_objetivo??null,pendiente_actualizar:!valid,
    nota_stock_accesible:'Aproximación por superficie accesible: supone distribución uniforme del saldo. No mide biomasa por zona ni modifica el stock total.',
    nota_crecimiento:'Anomalía satelital común al potrero; referencia mensual ponderada por ambientes.'};
}
module.exports={sameGeometry,revisionForDay,applyEnvironments,summarize};
