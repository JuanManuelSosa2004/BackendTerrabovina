'use strict';

process.env.NODE_ENV = 'test';

const { evaluar, construirHechos, formatear } = require('../src/services/motorReglas.service');

// Caso base: potrero de 50 ha, 80 animales, observación reciente y balance
// equilibrado. Cada test lo desvía en una sola dimensión.
function caso(extra = {}) {
  return {
    ofertaHaDia: 17.6,
    demandaHaDia: 17.6,
    indiceBalance: 1.0,
    potreroVacio: false,
    acumuladoNetoHa: 300,
    enPiso: false,
    diasAutonomia: null,
    cantidadAnimales: 80,
    cargaSostenible: 80,
    excesoAnimales: 0,
    superficieRequeridaHa: 50,
    diasDesdeObservacion: 3,
    nivelConfianza: null,
    confianzaMinima: 0.6,
    pesosFueraDeRango: false,
    tipoAnterior: null,
    ...extra,
  };
}

describe('construirHechos', () => {
  test('un índice ausente no se compara como cero', () => {
    // Sin el booleano de presencia, `indiceBalance < 0.9` daría verdadero
    // sobre null, porque JavaScript lo coacciona a 0.
    const h = construirHechos(caso({ indiceBalance: null }));
    expect(h.tieneIndice).toBe(false);
    expect(h.indiceBalance).toBe(0);
  });

  test('sin observación previa la antigüedad se asume vencida', () => {
    expect(construirHechos(caso({ diasDesdeObservacion: null })).diasDesdeObservacion).toBe(Infinity);
  });

  test('un nivel de confianza nulo no bloquea la recomendación', () => {
    // El modelo persiste nivel_confianza en null; tratarlo como insuficiente
    // haría que la compuerta emitiera NUEVA_MEDICION en todos los potreros.
    expect(construirHechos(caso({ nivelConfianza: null })).confianzaInsuficiente).toBe(false);
  });

  test('una confianza informada por debajo del mínimo sí marca insuficiencia', () => {
    expect(construirHechos(caso({ nivelConfianza: 0.4 })).confianzaInsuficiente).toBe(true);
  });
});

describe('evaluar — compuerta de confianza', () => {
  test('una observación vencida no produce recomendación de manejo', async () => {
    const r = await evaluar(caso({ diasDesdeObservacion: 40, indiceBalance: 0.5 }));
    expect(r.tipo).toBe('NUEVA_MEDICION');
  });

  test('pesos fuera del rango del modelo también la disparan', async () => {
    const r = await evaluar(caso({ pesosFueraDeRango: true, indiceBalance: 0.5 }));
    expect(r.tipo).toBe('NUEVA_MEDICION');
  });

  test('la compuerta gana sobre cualquier regla de manejo', async () => {
    const r = await evaluar(caso({ diasDesdeObservacion: 40, indiceBalance: 0.3, enPiso: true }));
    expect(r.tipo).toBe('NUEVA_MEDICION');
    expect(r.reglasDisparadas).toContain('MOVER_GANADO');
  });
});

describe('evaluar — potrero en el piso', () => {
  test('en el piso y con déficit: crítico', async () => {
    const r = await evaluar(caso({ enPiso: true, acumuladoNetoHa: -200, indiceBalance: 0.6 }));
    expect(r.tipo).toBe('MOVER_GANADO');
    expect(r.prioridad).toBe('ALTA');
  });

  test('en el piso pero produciendo más de lo que se consume: en recuperación', async () => {
    const r = await evaluar(caso({ enPiso: true, acumuladoNetoHa: -200, indiceBalance: 1.3 }));
    expect(r.tipo).toBe('MANTENER');
    expect(r.fundamento).toMatch(/no corresponde incrementar la carga/i);
  });

  test('en la banda neutra sostiene el estado anterior', async () => {
    const r = await evaluar(
      caso({ enPiso: true, acumuladoNetoHa: -50, indiceBalance: 1.0, tipoAnterior: 'MANTENER' })
    );
    expect(r.tipo).toBe('MANTENER');
  });

  test('en la banda neutra sin antecedente resuelve por el lado seguro', async () => {
    const r = await evaluar(caso({ enPiso: true, acumuladoNetoHa: -50, indiceBalance: 1.0 }));
    expect(r.tipo).toBe('MOVER_GANADO');
    expect(r.prioridad).toBe('ALTA');
  });
});

