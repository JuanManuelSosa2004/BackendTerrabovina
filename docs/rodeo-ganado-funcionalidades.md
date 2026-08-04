# Funcionalidades de Rodeo y Ganado

## Contexto

Antes de esta sesión el proyecto exponía CRUD parcial (create + getById +
update de geometría) para `Estancia` y `Potrero`. Los modelos `Rodeo` y
`Ganado` ya existían en `src/database/models/` y en las migraciones desde el
scaffolding inicial (commit `8d3dc7b`), pero no tenían controllers, rutas ni
repositorio: no eran alcanzables por la API.

Esta sesión agregó esa capa faltante para `Rodeo` (`estancia 1--N rodeo`,
`potrero 1--N rodeo` vía `id_potrero_actual`, nullable) y `Ganado`
(`rodeo 1--N ganado`), con el mismo patrón arquitectónico que ya usan
Estancia/Potrero.

## Decisiones de diseño

- **Capa de datos 100% SQL crudo parametrizado.** Igual que
  `estancia.repository.js` / `potrero.repository.js`, los nuevos
  `rodeo.repository.js` y `ganado.repository.js` usan `sequelize.query` con
  `replacements` en vez de `Model.create/update`. Los modelos Sequelize
  (`src/database/models/*.model.js`) siguen existiendo solo para declarar el
  schema y las asociaciones (`src/database/models/index.js`); ningún
  controller de la app los usa en runtime.
- **Alcance: CRUD completo + operaciones de transferencia** (decisión tomada
  con el usuario antes de implementar, ver plan de la sesión): además de
  create/get/update, se agregaron endpoints de negocio para mover un rodeo a
  otro potrero y transferir un animal a otro rodeo.
- **Validación de consistencia de FK:** un rodeo solo puede apuntar
  (`id_potrero_actual`) a un potrero que pertenezca a su misma estancia. Se
  valida tanto en la creación del rodeo como en `PATCH /rodeos/:id/potrero`,
  reutilizando `potreroRepository.getPotreroById` (no se agregó SQL nuevo
  para esto).
- **Transferencia de ganado restringida a la misma estancia:** por simetría
  con la regla anterior, `PATCH /ganados/:id/rodeo` solo permite mover un
  animal a un rodeo de la misma estancia que su rodeo actual. Mover un animal
  a otra estancia se modela como venta (`estado: VENDIDO`) más un alta nueva
  en la estancia destino, no como transferencia directa. Esta es una decisión
  de diseño explícita, no una limitación técnica — si el negocio necesita
  transferencias entre estancias, hay que revisar esta regla.
- **`isDuplicateEntryError` extraída a `src/utils/dbErrors.js`.** Antes vivía
  inline en `estancia.controller.js` (para el `unique` de
  `estancia.id_usuario`); se movió a un util compartido para reutilizarla
  también en `ganado.controller.js` (choque de `numero_identificacion`
  único, ver `usuario_model` unique constraint equivalente en la migración
  `20260713170126-create-ganado.js`).

## Archivos nuevos

| Archivo | Contenido |
|---|---|
| `src/database/sql/rodeo.repository.js` | `createRodeo`, `getRodeoById`, `updateRodeo` (UPDATE dinámico solo con las claves presentes en el body), `updateRodeoPotrero` |
| `src/database/sql/ganado.repository.js` | `createGanado`, `getGanadoById`, `getGanadoByRodeo`, `updateGanado` (mismo patrón de UPDATE dinámico), `updateGanadoRodeo` |
| `src/controllers/rodeo.controller.js` | `create`, `getById`, `update`, `updatePotrero`, `listGanado` |
| `src/controllers/ganado.controller.js` | `create`, `getById`, `update`, `updateRodeo` (transferencia) |
| `src/routes/rodeo.routes.js` | Rutas de rodeo |
| `src/routes/ganado.routes.js` | Rutas de ganado |
| `src/utils/dbErrors.js` | `isDuplicateEntryError`, extraída de `estancia.controller.js` |
| `tests/rodeo-ganado.test.js` | 20 tests end-to-end con supertest |

## Archivos modificados

- `src/app.js` — registra `app.use('/rodeos', ...)` y `app.use('/ganados', ...)`.
- `src/controllers/estancia.controller.js` — importa `isDuplicateEntryError` desde `../utils/dbErrors` en vez de definirla inline.

## Endpoints agregados

