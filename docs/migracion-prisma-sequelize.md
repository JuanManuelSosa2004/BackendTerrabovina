# Migración de Prisma a Sequelize

## Motivo del cambio

El proyecto necesitaba columnas geoespaciales nativas (`POLYGON SRID 4326`)
para estancias, potreros y zonas de potrero, con control fino sobre el DDL
espacial de MySQL 8 y la posibilidad de resolver las consultas de negocio con
SQL puro. Prisma no ofrece soporte nativo de tipos `GEOMETRY`/`POLYGON` en
MySQL en la versión usada por el scaffold inicial, por lo que se reemplazó por
Sequelize + `sequelize-cli`, que permite declarar el tipo `GEOMETRY` en los
modelos y, cuando hace falta, escribir el DDL espacial exacto a mano en las
migraciones.

En el momento de esta migración, el `schema.prisma` del repo **no tenía
ningún modelo definido** (solo `generator`/`datasource`) y nunca se había
corrido `prisma migrate`, por lo que no existía estado previo que preservar.
Se conserva una copia de ese archivo aquí como referencia histórica:

```prisma
// This is your Prisma schema file,
// learn more about it in the docs: https://pris.ly/d/prisma-schema

// Get a free hosted Postgres database in seconds: `npx create-db`

generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "mysql"
}
```

## Dependencias

- **Removidas**: `prisma` (devDependency). No había `@prisma/client` instalado.
- **Agregadas**: `sequelize`, `mysql2` (dependencies); `sequelize-cli`, `jest`,
  `supertest` (devDependencies).

## Equivalencia de modelos

Ningún modelo de negocio (Usuario, Estancia, Potrero, ZonaPotrero, Rodeo,
Ganado) existía todavía en Prisma — se definieron por primera vez directamente
en Sequelize, en `src/database/models/`, a partir de un DER provisto por el
usuario. Ver ese DER y las decisiones tomadas en el historial de la migración;
resumen de tablas y columnas en cada archivo `*.model.js`.

## Estrategia de migraciones / baseline

No existían migraciones de Prisma previas ni tablas creadas por Prisma (nunca
corrió `prisma migrate`), así que no hizo falta ninguna estrategia de baseline
sobre datos existentes: las migraciones de Sequelize (`src/database/migrations/`)
parten de una base vacía y crean las 6 tablas desde cero, en orden de
dependencia de claves foráneas:

1. `usuario`
2. `estancia` (FK → usuario, `geom` POLYGON SRID 4326)
3. `potrero` (FK → estancia, `geom` POLYGON SRID 4326)
4. `zona_potrero` (FK → potrero, `geom` POLYGON SRID 4326)
5. `rodeo` (FK → estancia y → potrero)
6. `ganado` (FK → rodeo)

Todas las migraciones tienen `down` reversible (`dropTable` / `DROP COLUMN`).

Si en el futuro se necesita aplicar esta migración sobre una base de datos que
**ya tiene tablas creadas manualmente** (fuera de Prisma/Sequelize), correr
primero `SHOW TABLES;` para confirmar el estado real antes de `npm run
db:migrate` — las migraciones fallan de forma segura (no sobrescriben) si una
tabla ya existe.

## Manejo de columnas POLYGON

- Los modelos declaran `geom: DataTypes.GEOMETRY('POLYGON', 4326)` para que el
  schema quede documentado y versionado.
- Las migraciones **no** confían en el mapeo de tipos de `queryInterface.createTable`
  para la columna `geom`: la agregan con SQL explícito
  (`ALTER TABLE ... ADD COLUMN geom POLYGON SRID 4326 NULL`) para garantizar el
  subtipo y el SRID reales en MySQL 8.
- Toda lectura/escritura de `geom` en runtime pasa por
  `src/database/sql/geometry.repository.js`, usando `sequelize.query()` con
  SQL puro (`ST_AsGeoJSON(geom)` para leer, `ST_GeomFromGeoJSON(:geojson, 1, 4326)`
  para escribir) y `replacements` — nunca se usa `Model.create/update` con el
  atributo `geom`, ni interpolación de strings.
- No se crea `SPATIAL INDEX` sobre `geom`: MySQL 8 solo permite índices
  espaciales sobre columnas `NOT NULL`, y `geom` debe aceptar `NULL` porque el
  polígono se dibuja después de crear la entidad.
- Validación mínima de polígonos en `src/database/sql/geometryValidation.js`
  antes de cualquier `ST_GeomFromGeoJSON` (tipo, anillos, rango de
  coordenadas, cierre automático del anillo).

## Rollback

- Revertir todas las migraciones: `npm run db:migrate:undo:all`
- Revertir una migración: `npm run db:migrate:undo`
- Revertir el seed demo: `npm run db:seed:undo`
- Ver estado de migraciones aplicadas: `npm run db:status`

Como no existían datos previos de producción al momento de esta migración, un
rollback completo (`db:migrate:undo:all`) es seguro y no destruye información
real. Si se corre este proyecto contra una base con datos reales cargados
después de esta migración, revisar el `down` de cada migración antes de
ejecutar un rollback en producción.