describe('evaluar — reglas de manejo por índice', () => {
  test('déficit agudo recomienda mover', async () => {
    const r = await evaluar(caso({ indiceBalance: 0.57, cargaSostenible: 45, excesoAnimales: 34.5 }));
    expect(r.tipo).toBe('MOVER_GANADO');
    expect(r.prioridad).toBe('ALTA');
    expect(r.fundamento).toContain('57 %');
    expect(r.fundamento).toContain('45 cabezas');
    expect(r.fundamento).toContain('sobran 35');
  });

  test('déficit agudo con la reserva por agotarse recomienda suplementar', async () => {
    const r = await evaluar(caso({ indiceBalance: 0.57, diasAutonomia: 4 }));
    expect(r.tipo).toBe('SUPLEMENTAR');
    expect(r.fundamento).toMatch(/4 días/);
  });

  test('déficit leve recomienda reducir carga', async () => {
    const r = await evaluar(caso({ indiceBalance: 0.85, cargaSostenible: 68, excesoAnimales: 12 }));
    expect(r.tipo).toBe('REDUCIR_CARGA');
    expect(r.prioridad).toBe('MEDIA');
  });

  test('excedente sostenido recomienda aumentar carga', async () => {
    const r = await evaluar(caso({ indiceBalance: 1.5, excesoAnimales: -40 }));
    expect(r.tipo).toBe('AUMENTAR_CARGA');
    expect(r.fundamento).toContain('40 animales adicionales');
  });

  test('la banda neutra no dispara ninguna acción', async () => {
    for (const ib of [0.9, 0.95, 1.0, 1.1, 1.3]) {
      const r = await evaluar(caso({ indiceBalance: ib }));
      expect(r.tipo).toBe('MANTENER');
      expect(r.prioridad).toBe('BAJA');
    }
  });
});

describe('evaluar — garantías del motor', () => {
  test('un potrero vacío no recibe recomendación de manejo', async () => {
    const r = await evaluar(caso({ potreroVacio: true, indiceBalance: null, cantidadAnimales: 0 }));
    expect(r.tipo).toBe('MANTENER');
    expect(r.fundamento).toMatch(/no tiene animales/i);
  });

  test('nunca devuelve vacío: siempre hay regla que se cumple', async () => {
    const escenarios = [
      caso(),
      caso({ indiceBalance: 0.1 }),
      caso({ indiceBalance: 5 }),
      caso({ enPiso: true, indiceBalance: 0.5 }),
      caso({ potreroVacio: true, indiceBalance: null }),
      caso({ diasDesdeObservacion: 90 }),
    ];
    for (const e of escenarios) {
      const r = await evaluar(e);
      expect(r).not.toBeNull();
      expect(r.tipo).toBeTruthy();
      expect(r.prioridad).toBeTruthy();
      expect(r.fundamento.length).toBeGreaterThan(0);
    }
  });

  test('conserva todas las reglas que se cumplieron, no solo la ganadora', async () => {
    const r = await evaluar(caso({ indiceBalance: 0.5 }));
    expect(r.reglasDisparadas.length).toBeGreaterThan(1);
    expect(r.reglasDisparadas).toContain(r.tipo);
  });

  test('el fundamento no deja marcadores sin reemplazar', async () => {
    for (const ib of [0.3, 0.6, 0.85, 1.0, 1.5]) {
      const r = await evaluar(caso({ indiceBalance: ib }));
      expect(r.fundamento).not.toMatch(/\{\w+\}/);
    }
  });

  test('los tipos emitidos pertenecen al enum de la base', async () => {
    const VALIDOS = [
      'MOVER_GANADO',
      'REDUCIR_CARGA',
      'AUMENTAR_CARGA',
      'SUPLEMENTAR',
      'MANTENER',
      'NUEVA_MEDICION',
    ];
    const PRIORIDADES = ['BAJA', 'MEDIA', 'ALTA'];
    for (const ib of [0.1, 0.5, 0.8, 1.0, 2.0]) {
      for (const piso of [true, false]) {
        const r = await evaluar(caso({ indiceBalance: ib, enPiso: piso }));
        expect(VALIDOS).toContain(r.tipo);
        expect(PRIORIDADES).toContain(r.prioridad);
      }
    }
  });
});

describe('formatear', () => {
  test('redondea porcentajes y animales, y usa coma decimal', () => {
    expect(formatear('pctCobertura', 56.8181)).toBe('57');
    expect(formatear('excesoAnimales', 34.5454)).toBe('35');
    expect(formatear('diasAutonomia', 37.93)).toBe('38');
    expect(formatear('ofertaHaDia', 17.6)).toBe('17,6');
  });

  test('un valor ausente no rompe la plantilla', () => {
    expect(formatear('diasAutonomia', null)).toBe('—');
  });
});
