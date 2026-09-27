# Análisis intrapotrero — TerraBovina

Implementación: septiembre de 2026. Metodología espacial `ambientes_manuales_v1`; balance diario `balance_diario_ambientes_v4`.

## Qué incorpora

El usuario delimita ambientes productivos, aguadas, sombras y sectores temporalmente inaccesibles dentro de un potrero. El sistema pondera las referencias mensuales existentes por su superficie y conserva la anomalía DMP del potrero completo. Se distingue la producción total del acceso al forraje. La cercanía a agua y sombra se representa como preferencia potencial orientativa.

La clasificación es declarada por el usuario. No hay detección automática de lomas, bajos, inundación o sombras. No hay un nuevo NDVI por píxel ni seguimiento de animales. La imagen Esri es fondo cartográfico, no la fuente del crecimiento.

## Flujo y pantalla

1. En el detalle del potrero, abrir **Analizar intrapotrero**.
2. En **Agregar**, elegir nombre, tipo y dibujar vértices. **Último punto** permite corregirlos; **Usar todo el potrero** sirve para un ambiente homogéneo. **Aceptar zona** la deja pendiente de guardado.
3. Para un ambiente, elegir una curva del catálogo regional y, opcionalmente, su posición declarada: loma, media loma, bajo u otro. La posición es descriptiva; la curva seleccionada determina la tasa. En Pampa Deprimida existen perfiles de loma/media loma, bajo dulce y bajo alcalino. No se extrapolan esos perfiles automáticamente al resto del país.
4. Para una restricción, indicar inicio y fin opcional. Ambos días son inclusivos; sin fin continúa vigente. La restricción puede cruzar ambientes. Los sectores fuera de vigencia aparecen atenuados.
5. **Guardar y actualizar cálculo** valida y crea una versión desde el día actual en Argentina; luego solicita el balance. Si falla el cálculo, la versión permanece guardada y se puede reintentar con **Actualizar balance**.
6. La pantalla muestra superficie total y pastoreable, crecimiento utilizable total, carga en cabezas/ha pastoreable, aporte de cada ambiente, stock estimado total y stock accesible aproximado. Un saldo de otra fecha o versión no aparece como cálculo vigente.
7. Se pueden activar capas de ambientes, agua, sombra, inaccesibilidad y preferencia. Mientras hay cambios pendientes, los indicadores siguen correspondiendo a la última versión calculada; la preferencia se oculta para evitar mezclar versiones.
8. **Fuentes y trazabilidad → Ver versiones → Cargar para restaurar** carga una configuración anterior para revisión. Guardarla crea una nueva versión desde hoy; no elimina las anteriores.

Si cambian los límites del potrero, se suspende el ajuste anterior hasta revisar y guardar las zonas. No se recortan silenciosamente zonas declaradas fuera del nuevo límite. Si Flask falla, se puede mostrar el último análisis guardado con fecha y aviso de desactualización; no se fabrica uno nuevo.

## Fórmulas y decisiones

Sean A la superficie total, Ai la superficie del ambiente i, A0 la superficie no clasificada, Ri(m) su referencia mensual y R0(m) la referencia que ya seleccionaba el sistema.

```
Rponderada(m) = [sum(Ai × Ri(m)) + A0 × R0(m)] / A
Fambiente(m) = Rponderada(m) / R0(m)
Gbruto_nuevo(d) = Gbruto_base(d) × Fambiente(mes(d))
Gutilizable_nuevo(d) = Gutilizable_base(d) × Fambiente(mes(d))
Saldo(d) = max(0, producción utilizable acumulada − consumo acumulado)
```

R0 es la mediana de los perfiles seleccionados por el GIS existente. Las áreas se calculan en UTM local y se intersectan con el potrero proyectado para mantener el presupuesto de superficie. Los ambientes no se superponen; el resto conserva R0. Sin zonas, el factor es 1 y la estimación mantiene su referencia. Si R0 es cero se usa factor 1, evitando división por cero.

El factor se aplica a las tasas base de cada día desde la vigencia de la versión, incluidos los escenarios min/central/max existentes. Se conservan explícitamente esas tasas base para no multiplicar nuevamente al recalcular. La anomalía DMP, sus límites y el porcentaje utilizable heredado se mantienen. Los escenarios son los del modelo previo escalados; no representan intervalos estadísticos calibrados por ambiente.

