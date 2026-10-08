'use strict';

// Transport only. Priority and distribution execute in Flask/rotation.
function unavailable() {
  const error = new Error('El motor de recomendaciones no está disponible. Intentá nuevamente.');
  error.status = 503;
  return error;
}

async function recommend(paddocks,groups) {
  const base = (process.env.MODEL_API_BASE_URL || '').replace(/\/$/, '');
  if (!base) throw unavailable();
  try {
    const response = await fetch(`${base}/rotation/recommendations`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({paddocks,...(groups?{groups}:{})}),
      signal:AbortSignal.timeout(15000),
    });
    if (!response.ok) throw unavailable();
    const result = await response.json();
    const ids = new Set(paddocks.map(p=>p.id));
    if (result?.version !== (groups?'rotacion_grupos_v1':'rotacion_por_potrero_v3') || result.engineRuntime !== 'python' ||
        result.priorityModel !== 'prioridad_sugeno_v1' || result.horizon !== 7 ||
        !Array.isArray(result.paddocks) || result.paddocks.length !== paddocks.length ||
        new Set(result.paddocks.map(p=>p.id)).size !== ids.size || result.paddocks.some(p=>!ids.has(p.id)) ||
        !Array.isArray(result.recommendations) || typeof result.partial !== 'boolean' ||
        !['excessPaddocks','closedPaddocks','toMove','allocated','pending'].every(k=>Number.isFinite(result.totals?.[k]) && result.totals[k]>=0)) throw unavailable();
    return result;
  } catch {
    // No silent JavaScript fallback: it would hide an incomplete migration.
    throw unavailable();
  }
}

async function validateTransfer(payload){
  const base=(process.env.MODEL_API_BASE_URL||'').replace(/\/$/,'');
  if(!base)throw unavailable();
  let response,result;
  try{response=await fetch(`${base}/rotation/validate-transfer`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});result=await response.json();}catch{throw unavailable();}
  if(response.status===422){const e=new Error(result.error||'Revisá las reglas del traslado.');e.status=422;throw e;}
  if(!response.ok||result.valid!==true)throw unavailable();
  return result;
}
module.exports = {recommend,validateTransfer};
