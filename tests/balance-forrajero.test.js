'use strict';

process.env.NODE_ENV = 'test';

const {
  calcularBalance,
  acumularStock,
  calcularAutonomia,
  coberturaEstimacion,
  ventanaDiasPara,
  estacionDe,
  integrarTasa,
  integrarEscalon,
  proyectarConsumoRetroactivo,
} = require('../src/services/balanceForrajero.service');

describe('estacionDe', () => {
  test('asigna las estaciones del hemisferio sur', () => {
    expect(estacionDe('2026-01-15')).toBe('verano');
    expect(estacionDe('2026-04-10')).toBe('otonio');
    expect(estacionDe('2026-07-20')).toBe('invierno');
    expect(estacionDe('2026-10-05')).toBe('primavera');
  });

  test('resuelve los bordes de estación', () => {
    expect(estacionDe('2026-12-20')).toBe('primavera');
    expect(estacionDe('2026-12-21')).toBe('verano');
    expect(estacionDe('2026-03-20')).toBe('verano');
    expect(estacionDe('2026-03-21')).toBe('otonio');
  });

  test('devuelve null ante una fecha inválida', () => {
    expect(estacionDe('no-es-fecha')).toBeNull();
  });
});

describe('ventanaDiasPara', () => {
  test('la ventana de primavera es más corta que la de invierno', () => {
    const primavera = ventanaDiasPara('PASTIZAL_NATURAL', '2026-10-05');
    const invierno = ventanaDiasPara('PASTIZAL_NATURAL', '2026-07-20');
    expect(primavera).toBeLessThan(invierno);
  });

  test('nunca supera el tope calendario', () => {
    for (const fecha of ['2026-01-15', '2026-04-10', '2026-07-20', '2026-10-05']) {
      expect(ventanaDiasPara('PASTIZAL_NATURAL', fecha)).toBeLessThanOrEqual(120);
    }
  });

  test('una clase de cobertura desconocida cae en el perfil por defecto', () => {
    expect(ventanaDiasPara('INEXISTENTE', '2026-07-20')).toBe(
      ventanaDiasPara('PASTIZAL_NATURAL', '2026-07-20')
    );
  });
});

describe('calcularBalance', () => {
  test('lleva la demanda a hectárea y no toca la oferta', () => {
    const r = calcularBalance({
      kgMsHaDia: 30,
      superficieHa: 50,
      demandaTotalKgDia: 600,
      claseCobertura: 'PASTIZAL_NATURAL',
    });
    // U = 0,50 → oferta aprovechable 15 kg MS/ha/día
    expect(r.ofertaBrutaHaDia).toBe(30);
    expect(r.ofertaHaDia).toBeCloseTo(15, 6);
    // 600 kg/día sobre 50 ha → 12 kg MS/ha/día
    expect(r.demandaHaDia).toBeCloseTo(12, 6);
    expect(r.indiceBalance).toBeCloseTo(15 / 12, 6);
  });

  test('el índice es invariante frente a la convención de unidad', () => {
    const kgMsHaDia = 22;
    const superficieHa = 37.5;
    const demandaTotalKgDia = 430;
    const U = 0.5;

    const porHectarea = calcularBalance({
      kgMsHaDia,
      superficieHa,
      demandaTotalKgDia,
      factorUtilizacion: U,
    }).indiceBalance;

    // Misma cuenta llevando la oferta a total en lugar de la demanda a hectárea.
    const porTotal = (kgMsHaDia * superficieHa * U) / demandaTotalKgDia;

    expect(porHectarea).toBeCloseTo(porTotal, 10);
  });

  test('el índice no depende de la superficie si la carga por hectárea se mantiene', () => {
    const chico = calcularBalance({ kgMsHaDia: 25, superficieHa: 20, demandaTotalKgDia: 200 });
    const grande = calcularBalance({ kgMsHaDia: 25, superficieHa: 80, demandaTotalKgDia: 800 });
    expect(chico.indiceBalance).toBeCloseTo(grande.indiceBalance, 10);
  });

  test('un potrero sin animales no devuelve índice', () => {
    const r = calcularBalance({ kgMsHaDia: 30, superficieHa: 50, demandaTotalKgDia: 0 });
    expect(r.potreroVacio).toBe(true);
    expect(r.indiceBalance).toBeNull();
  });

  test('sin superficie válida no hay comparación posible', () => {
    expect(calcularBalance({ kgMsHaDia: 30, superficieHa: 0, demandaTotalKgDia: 600 })).toBeNull();
    expect(calcularBalance({ kgMsHaDia: 30, superficieHa: null, demandaTotalKgDia: 600 })).toBeNull();
  });

  test('acepta los DECIMAL que Sequelize devuelve como string', () => {
    const r = calcularBalance({
      kgMsHaDia: '30.00',
      superficieHa: '50.00',
      demandaTotalKgDia: '600.00',
      factorUtilizacion: 0.5,
    });
    expect(r.indiceBalance).toBeCloseTo(1.25, 6);
  });

  test('aplica el factor de utilización del perfil correspondiente', () => {
    const natural = calcularBalance({
      kgMsHaDia: 20,
      superficieHa: 10,
      demandaTotalKgDia: 100,
      claseCobertura: 'PASTIZAL_NATURAL',
    });
    const implantada = calcularBalance({
      kgMsHaDia: 20,
      superficieHa: 10,
      demandaTotalKgDia: 100,
      claseCobertura: 'PASTURA_IMPLANTADA',
    });
    expect(natural.factorUtilizacion).toBe(0.5);
    expect(implantada.factorUtilizacion).toBe(0.55);
    expect(implantada.indiceBalance).toBeGreaterThan(natural.indiceBalance);
  });
});