Las revisiones se ordenan por id. Para cada día se utiliza la última registrada que ya esté vigente y corresponda al mismo límite. Varias revisiones en un día sustituyen el ajuste de ese día completo: no hay prorrateo intradiario. El servidor asigna la fecha, el autor y el análisis; no acepta factores enviados por el navegador. El consumo conserva DMI y fechas de asignación; la cercanía a recursos no lo multiplica.

### Acceso al forraje

Se resta la unión de sectores inaccesibles vigentes, evitando descontar dos veces las superposiciones:

```
Apastoreable = área(potrero − unión(restricciones vigentes))
Carga = animales actualmente asignados / Apastoreable
Stock accesible aproximado = stock total × Apastoreable / A
Crecimiento accesible = crecimiento utilizable total × Rponderada_accesible / Rponderada
```

La referencia accesible usa la parte accesible de cada ambiente. En cambio, el stock accesible supone distribución uniforme del saldo, pues no hay aforos ni inventario de biomasa por subzona. Es una aproximación informativa; no modifica el stock total, el consumo ni las recomendaciones generales de carga. Si no queda superficie accesible, se muestra carga sin datos y oferta accesible cero, nunca infinito. La carga se expresa en cabezas, no en equivalentes vaca.

### Preferencia potencial

Se muestrea una grilla de visualización dentro de la superficie accesible, hasta unas 18 × 18 posiciones; no son píxeles satelitales. Se calcula distancia al recurso accesible más cercano. Las aguadas y sombras totalmente incluidas en restricciones vigentes se excluyen.

Para cada recurso se normaliza la distancia entre el mínimo y el máximo del propio potrero; mayor cercanía significa mayor índice. Distancias idénticas reciben 0,5. Cuando existen ambos recursos se promedian sus índices con pesos iguales; con uno solo se usa ese recurso. Los tercios se muestran como preferencia baja, media y alta.

**Los pesos, tercios y grilla son convenciones visuales, no parámetros calibrados ni probabilidades.** No hay radios fijos, barreras internas/caminos, calidad del agua, palatabilidad, clima térmico ni observación de uso real. Alta cercanía no prueba sobrepastoreo; baja cercanía no prueba subutilización. Los colores no comparan potreros entre sí. No declarar aguadas significa información faltante, no ausencia real de agua.

## Relación con el proyecto final

Documento del usuario: `main.pdf`, 162 páginas de archivo; las siguientes referencias usan numeración impresa (la página del PDF es dos unidades mayor).

| Parte del proyecto | Correspondencia implementada |
|---|---|
| Objetivos y alcance, p. 7; marco intrapotrero, p. 17 | Ambientes y recursos dentro del potrero; alcance de curvas Centro/NEA |
| Taller NEA, pp. 57–59 | Restricciones por inundación declaradas y superficie accesible separada; no equiparar NDVI con palatabilidad |
| RF017, p. 67; CU002, p. 73 | Definición manual opcional de zonas internas |
| CA028, p. 70 | Validación de contención en el límite del potrero |
| CA029, p. 71 | Visualización de cercanía al agua/sombra, con límites explícitos |
| RNF007, p. 68 | Autor, fecha, geometría, configuración y análisis por versión |
| RNF001 | Respaldo del último análisis guardado cuando el servicio no responde |
| Modelo DMP, pp. 104–120 | Mantiene estimación de crecimiento; no convierte DMP en biomasa observada |

Esto cubre una primera versión del análisis espacial. La detección y validación de zonas de sacrificio/subutilización requiere evidencia de campo adicional: el mapa actual solo orienta una recorrida.

## Fuentes y procedencia

