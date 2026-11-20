const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { sequelize } = require('../src/database/sequelize');
const { getHistoricoByPotrero } = require('../src/database/sql/estimacionStock.repository');

test('chart history returns the last valid revision per day, within the requested paddock and range', async (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  // Deliberately omit detalle_json: this query must never read the calculation trace.
  db.exec(`CREATE TABLE estimacion_stock (id_estimacion_stock INTEGER PRIMARY KEY, id_potrero INTEGER,
      fecha_objetivo TEXT, fecha_calculo TEXT, stock_final_central_kg_ms_ha REAL);
    INSERT INTO estimacion_stock VALUES
      (1,7,'2026-09-01','2026-09-02',91), (2,7,'2026-09-01','2026-09-04',0),
      (3,7,'2026-09-01','2026-09-03',50), (4,7,'2026-09-01','2026-09-05',-1),
      (5,7,'2026-09-02','2026-09-05',34), (6,7,'2026-09-02','2026-09-05',35),
      (7,7,'2026-09-03','2026-09-06',41), (8,8,'2026-09-02','2026-09-07',99);`);
  t.mock.method(sequelize, 'query', (sql, { replacements }) => db.prepare(sql).all(replacements));
  const rows = await getHistoricoByPotrero(7, { vista: 'grafico', desde: '2026-09-01', hasta: '2026-09-02' });
  assert.deepEqual(rows.map(row => [row.id_estimacion_stock, row.stock_final_central_kg_ms_ha]), [[2,0],[6,35]]);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['fecha_calculo','fecha_objetivo','id_estimacion_stock','stock_final_central_kg_ms_ha']);
  assert.deepEqual(await getHistoricoByPotrero(9, { vista: 'grafico' }), []);
});

test('dashboard sums latest target-date balances, excludes duplicates and reports coverage', () => {
  // Execute the production aggregation in memory; only the MySQL date syntax
  // is replaced with a fixed date range. No application/production DB is loaded.
  const source = readFileSync(require.resolve('../src/database/sql/analiticasConsumo.repository.js'), 'utf8');
  const query = source.split('const evolucionStock7diasRaw')[1].split('`')[1]
    .replace('DATE_SUB(DATE(UTC_TIMESTAMP() - INTERVAL 3 HOUR), INTERVAL 6 DAY)', "'2026-09-01'")
    .replace('DATE(UTC_TIMESTAMP() - INTERVAL 3 HOUR)', "'2026-09-07'");
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE potrero (id_potrero INTEGER, id_estancia INTEGER, activo BOOLEAN);
      CREATE TABLE estimacion_stock (id_estimacion_stock INTEGER, id_potrero INTEGER,
        fecha_objetivo TEXT, fecha_calculo TEXT, stock_final_total_kg_ms REAL,
        stock_final_central_kg_ms_ha REAL);
      INSERT INTO potrero VALUES (1,42,1),(2,42,1),(3,42,1),(4,99,1),(5,42,0);
      INSERT INTO estimacion_stock VALUES
        (1,1,'2026-09-06','2026-09-06 12:00',9000,90),
        (2,1,'2026-09-07','2026-09-07 12:00',9999,99),
        (3,1,'2026-09-07','2026-09-07 13:00',8100,81),
        (4,1,'2026-09-07','2026-09-07 13:00',8000,80),
        (5,2,'2026-09-07','2026-09-07 12:00',6000,300),
        (6,3,'2026-09-07','2026-09-08 01:00',0,0),
        (7,4,'2026-09-07','2026-09-07 12:00',999999,999),
        (8,5,'2026-09-07','2026-09-07 12:00',999999,999),
        (9,1,'2026-08-31','2026-09-07 12:00',999999,999);`);
    const rows = db.prepare(query).all({ id_estancia: 42 });
    assert.equal(rows.length, 2);
    assert.equal(rows[0].stock_total_kg_ms, 9000);
    assert.equal(rows[0].potreros_con_datos, 1);
    assert.equal(rows[0].potreros_activos, 3);
    assert.equal(rows[1].stock_total_kg_ms, 14000);
    assert.equal(rows[1].potreros_con_datos, 3);
  } finally { db.close(); }
});