describe('integrarTasa', () => {
  test('una tasa constante integra tasa por días, sin importar el muestreo', () => {
    const denso = integrarTasa({
      muestras: [
        { fecha: '2026-10-01', valor: 20 },
        { fecha: '2026-10-11', valor: 20 },
        { fecha: '2026-10-21', valor: 20 },
        { fecha: '2026-10-31', valor: 20 },
      ],
      desde: '2026-10-01',
      hasta: '2026-10-31',
    });
    const ralo = integrarTasa({
      muestras: [
        { fecha: '2026-10-01', valor: 20 },
        { fecha: '2026-10-31', valor: 20 },
      ],
      desde: '2026-10-01',
      hasta: '2026-10-31',
    });
    expect(denso.integral).toBeCloseTo(600, 6);
    expect(ralo.integral).toBeCloseTo(600, 6);
  });

  test('interpola linealmente entre observaciones separadas', () => {
    // De 10 a 20 en 10 días: el promedio es 15 → 150
    const r = integrarTasa({
      muestras: [
        { fecha: '2026-10-01', valor: 10 },
        { fecha: '2026-10-11', valor: 20 },
      ],
      desde: '2026-10-01',
      hasta: '2026-10-11',
    });
    expect(r.integral).toBeCloseTo(150, 6);
  });

  test('sumar las muestras como si fueran días da un resultado distinto', () => {
    // Es el error que la integración evita: 3 muestras no son 3 días.
    const muestras = [
      { fecha: '2026-10-01', valor: 20 },
      { fecha: '2026-10-11', valor: 20 },
      { fecha: '2026-10-21', valor: 20 },
    ];
    const sumaIngenua = muestras.reduce((a, m) => a + m.valor, 0); // 60
    const r = integrarTasa({ muestras, desde: '2026-10-01', hasta: '2026-10-21' });
    expect(r.integral).toBeCloseTo(400, 6);
    expect(r.integral).not.toBeCloseTo(sumaIngenua, 0);
  });

  test('informa el hueco máximo y los días extrapolados', () => {
    const r = integrarTasa({
      muestras: [
        { fecha: '2026-10-05', valor: 20 },
        { fecha: '2026-10-25', valor: 20 },
      ],
      desde: '2026-10-01',
      hasta: '2026-10-31',
    });
    expect(r.huecoMaximoDias).toBeCloseTo(20, 6);
    expect(r.diasExtrapolados).toBeCloseTo(10, 6); // 4 al inicio + 6 al final
    expect(r.muestrasUsadas).toBe(2);
    expect(r.ventanaDias).toBeCloseTo(30, 6);
  });

  test('sin muestras dentro de la ventana no integra', () => {
    expect(
      integrarTasa({
        muestras: [{ fecha: '2026-01-01', valor: 20 }],
        desde: '2026-10-01',
        hasta: '2026-10-31',
      })
    ).toBeNull();
    expect(integrarTasa({ muestras: [], desde: '2026-10-01', hasta: '2026-10-31' })).toBeNull();
  });
});