| Fuente | Uso real y límite |
|---|---|
| `Flask/stock/data/parametros_regionales.json`, versión 1.1.0 | Fuente numérica efectiva de las curvas. Se reutiliza sin cambiar sus valores. Cada perfil incluye `fuente`. Remite a INTA, compilaciones LART y matriz PFI 3.8; estos respaldos tienen distinto grado de trazabilidad. No se afirma una nueva validación de todos los valores originales. |
| GIS existente: ecorregiones IGN/ANIDA y unidades Oyarzabal et al. (2018), Ecología Austral 28:040–063 | Selección regional existente. No permite identificar por sí solo un bajo dentro de un potrero. |
| [FAUBA, Pastizales templado-húmedos / Pampa Deprimida](https://www.agro.uba.ar/users/garbulsk/Curso_ut_archivos/clases/09%20-%20Pastizales%20templado%20h%C3%BAmedos.pdf) | Respaldo conceptual de diferencias entre comunidades por relieve, drenaje y salinidad. No se digitalizaron sus gráficos ni se adoptaron sus cifras como nuevos coeficientes. |
| [Herrera Conegliano, Quiroga y Blanco (2021), Comportamiento y distribución animal en pastoreo extensivo, INTA, Tecnoárido 3(4):45–48](https://repositorio.inta.gob.ar/handle/20.500.12123/9558) | Referencia presente en la bibliografía del PFI. El repositorio no permitió recuperar el documento en esta revisión; no se atribuyen a él los pesos, radios ni umbrales del mapa. |
| [Copernicus, Sentinel-2 L2A](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Data/S2L2A.html) | Describe resolución y bandas del sensor utilizado por el flujo previo. No aporta mediciones nuevas por zona en este módulo. |
| Usuario del establecimiento | Fuente efectiva de posición del relieve, polígonos, agua, sombra y fechas de inaccesibilidad; requiere comprobación en campo. |

Las curvas de Pampa Deprimida remiten a la **matriz PFI 3.8**, que no debe confundirse con una publicación agronómica primaria ni con el `main.pdf` del proyecto. Esta implementación no corrige ni aumenta artificialmente la precisión de esa matriz. Ver el inventario mensual y procedencia en `Flask/INTRAPOTRERO-FUENTES.md`.

Como evolución, se podrían contrastar las declaraciones con [cartografía de suelos INTA Buenos Aires](https://repositorio.inta.gob.ar/xmlui/handle/20.500.12123/24564?locale-attribute=en) y [modelo digital de elevación IGN](https://www.ign.gob.ar/content/nuevo-modelo-digital-de-elevaciones-de-la-rep%C3%BAblica-argentina), considerando cobertura, escala, error vertical y validación local. **No son entradas implementadas en esta versión.** La elevación por sí sola no determina alcalinidad ni palatabilidad.

## Contratos e implementación

- Node autenticado: `GET /api/v2/potrero/:id/intrapotrero`, `POST` en la misma ruta, `GET .../historial`. Se aplica el middleware de pertenencia del potrero antes de los tres endpoints.
- POST: `{version_base: entero, zonas: [...]}`. Cada zona tiene `id`, `nombre`, `tipo`, `geom` Polygon WGS84; ambiente agrega `ambiente_id` y `posicion`; inaccesible agrega `desde` y `hasta` opcional.
- Flask interno: `POST /intrapotrero/analizar`, recibe `geojson`, `fecha`, `configuracion`. Cálculo determinista sin nuevas llamadas remotas.
- Validaciones: máximo 40 zonas y 500 vértices por polígono, coordenadas finitas 2D, anillos cerrados, geometrías válidas, mínimo 1 m², contención, no superposición entre ambientes y catálogo regional. El límite de cuerpo JSON heredado del backend también aplica.
- Errores: 400 contrato, 422 geometría/catálogo, 409 edición concurrente o potrero inactivo/cambiado, 503 servicio no disponible. Se mantiene un bloqueo de fila al guardar y se compara `version_base` para evitar sobrescrituras.
- Migración aditiva `20260927000001-intrapotrero-versiones.js`, ejecutada antes de atender peticiones, crea `intrapotrero_version`. No transforma potreros ni balances existentes. Guarda JSON de límite, configuración y análisis, autor y fechas. La baja física del potrero elimina sus revisiones por FK; la baja lógica las conserva.
- Guardar zonas y calcular stock son operaciones separadas. Un error del modelo no borra la versión. Si otro cálculo termina con una revisión anterior, la pantalla lo marca pendiente y ofrece actualizar.
- El balance v4 puede continuar el historial v3; el scheduler reconoce ambos. Los días anteriores a la vigencia mantienen sus tasas base. Historiales y saldos guardados no se sobrescriben.

## Verificación

Pruebas de geometría, ponderación parcial/total, unión y vigencia de restricciones, recursos bloqueados y ubicación de la grilla; balance idempotente, versiones, fecha de inicio, proyección diaria, consumo intacto y superficie accesible cero; controlador con fuentes simuladas para validación, conflicto y respaldo; interfaz para guardar, conflicto y reintentar cálculo fallido. También se ejecutan las suites existentes de los tres repositorios y build/lint del front.

Las pruebas unitarias del controlador simulan la base de datos. No sustituyen una prueba de transacción MySQL concurrente ni una validación agronómica de campo. La comprobación de arranque/migración y lectura de la pantalla se realiza al desplegar. No se crean zonas ficticias en los potreros reales para probar.

Para volver al código anterior, ver [INTRAPOTRERO-ROLLBACK.md](INTRAPOTRERO-ROLLBACK.md).
