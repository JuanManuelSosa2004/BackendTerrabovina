const { sequelize } = require('../database/sequelize');
const { QueryTypes } = require('sequelize');
let busy = false;
async function tick() {
  if (busy) return;
  busy = true;
  try {
    const rows = await sequelize.query(`SELECT DISTINCT p.id_potrero FROM potrero p
      JOIN estimacion_stock s ON s.id_potrero=p.id_potrero
      JOIN estancia e ON e.id_estancia=p.id_estancia WHERE p.activo=1 AND e.activo=1`,{type:QueryTypes.SELECT});
    const jobs = require('./stockJobs');
    for (const row of rows) {
      if (jobs.get(row.id_potrero).estado === 'EJECUTANDO') continue;
      const latest = await require('../database/sql/estimacionStock.repository').getUltimaByPotrero(row.id_potrero);
      // Solo continúa balances que el usuario ya inicializó con esta metodología.
      if (latest?.version_metodologia !== require('./stockDaily.service').VERSION) continue;
      const today = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      if (String(latest.fecha_objetivo).slice(0,10) === today) continue;
      let status = 200;
      const res = {status(v){status=v;return this;},json(){return this;}};
      await require('../controllers/estimacion.controller').crearEstimacionStock({potrero:row,body:{fecha:today}},res);
      if (status >= 400) console.warn('No se pudo iniciar saldo diario',row.id_potrero,status);
    }
  } catch(e) { console.error('Saldo diario:',e.message); }
  finally {busy=false;}
}
function start(){tick();setInterval(tick,3600000).unref();}
module.exports={start,tick};
