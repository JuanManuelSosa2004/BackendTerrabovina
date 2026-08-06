const path = require('path');
const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');

const app = express();

// Sin esto, cualquier frontend en un origen distinto (Railway, localhost en
// otro puerto, etc.) recibe un preflight sin 'Access-Control-Allow-Origin'
// y el navegador bloquea la request antes de que llegue acá — curl no lo
// reproduce porque no hace preflight, por eso pasaba desapercibido en
// pruebas manuales. CORS_ORIGINS (opcional, coma-separado) permite sumar
// otros orígenes sin tocar código; FRONTEND_URL ya existía para el link
// del mail de recuperación, se reutiliza acá con el mismo criterio.
const DEFAULT_ALLOWED_ORIGINS = [
  'https://pfi-front-production.up.railway.app',
  'http://localhost:3000',
  'http://localhost:5173',
];
const envOrigins = [process.env.FRONTEND_URL, ...(process.env.CORS_ORIGINS ?? '').split(',')]
  .map((origin) => origin?.trim().replace(/\/$/, ''))
  .filter(Boolean);
const allowedOrigins = [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...envOrigins])];

app.use(cors({ origin: allowedOrigins }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Recursos en singular, anidados según docs/REST_API_TerraBovina V2.xlsx.
app.use('/api/v2/auth', require('./routes/auth.routes'));
app.use('/api/v2/usuarios', require('./routes/usuario.routes'));
app.use('/api/v2/estancia', require('./routes/estancia.routes'));
app.use('/api/v2/potrero', require('./routes/potrero.routes'));
app.use('/api/v2/ganado', require('./routes/ganado.routes'));
app.use('/api/v2/empleado', require('./routes/empleado.routes'));
app.use('/api/v2/asignacion-ganado', require('./routes/asignacionGanado.routes'));
app.use('/api/v2/traslado-ganado', require('./routes/trasladoGanado.routes'));

// Documentación pública (sin auth): Swagger UI sobre docs/openapi.yaml. Si
// el archivo falta o no parsea, se loguea y se sigue sin montar /docs — la
// documentación nunca debe poder tirar abajo la API real.
try {
  const openapiSpec = YAML.load(path.join(__dirname, '..', 'docs', 'openapi.yaml'));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));
} catch (error) {
  console.error('No se pudo cargar docs/openapi.yaml, /docs no estará disponible:', error.message);
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// §3.2: "las solicitudes y respuestas utilizan JSON como formato general".
// Sin este handler, un error no controlado en un route handler async cae
// en la página de error HTML por defecto de Express.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

module.exports = app;
