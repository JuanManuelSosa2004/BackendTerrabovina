'use strict';

const estanciaRepository = require('../database/sql/estancia.repository');
const { setEstanciaGeom } = require('../database/sql/geometry.repository');
const { isDuplicateEntryError } = require('../utils/dbErrors');

async function create(req, res) {
  const { id_usuario, nombre, departamento, provincia, superficie_total_ha } = req.body;
  if (!id_usuario || !nombre) {
    return res.status(400).json({ error: 'id_usuario y nombre son obligatorios.' });
  }
  try {
    const estancia = await estanciaRepository.createEstancia({
      id_usuario,
      nombre,
      departamento,
      provincia,
      superficie_total_ha,
    });
    return res.status(201).json(estancia);
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      return res.status(409).json({ error: 'El usuario ya tiene una estancia asociada.' });
    }
    return res.status(500).json({ error: 'Error al crear la estancia.' });
  }
}

async function getById(req, res) {
  const estancia = await estanciaRepository.getEstanciaById(req.params.id);
  if (!estancia) {
    return res.status(404).json({ error: 'Estancia no encontrada.' });
  }
  return res.json(estancia);
}

async function updateGeometria(req, res) {
  const existing = await estanciaRepository.getEstanciaById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Estancia no encontrada.' });
  }
  try {
    const geom = await setEstanciaGeom(req.params.id, req.body);
    return res.json({ id_estancia: Number(req.params.id), geom });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

//TESTEO TEMPORAL (ENDPOINT DEPRECABLE)
function geojsonPolygonToKml(id, nombre, geom) {
  if (!geom || geom.type !== 'Polygon') {
    throw new Error('La estancia no tiene un geom Polygon válido.');
  }

  const coordinates = geom.coordinates[0]
    .map(([lon, lat]) => `${lon},${lat},0`)
    .join(' ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Estancia ${id}</name>
    <Placemark>
      <name>${nombre || `Estancia ${id}`}</name>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${coordinates}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>`;
}

//TESTEO TEMPORAL (ENDPOINT DEPRECABLE)
async function getKml(req, res) {
    console.log('GET /estancias/:id/kml hit', req.params.id);

  const estancia = await estanciaRepository.getEstanciaById(req.params.id);
  if (!estancia) {
    return res.status(404).json({ error: 'Estancia no encontrada.' });
  }
  if (!estancia.geom) {
    return res.status(404).json({ error: 'La estancia no tiene geometría.' });
  }

  try {
    const kml = geojsonPolygonToKml(estancia.id_estancia, estancia.nombre, estancia.geom);

    res.set('Content-Type', 'application/vnd.google-earth.kml+xml');
    res.set('Content-Disposition', `attachment; filename="estancia-${estancia.id_estancia}.kml"`);
    return res.send(kml);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

module.exports = {
  create,
  getById,
  updateGeometria,
  getKml,
};
