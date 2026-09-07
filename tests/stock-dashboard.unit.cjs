const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

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