describe('integrarEscalon', () => {
  test('cada tramo vale hasta el cambio siguiente', () => {
    // 10 días a 100 kg/día, después 10 días a 300 kg/día
    const r = integrarEscalon({
      muestras: [
        { fecha: '2026-10-01', valor: 100 },
        { fecha: '2026-10-11', valor: 300 },
      ],
      desde: '2026-10-01',
      hasta: '2026-10-21',
    });
    expect(r.integral).toBeCloseTo(1000 + 3000, 6);
    expect(r.tramos).toBe(2);
  });

  test('un potrero vaciado a mitad de ventana deja de consumir', () => {
    const r = integrarEscalon({
      muestras: [
        { fecha: '2026-10-01', valor: 200 },
        { fecha: '2026-10-16', valor: 0 },
      ],
      desde: '2026-10-01',
      hasta: '2026-10-31',
    });
    expect(r.integral).toBeCloseTo(3000, 6);
  });

  test('sin asignaciones el potrero estuvo vacío', () => {
    const r = integrarEscalon({ muestras: [], desde: '2026-10-01', hasta: '2026-10-31' });
    expect(r.integral).toBe(0);
  });
});

describe('acumularStock', () => {
  const VENTANA = { desde: '2026-10-01', hasta: '2026-11-10' }; // 40 días

  function observacionesCada(dias, valor, desde = '2026-10-01', cantidad = 9) {
    const t0 = new Date(desde).getTime();
    return Array.from({ length: cantidad }, (_, i) => ({
      fecha: new Date(t0 + i * dias * 86400000).toISOString().slice(0, 10),
      valor,
    }));
  }

  test('un potrero en descanso acumula toda la producción sobre el remanente', () => {
    const r = acumularStock({
      observaciones: observacionesCada(5, 30),
      consumos: [],
      superficieHa: 50,
      ...VENTANA,
      factorUtilizacion: 0.5,
      remanenteKgMsHa: 1000,
    });
    // 40 días × 30 kg/ha/día × 0,5 = 600 kg MS/ha útiles, sobre 1000 de piso
    expect(r.acumuladoUtilHa).toBeCloseTo(600, 6);
    expect(r.stockKgMsHa).toBeCloseTo(1600, 6);
    expect(r.consumoAcumuladoHa).toBe(0);
  });

  test('la condición inicial de la ventana es el remanente, no cero', () => {
    const r = acumularStock({
      observaciones: observacionesCada(5, 0),
      consumos: [],
      superficieHa: 50,
      ...VENTANA,
      factorUtilizacion: 0.5,
      remanenteKgMsHa: 1000,
    });
    expect(r.stockKgMsHa).toBe(1000);
    expect(r.acumuladoUtilHa).toBe(0);
  });

  test('descuenta el consumo de los días ocupados', () => {
    const r = acumularStock({
      observaciones: observacionesCada(5, 30),
      consumos: [{ fecha: '2026-10-01', valor: 250 }],
      superficieHa: 50,
      ...VENTANA,
      factorUtilizacion: 0.5,
      remanenteKgMsHa: 0,
    });
    // consumo 250/50 = 5 kg MS/ha/día → 200 kg MS/ha en 40 días
    expect(r.ofertaAcumuladaHa).toBeCloseTo(600, 6);
    expect(r.consumoAcumuladoHa).toBeCloseTo(200, 6);
    expect(r.stockKgMsHa).toBeCloseTo(400, 6);
  });

  test('el stock nunca baja del remanente', () => {
    const r = acumularStock({
      observaciones: observacionesCada(5, 2),
      consumos: [{ fecha: '2026-10-01', valor: 3000 }],
      superficieHa: 50,
      ...VENTANA,
      factorUtilizacion: 0.5,
      remanenteKgMsHa: 1000,
    });
    expect(r.tocaPiso).toBe(true);
    expect(r.stockKgMsHa).toBe(1000);
  });

  test('expone la densidad de datos para la compuerta de confianza', () => {
    const r = acumularStock({
      observaciones: [
        { fecha: '2026-10-02', valor: 30 },
        { fecha: '2026-11-01', valor: 30 },
      ],
      consumos: [],
      superficieHa: 50,
      ...VENTANA,
      factorUtilizacion: 0.5,
    });
    expect(r.muestrasUsadas).toBe(2);
    expect(r.huecoMaximoDias).toBeCloseTo(30, 6);
    expect(r.diasExtrapolados).toBeGreaterThan(0);
  });

  test('sin observaciones no devuelve stock', () => {
    expect(acumularStock({ observaciones: [], consumos: [], superficieHa: 50, ...VENTANA })).toBeNull();
    expect(
      acumularStock({ observaciones: observacionesCada(5, 30), consumos: [], superficieHa: 0, ...VENTANA })
    ).toBeNull();
  });

  test('produce valores dentro del rango agronómico esperable', () => {
    // Pastizal natural en primavera: crecimiento de 25 kg MS/ha/día.
    const r = acumularStock({
      observaciones: observacionesCada(5, 25),
      consumos: [],
      superficieHa: 50,
      ...VENTANA,
      claseCobertura: 'PASTIZAL_NATURAL',
    });
    // Control de plausibilidad: la disponibilidad de una pastura se ubica
    // habitualmente entre 800 y 3500 kg MS/ha.
    expect(r.stockKgMsHa).toBeGreaterThan(800);
    expect(r.stockKgMsHa).toBeLessThan(3500);
  });
});