### Rodeo (`/rodeos`)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/rodeos` | Crea un rodeo. Body: `id_estancia` (obligatorio), `nombre` (obligatorio), `descripcion`, `id_potrero_actual` (opcional, debe pertenecer a la misma estancia), `activo` (default `true`) |
| GET | `/rodeos/:id` | Obtiene un rodeo por id (404 si no existe) |
| PATCH | `/rodeos/:id` | Actualiza parcialmente `nombre`/`descripcion`/`activo` (400 si no viene ningún campo) |
| PATCH | `/rodeos/:id/potrero` | Mueve el rodeo a otro potrero. Body: `{ id_potrero_actual }` (acepta `null` para desasignar). 400 si el potrero no pertenece a la estancia del rodeo |
| GET | `/rodeos/:id/ganado` | Lista los animales del rodeo (404 si el rodeo no existe) |

### Ganado (`/ganados`)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/ganados` | Crea un animal. Body: `id_rodeo`, `numero_identificacion`, `sexo`, `categoria` (obligatorios), `fecha_nacimiento`, `peso_kg`, `estado` (default `ACTIVO`), `observaciones`. 400 si `id_rodeo` no existe, 409 si `numero_identificacion` está duplicado |
| GET | `/ganados/:id` | Obtiene un animal por id (404 si no existe) |
| PATCH | `/ganados/:id` | Actualiza parcialmente cualquiera de los campos de negocio (400 si no viene ninguno, 409 si el nuevo `numero_identificacion` está duplicado) |
| PATCH | `/ganados/:id/rodeo` | Transfiere el animal a otro rodeo. Body: `{ id_rodeo }`. 400 si el rodeo destino no existe o pertenece a otra estancia |

## Tests

`tests/rodeo-ganado.test.js` sigue el mismo esquema que el `tests/geometria.test.js`
preexistente (supertest + `beforeAll`/`afterAll` contra la base `test` real,
levantada por `tests/globalSetup.js`/`globalTeardown.js`). Fixtures: 2 usuarios,
2 estancias (cada una con su `geom` seteado vía `PATCH .../geometria`, ver
"Bug encontrado" abajo) y un potrero por estancia, para poder probar la
validación cruzada de consistencia de FK.

Casos cubiertos (20 tests, todos en verde):
- Alta de rodeo sin potrero y con potrero válido; 400 por campos faltantes;
  400 por potrero de otra estancia.
- `GET`/`PATCH` de rodeo, incluyendo 404 y actualización parcial.
- Asignar, reasignar (rechazando cruce de estancia) y desasignar
  (`null`) el potrero de un rodeo.
- Alta de ganado válida; 400 por campos faltantes o `id_rodeo` inexistente;
  409 por `numero_identificacion` duplicado.
- `GET`/`PATCH` de ganado, incluyendo actualización de `peso_kg`/`estado`.
- Transferencia de ganado válida (misma estancia) y rechazada (otra estancia).
- `GET /rodeos/:id/ganado` reflejando altas y transferencias, y 404 para
  rodeo inexistente.

**Nota sobre el cleanup:** el `afterAll` borra las filas en orden inverso a
las FK (`ganado` → `rodeo` → `zona_potrero` → `potrero` → `estancia` →
`usuario`) porque todas las FK del schema son `ON DELETE RESTRICT`
(`rodeo.id_estancia`, `ganado.id_rodeo`, etc. — ver
`src/database/migrations/`). Borrar `usuario` directamente sin borrar antes
sus `estancia`/`potrero`/`rodeo`/`ganado` asociados falla por violación de FK.

## Bug preexistente encontrado (no corregido en esta sesión)

Al correr la suite completa, `tests/geometria.test.js` fallaba —
**ya fallaba antes de esta sesión**, confirmado corriendo el test contra el
commit `8d3dc7b` con `git stash` antes de tocar nada: `potrero.controller.js`
exige `geom` obligatorio en el body de `POST /potreros`
(`if (!geom) return res.status(400)...`), pero ese test crea el potrero sin
`geom` y lo agrega después vía `PATCH /potreros/:id/geometria`. Efecto en
cascada: al fallar la creación del potrero, los tests siguientes de esa suite
(`PATCH + GET`, la relación FK) también fallan, y el `afterAll` de ese archivo
falla aparte por el mismo problema de orden de borrado con FK `RESTRICT`
descrito arriba (`DELETE FROM usuario` sin borrar antes la `estancia`
asociada).

Para los tests nuevos de Rodeo/Ganado se evitó este problema seteando el
`geom` de la estancia vía `PATCH` y pasando `geom` en el body de
`POST /potreros` en los fixtures — pero el bug en sí
(`tests/geometria.test.js` roto contra el `potrero.controller.js` actual)
sigue sin solucionar. Es el objetivo de la próxima rama dedicada.

## Verificación

- `npm test` — pasa `tests/rodeo-ganado.test.js` (20/20) y
  `tests/prisma-removed.test.js`; `tests/geometria.test.js` falla por el bug
  preexistente descripto arriba (3/11 tests), no por los cambios de esta
  sesión.
