'use strict';
// Prueba de humo del armado del stock: usa las funciones puras encadenadas
// como lo hace recomendacion.service.js, sin base de datos.
const {
  construirConsumoDesdeAsignaciones, proyectarConsumoRetroactivo,
  acumularStock, calcularBalance, calcularAutonomia, calcularCarga, ventanaDiasPara,
} = require('../src/services/balanceForrajero.service');
const { evaluar } = require('../src/services/motorReglas.service');

test('cadena completa: asignaciones + observaciones -> recomendación', async () => {
  const hasta = new Date('2026-11-10').getTime();
  const dias = ventanaDiasPara('PASTIZAL_NATURAL', new Date('2026-11-10'));
  const desde = hasta - dias * 86400000;

  const observaciones = Array.from({ length: 8 }, (_, i) => ({
    fecha: new Date(desde + i * 5 * 86400000), valor: 12,
  }));

  const asignaciones = Array.from({ length: 80 }, () => ({
    fecha_desde: new Date(desde - 30 * 86400000), fecha_hasta: null,
  }));

  const balance = calcularBalance({
    kgMsHaDia: 12, superficieHa: 50, demandaTotalKgDia: 880, claseCobertura: 'PASTIZAL_NATURAL',
  });
  const carga = calcularCarga({
    ofertaHaDia: balance.ofertaHaDia, demandaTotalKgDia: 880,
    cantidadAnimales: 80, superficieHa: 50,
  });

  const consumosRegistrados = construirConsumoDesdeAsignaciones({
    asignaciones, desde, hasta, consumoMedioAnimalKgDia: carga.consumoMedioAnimalKgDia,
  });
  expect(consumosRegistrados[0].animales).toBe(80);

  const { consumos } = proyectarConsumoRetroactivo({
    consumosRegistrados, desde, hasta,
    fechaAltaPotrero: new Date(desde - 60 * 86400000),
    demandaActualKgDia: 880,
  });

  const stock = acumularStock({
    observaciones, consumos, superficieHa: 50, desde, hasta, claseCobertura: 'PASTIZAL_NATURAL',
  });
  expect(stock).not.toBeNull();
  // 80 animales sobre 50 ha comiendo mucho mas de lo que crece -> piso
  expect(stock.enPiso).toBe(true);

  const autonomia = calcularAutonomia({
    stockKgMsHa: stock.stockKgMsHa, demandaHaDia: balance.demandaHaDia,
    ofertaHaDia: balance.ofertaHaDia, remanenteKgMsHa: stock.remanenteKgMsHa,
  });

  const r = await evaluar({
    ofertaHaDia: balance.ofertaHaDia, demandaHaDia: balance.demandaHaDia,
    indiceBalance: balance.indiceBalance, potreroVacio: balance.potreroVacio,
    acumuladoNetoHa: stock.acumuladoNetoHa, enPiso: stock.enPiso,
    diasAutonomia: autonomia.dias, cantidadAnimales: 80,
    cargaSostenible: carga.cargaSostenible, excesoAnimales: carga.excesoAnimales,
    diasDesdeObservacion: 2, nivelConfianza: null, confianzaMinima: 0.6,
  });

  // Piso + deficit => la regla critica
  expect(r.tipo).toBe('MOVER_GANADO');
  expect(r.prioridad).toBe('ALTA');
  expect(r.fundamento).not.toMatch(/\{\w+\}/);
  console.log('\n  ventana:', dias, 'días');
  console.log('  índice :', balance.indiceBalance.toFixed(2));
  console.log('  neto   :', stock.acumuladoNetoHa.toFixed(1), 'kg MS/ha');
  console.log('  →', r.tipo, r.prioridad);
  console.log('  →', r.fundamento, '\n');
});