describe('calcularAutonomia', () => {
  test('divide por el vaciado neto, no por la demanda sola', () => {
    // Stock 1500, remanente 1000, demanda 20, oferta 15 → vaciado neto 5
    // (1500 - 1000) / 5 = 100 días
    const r = calcularAutonomia({
      stockKgMsHa: 1500,
      demandaHaDia: 20,
      ofertaHaDia: 15,
      remanenteKgMsHa: 1000,
    });
    // diasSinTope es el valor de la fórmula; `dias` viene acotado por el tope.
    expect(r.diasSinTope).toBeCloseTo(100, 6);
    expect(r.vaciadoNetoHaDia).toBeCloseTo(5, 6);
  });

  test('ignorar la oferta subestima la autonomía varias veces', () => {
    const comun = { stockKgMsHa: 1500, demandaHaDia: 20, remanenteKgMsHa: 1000 };
    const conOferta = calcularAutonomia({ ...comun, ofertaHaDia: 15 }).diasSinTope;
    const sinOferta = calcularAutonomia({ ...comun, ofertaHaDia: 0 }).diasSinTope;
    expect(sinOferta).toBeCloseTo(25, 6);
    expect(conOferta / sinOferta).toBeCloseTo(4, 6);
  });

  test('un potrero en superávit no se vacía', () => {
    const r = calcularAutonomia({
      stockKgMsHa: 1500,
      demandaHaDia: 10,
      ofertaHaDia: 15,
      remanenteKgMsHa: 1000,
    });
    expect(r.enSuperavit).toBe(true);
    expect(r.dias).toBeNull();
  });

  test('el equilibrio exacto cuenta como superávit', () => {
    const r = calcularAutonomia({
      stockKgMsHa: 1500,
      demandaHaDia: 15,
      ofertaHaDia: 15,
      remanenteKgMsHa: 1000,
    });
    expect(r.enSuperavit).toBe(true);
  });

  test('devuelve cero cuando el stock ya está en el remanente', () => {
    const r = calcularAutonomia({
      stockKgMsHa: 1000,
      demandaHaDia: 20,
      ofertaHaDia: 5,
      remanenteKgMsHa: 1000,
    });
    expect(r.dias).toBe(0);
  });

  test('no está definida sin demanda', () => {
    const r = calcularAutonomia({ stockKgMsHa: 2000, demandaHaDia: 0, ofertaHaDia: 10 });
    expect(r.dias).toBeNull();
    expect(r.enSuperavit).toBe(false);
  });

  test('dos potreros con el mismo índice pueden tener autonomías muy distintas', () => {
    // Es la razón de ser del indicador: el índice no distingue estos casos.
    const comun = { demandaHaDia: 20, ofertaHaDia: 15, remanenteKgMsHa: 1000, topeDias: 1e9 };
    const escaso = calcularAutonomia({ ...comun, stockKgMsHa: 1025 }).dias;
    const holgado = calcularAutonomia({ ...comun, stockKgMsHa: 3000 }).dias;
    expect(escaso).toBeCloseTo(5, 6);
    expect(holgado).toBeCloseTo(400, 6);
  });

  test('acota la autonomía informada en el tope', () => {
    const r = calcularAutonomia({
      stockKgMsHa: 3000,
      demandaHaDia: 20,
      ofertaHaDia: 15,
      remanenteKgMsHa: 1000,
      topeDias: 60,
    });
    expect(r.superaTope).toBe(true);
    expect(r.dias).toBe(60);
    expect(r.diasSinTope).toBeCloseTo(400, 6);
  });

  test('por debajo del tope informa el valor real', () => {
    const r = calcularAutonomia({
      stockKgMsHa: 1200,
      demandaHaDia: 20,
      ofertaHaDia: 15,
      remanenteKgMsHa: 1000,
      topeDias: 60,
    });
    expect(r.superaTope).toBe(false);
    expect(r.dias).toBeCloseTo(40, 6);
  });

  test('el tope mantiene acotado el error cerca del equilibrio', () => {
    // A índice 0,98 la autonomía cruda supera los mil días y un error del 1%
    // la mueve un 50%. El tope hace que nunca se informe esa zona inestable.
    const comun = { stockKgMsHa: 1288, remanenteKgMsHa: 1000, ofertaHaDia: 10, topeDias: 60 };
    const casi = calcularAutonomia({ ...comun, demandaHaDia: 10.2 });
    const conError = calcularAutonomia({ ...comun, demandaHaDia: 10.3 });
    expect(casi.diasSinTope).toBeGreaterThan(1000);
    expect(casi.dias).toBe(60);
    expect(conError.dias).toBe(60); // el informado no se mueve
  });
});

