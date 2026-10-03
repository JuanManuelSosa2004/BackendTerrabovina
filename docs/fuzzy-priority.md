# Prioridad de traslado — prioridad_sugeno_v1

El motor `rotacion_por_potrero_v3` conserva presupuesto de siete días, cantidad a retirar,
exclusiones, controles de vigencia y distribución por capacidad compartida.
La nueva inferencia solo ordena los orígenes con exceso antes de asignar destinos.
Con espacio limitado puede cambiar qué origen consigue lugar. Un cierre decidido por
el usuario siempre precede al orden difuso y no recibe una etiqueta de IA ficticia.

## Modelo reproducible

Archivo: `src/rotation/fuzzyPriority.js`. JavaScript, sin dependencias ni API externa.
Sugeno de orden cero, AND producto, promedio ponderado de nueve reglas.
No se entrena ni aprende con el uso. Los parámetros son heurísticas operativas iniciales;
no se presentan como umbrales agronómicos validados ni probabilidades de acierto.

- Presión = consumo / crecimiento utilizable; partición baja/media/alta con nodos 0.8, 1.2, 2.
- Reserva = max(0, saldo) / consumo; partición corta/media/larga con nodos 3, 7, 14 días.
- Particiones lineales triangulares con hombros extremos; suman uno.
- Crecimiento cero con consumo positivo satura presión alta; API devuelve ratio null y zeroGrowth=true.
- Consecuentes: baja=20, media=55, alta=90. Matriz (filas presión, columnas reserva):

| | Corta | Media | Larga |
|---|---:|---:|---:|
| Baja | 55 | 20 | 20 |
| Media | 90 | 55 | 20 |
| Alta | 90 | 90 | 55 |

Puntuación = suma(activación × consecuente) / suma(activación).
Etiqueta: <40 Baja, 40..<70 Media, >=70 Alta. No se muestra porcentaje al usuario.
La reserva no suma crecimiento futuro y no equivale a días de supervivencia ni a un aforo.
Datos incompletos, excluidos, sin exceso o cierres: priority=null. No se inventa prioridad.
Desempate: regla previa de presión presupuestaria, cantidad a retirar e ID estable.

## Contrato

GET `/api/v2/estancia/:estanciaId/rotacion` agrega `priorityModel` y `priority` en los
potreros y recomendaciones. Priority contiene model, score, level, explanation, inputs
y reglas activadas para reproducir el cálculo. Sin migraciones ni cambios de endpoints.
Resumen y Rotación muestran la etiqueta; la explicación está disponible al pasar el cursor.

## Prueba de efecto

Dos orígenes con 10 animales y consumo 100 kg/día: A (saldo 0, crecimiento 95),
B (saldo 670, crecimiento 0). Ambos requieren retirar 1 animal. Un destino tiene
70 kg de saldo y crecimiento cero: admite solo uno. El orden anterior favorecía A
por presión presupuestaria; la inferencia favorece B (90 frente a 77.11) por ausencia
de reposición. Demuestra un cambio de decisión, no una mejora agronómica medida.

Pruebas: monotonicidad, mezcla continua, falta de datos, escala, orden determinista,
capacidad escasa, prioridad de cierre y conservación de cantidades/presupuestos.

Referencia del método (no de los umbrales):
https://www.mathworks.com/help/fuzzy/types-of-fuzzy-inference-systems.html
