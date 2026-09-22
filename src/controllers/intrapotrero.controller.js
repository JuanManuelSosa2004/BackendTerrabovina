'use strict';
const paddocks = require('../database/sql/potrero.repository');
const repository = require('../database/sql/intrapotrero.repository');
const service = require('../services/intrapotrero');
const jobs = require('../services/stockJobs');
const pending = new Set();
const key = id => `intrapotrero:${id}`;

function taskFor(id) {
  const job = jobs.get(key(id));
  return { id: job.id, estado: job.estado, error: job.error, iniciado: job.iniciado, finalizado: job.finalizado };
}

async function get(req, res) {
  const id = req.potrero.id_potrero;
  const paddock = await paddocks.getPotreroById(id);
  const analysis = paddock?.geom ? await repository.get(id, service.geometryHash(paddock.geom)) : null;
  return res.json({ analysis, task: taskFor(id) });
}

async function refresh(req, res) {
  const id = req.potrero.id_potrero;
  if (pending.has(id)) return res.status(202).json({ task: taskFor(id) });
  if (pending.size >= 3) return res.status(429).json({ error: 'Hay otros análisis en curso. Reintentá en unos minutos.' });
  const paddock = await paddocks.getPotreroById(id);
  if (!paddock?.geom) return res.status(422).json({ error: 'El potrero necesita un límite geográfico para analizarlo.' });
  // Recheck after the DB await: concurrent requests must not create duplicate jobs.
  if (pending.has(id)) return res.status(202).json({ task: taskFor(id) });
  if (pending.size >= 3) return res.status(429).json({ error: 'Hay otros análisis en curso. Reintentá en unos minutos.' });
  const hash = service.geometryHash(paddock.geom);
  pending.add(id);
  jobs.start(key(id), async () => {
    try {
      const analysis = await service.analyze(paddock.geom);
      await repository.save(id, hash, analysis);
      return { saved: true };
    } finally {
      pending.delete(id);
    }
  });
  return res.status(202).json({ task: taskFor(id) });
}

module.exports = { get, refresh };