describe('proyectarConsumoRetroactivo', () => {
  const VENTANA = { desde: '2026-08-01', hasta: '2026-09-10' }; // 40 días

  test('un potrero dado de alta hoy infiere toda la ventana', () => {
    const r = proyectarConsumoRetroactivo({
      consumosRegistrados: [],
      ...VENTANA,
      fechaAltaPotrero: '2026-09-10',
      demandaActualKgDia: 880,
    });
    expect(r.consumos).toHaveLength(1);
    expect(r.consumos[0].inferido).toBe(true);
    expect(r.consumos[0].valor).toBe(880);
    expect(r.fraccionInferida).toBeCloseTo(1, 6);
  });

  test('la fracción inferida decae a medida que hay historial', () => {
    const r = proyectarConsumoRetroactivo({
      consumosRegistrados: [{ fecha: '2026-08-21', valor: 880 }],
      ...VENTANA,
      fechaAltaPotrero: '2026-08-21',
      demandaActualKgDia: 880,
    });
    expect(r.fraccionInferida).toBeCloseTo(0.5, 6); // 20 de 40 días
    expect(r.consumos).toHaveLength(2);
  });

  test('un potrero anterior a la ventana no infiere nada', () => {
    const r = proyectarConsumoRetroactivo({
      consumosRegistrados: [{ fecha: '2026-07-01', valor: 880 }],
      ...VENTANA,
      fechaAltaPotrero: '2026-05-01',
      demandaActualKgDia: 880,
    });
    expect(r.fraccionInferida).toBe(0);
    expect(r.consumos).toHaveLength(1);
  });

  test('sin hacienda asignada no proyecta consumo', () => {
    const r = proyectarConsumoRetroactivo({
      consumosRegistrados: [],
      ...VENTANA,
      fechaAltaPotrero: '2026-09-10',
      demandaActualKgDia: 0,
    });
    expect(r.fraccionInferida).toBe(0);
    expect(r.consumos).toHaveLength(0);
  });

  test('sin proyección el stock queda sobrestimado', () => {
    // Es el error que la proyección evita, y va para el lado peligroso.
    const observaciones = Array.from({ length: 9 }, (_, i) => ({
      fecha: new Date(new Date('2026-08-01').getTime() + i * 5 * 86400000).toISOString().slice(0, 10),
      valor: 30,
    }));
    const base = {
      observaciones,
      superficieHa: 50,
      ...VENTANA,
      factorUtilizacion: 0.5,
      remanenteKgMsHa: 1000,
    };

    const sinProyectar = acumularStock({ ...base, consumos: [] });

    const { consumos } = proyectarConsumoRetroactivo({
      consumosRegistrados: [],
      ...VENTANA,
      fechaAltaPotrero: '2026-09-10',
      demandaActualKgDia: 500,
    });
    const proyectado = acumularStock({ ...base, consumos });

    expect(sinProyectar.stockKgMsHa).toBeGreaterThan(proyectado.stockKgMsHa);
    // 500 kg/día sobre 50 ha durante 40 días = 400 kg MS/ha descontados
    expect(sinProyectar.stockKgMsHa - proyectado.stockKgMsHa).toBeCloseTo(400, 6);
  });
});

describe('coberturaEstimacion', () => {
  test('expresa la fracción del potrero que el modelo pudo analizar', () => {
    expect(coberturaEstimacion({ superficieAnalizadaHa: 35, superficieHa: 50 })).toBeCloseTo(0.7, 6);
  });

  test('se acota en 1 si la analizada supera a la declarada', () => {
    expect(coberturaEstimacion({ superficieAnalizadaHa: 60, superficieHa: 50 })).toBe(1);
  });

  test('devuelve null si falta el dato', () => {
    expect(coberturaEstimacion({ superficieAnalizadaHa: null, superficieHa: 50 })).toBeNull();
  });
});
