const { randomUUID } = require('crypto');
const jobs = new Map();
function start(potreroId, run) {
  const previous = jobs.get(potreroId);
  if (previous?.estado === 'EJECUTANDO') return previous;
  const job = { id: randomUUID(), estado: 'EJECUTANDO', iniciado: new Date().toISOString() };
  jobs.set(potreroId, job);
  Promise.resolve().then(run).then(resultado => {
    Object.assign(job, { estado: 'COMPLETADO', resultado });
  }).catch(error => {
    Object.assign(job, { estado: 'ERROR', error: error.message });
  }).finally(() => {
    job.finalizado = new Date().toISOString();
    setTimeout(() => { if (jobs.get(potreroId) === job) jobs.delete(potreroId); }, 3600000).unref();
  });
  return job;
}
module.exports = { start, get: id => jobs.get(id) ?? { estado: 'SIN_TAREA' } };
