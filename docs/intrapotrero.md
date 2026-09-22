# Análisis intrapotrero

Integración aditiva en `StockCalc`, con frontend en `New-Front-Style` y servicio
Flask en `StockCalc`. No modifica fórmulas de stock, DMI, DMP ni consumo.

## Flujo

- GET `/api/v2/potrero/:id/intrapotrero`: datos persistidos y estado de tarea. Nunca
  consulta satélites. Reutiliza autenticación y verificación de dueño del potrero.
- POST en la misma ruta: encola análisis del límite guardado, devuelve 202.
  Máximo tres tareas pendientes de este tipo; duplicados del mismo potrero se unen.
- Flask POST `/analysis/intrapaddock`: hasta cuatro capturas de Sentinel-2 L2A
  en 90 días, consultadas a Earth Search. Bandas red/NIR y máscara SCL.
- El cliente consulta el estado cada cinco segundos mientras la tarea esté activa.
  Al salir de la pantalla deja de consultar; volver permite recuperar el estado.
- El último resultado se guarda en `analisis_intrapotrero`, junto con hash del
  límite. Si cambia la geometría, el resultado anterior no se muestra. Si cambia
  durante una tarea, una transacción bloquea el potrero y rechaza guardar el
  resultado obsoleto. Fallos de la fuente conservan el resultado previo.

La migración `20260921000001-intrapotrero.js` es aditiva e idempotente. Se aplica al
iniciar el backend y se registra en SequelizeMeta, igual que el cambio previo de
DMI de ingreso. No se recalculan ni migran datos productivos existentes.

## Interpretación

Los cuatro sectores son cuadrantes métricos intersectados con el potrero, no zonas
de productividad inferidas ni ambientes edáficos. Mantienen sus límites entre
fechas. El NDVI se calcula a 10 m, aplicando escala/offset publicados en STAC y SCL
original a 20 m. Solo clases 4 y 5 son válidas; agua, sombra, nubes, nieve y nodata
se excluyen. Bordes y huecos se ponderan por su intersección espacial exacta.

El promedio usa hectáreas observadas de cada sector, nunca convierte faltantes en
cero. Un sector requiere al menos 400 m² válidos para informar promedio. El cambio
entre fechas usa únicamente píxeles válidos comunes. El gráfico de promedios puede
abarcar superficies distintas: no interpretar su pendiente como crecimiento.

El mapa agrupa píxeles para limitar el tamaño del resultado; muestra la resolución
de visualización y enmascara celdas con menos del 50% de área válida. Sus colores no
son la entrada del promedio. La imagen Esri es un fondo de referencia de otra fecha.
La captura más reciente se conserva aunque no tenga datos válidos; las restantes
priorizan capturas con observaciones. Al abrir se selecciona la más reciente con
superficie válida. Se advierte cuando la cobertura es inferior al 50%.

## Límites operativos y reversión

Se examinan hasta 12 escenas candidatas, con presupuesto de 240 segundos entre
lecturas; cada lectura tiene timeout de red. El cliente Node espera hasta 10 minutos
desde el inicio de la consulta al servicio. La cola comparte el límite de acceso a
Flask de Stock para no saturar sus hilos. Las tareas pendientes están en memoria:
un reinicio las interrumpe y permite reintentar; los resultados terminados persisten.
Límite de 10.000 ha y un millón de celdas en la grilla de trabajo por potrero.

Respaldo previo en los tres repositorios: `backup/pre-intrapotrero-20260921`.
Estados previos: frontend `df36a05`, Node `ba38ab6`, Flask `145af98`.
Para deshacer, revertir los commits de esta integración y volver a desplegar las
ramas. Mantener la tabla aditiva conserva observaciones; no es necesario eliminarla
para ejecutar las versiones anteriores. Revisar cambios posteriores antes de revertir.

## Referencias técnicas

- https://github.com/Element84/earth-search — STAC y escala/offset de bandas.
- https://sentiwiki.copernicus.eu/web/s2-processing — clasificación de escena SCL.
- https://sentiwiki.copernicus.eu/web/s2-products — resoluciones de Sentinel-2.

La división geométrica es una decisión de producto; estas referencias no validan
una conversión de NDVI a kg de materia seca ni justifican llamar loma/bajo a un sector.
