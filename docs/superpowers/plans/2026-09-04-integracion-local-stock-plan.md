# Plan de implementación: Stock local TerraBovina

## 1. Flask (`StockCalc`)

- Incorporar el motor probado de `Stock3` dentro del repositorio, con sus parámetros y capas GIS.
- Adaptar el ejecutable a una función importable que reciba fecha, consumo total y GeoJSON.
- Reutilizar el artefacto DMP existente del servicio Flask.
- Exponer `POST /predict/stock` con validación y errores HTTP diferenciados.
- Agregar dependencias geoespaciales y pruebas unitarias del contrato sin red.

## 2. Backend (`StockCalc`)

- Agregar configuración de timeout del servicio predictivo.
- Crear migración, modelo y repositorio `estimacion_stock`.
- Incorporar métodos para obtener el DMI más reciente y el polígono del potrero.
- Agregar cliente Flask `predictStock`.
- Exponer creación, última estimación e histórico de Stock.
- Persistir en transacción los campos centrales y el JSON trazable completo.
- Mantener sin cambios el flujo DMI existente.
- Documentar el contrato y cubrirlo con pruebas.

## 3. Front (`New-Front-Style`)

- Agregar servicios para calcular, consultar e historizar Stock.
- Conservar DMI en su lugar actual y usarlo como requisito visible.
- Separar DMP diario de Stock utilizable.
- Mostrar fecha, progreso, resultado central, rango, crecimiento, consumo, balance, referencias y advertencia del stock inicial.
- Actualizar histórico y resumen para consumir Stock.
- Cubrir estados exitosos, sin DMI, en espera y error.

## 4. Verificación local

- Ejecutar las pruebas existentes y nuevas en los tres proyectos.
- Levantar o invocar los componentes localmente cuando estén disponibles.
- Ejecutar el caso Corrientes y comparar campos clave contra `Stock3/Prueba/output.json`.
- Revisar diferencias, estado de Git y confirmar que no haya cambios fuera de los tres repositorios.
