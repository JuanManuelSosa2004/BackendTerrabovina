# Diseño: integración local de Stock en TerraBovina

Fecha: 2026-09-04

## Objetivo

Integrar el flujo probado en `Stock3` con los tres proyectos locales de TerraBovina:

- `PFI-Front`, rama `New-Front-Style`.
- `BackendTerrabovina`, rama `StockCalc`.
- `Flask`, rama `StockCalc`.

La integración debe conservar el cálculo DMI actual, usar su último resultado persistido como consumo diario del rodeo y agregar un cálculo separado de stock utilizable. No se hará push, despliegue ni modificación de configuración productiva.

## Estado actual y problema

El Backend llama a `POST /predict/dmp` de Flask y persiste `dmp_kg_ms_ha_dia` en `disponibilidad_forrajera.kg_materia_seca_ha`. Luego el Front interpreta ese valor como oferta o disponibilidad, aunque sus unidades corresponden a un flujo diario y no a biomasa en pie.

El DMI ya funciona de manera independiente: Flask predice el consumo por animal, el Backend suma las predicciones y persiste el total diario del rodeo en `estimacion_demanda`. Este comportamiento debe mantenerse.

`Stock3` ya demuestra un flujo independiente que combina contexto GIS, cobertura, referencias regionales, anomalía DMP, fracción utilizable, stock inicial provisional y consumo para producir un balance de 30 días.

## Decisiones aprobadas

1. Se agregará un endpoint nuevo de Stock; no se reemplazará `/predict/dmp`.
2. Se agregará una tabla nueva `estimacion_stock`; no se mezclarán registros nuevos con `disponibilidad_forrajera`.
3. El DMI conservará su endpoint, persistencia y presentación actuales.
4. Stock usará el último DMI persistido y no ejecutará DMI automáticamente.
5. El cálculo será síncrono: el Front esperará mostrando un estado de progreso.
6. El cálculo y todas las dependencias se ejecutarán localmente.
7. El modelo DMP existente se reutilizará sin reentrenarlo ni modificar su artefacto.
8. El stock inicial se integrará como proxy provisional y se identificará como no validado.
9. El nuevo endpoint no fabricará NDVI, clima o stock cuando una fuente externa falle.

## Arquitectura

```text
PFI-Front
  POST /api/v2/potrero/:id/estimacion-stock { fecha }
      |
BackendTerrabovina
  obtiene potrero + último DMI
  POST http://localhost:5000/predict/stock
      |
Flask
  GIS + MapBiomas + Sentinel-2 + clima + DMP + referencias + balance
      |
BackendTerrabovina
  transacción de persistencia y respuesta normalizada
      |
PFI-Front
  stock, rango, crecimiento, consumo, referencia y confianza
```

## Flask

### Endpoint

Se agregará:

```http
POST /predict/stock
```

Entrada:

```json
{
  "fecha": "2026-09-04",
  "consumo_diario_total_kg_ms": 350.0,
  "geojson": {
    "type": "Polygon",
    "coordinates": []
  }
}
```

La respuesta conservará la estructura trazable de Stock3: potrero, contexto GIS, selección de referencia, MapBiomas, DMP por períodos, crecimiento, stock inicial, consumo, stock final, coherencia y limitaciones.

### Componentes

La lógica se copiará y adaptará como código propio de Flask, sin depender de rutas externas a ese repositorio:

```text
stock/
  calculator.py
  validation.py
  gis.py
  satellite.py
  climate.py
  dmp.py
  regional_references.py
  initial_stock.py
data/stock/
  parametros_regionales.json
  gis/
    capas y metadata versionada
```

El artefacto `modelo_final DMP/models/final_model.joblib` será compartido por `/predict/dmp` y `/predict/stock` mediante un adaptador interno, sin copiar ni reentrenar el modelo.

### Reglas

- La fecha objetivo no puede ser futura.
- La ventana comprende 30 días incluyendo ambos extremos.
- Se divide en tres bloques consecutivos de 10 días.
- El contexto geográfico se resuelve mediante intersección del polígono completo con IGN/ANIDA y Oyarzabal.
- MapBiomas confirma cobertura compatible, pero no inventa una comunidad botánica.
- Si hay más de un perfil regional compatible, se utiliza la mediana y se conserva el rango completo.
- Si no existe referencia compatible, se devuelve un error explícito.
- Se exigen al menos tres años DMP históricos válidos por bloque.
- El factor DMP se limita a los umbrales configurados.
- No se devuelven valores satelitales ficticios ante fallas.

### Fórmulas

```text
factor DMP = DMP actual / mediana DMP histórica
crecimiento bruto = referencia regional diaria x factor DMP
crecimiento utilizable = crecimiento bruto x fracción utilizable
consumo 30d por ha = consumo diario total x 30 / superficie
stock final = stock inicial + producción utilizable - consumo 30d
```

El stock inicial actual es:

```text
prior operativo medio x factor DMP del primer bloque
```

Debe regresar con:

```json
{
  "estado": "PRELIMINAR_NO_VALIDADO",
  "confianza": "BAJA",
  "medicion_real": false
}
```

## Backend

### Endpoints

```http
POST /api/v2/potrero/:potreroId/estimacion-stock
GET  /api/v2/potrero/:potreroId/estimacion-stock
GET  /api/v2/potrero/:potreroId/estimacion-stock/historico
```

El POST recibirá únicamente una fecha opcional:

```json
{ "fecha": "2026-09-04" }
```

Si se omite, se utilizará la fecha local actual del Backend. El Backend buscará el potrero y la última estimación DMI persistida. Si no existe DMI, responderá 409 con un mensaje que indique calcular primero el consumo.

El cliente del modelo incorporará `predictStock`. El timeout local será configurable y tendrá un valor recomendado de 300000 ms.

### Persistencia

Se agregará una migración, modelo Sequelize y repositorio para `estimacion_stock`. La tabla contendrá:

- Identificador y potrero.
- Fechas inicial, objetivo y de cálculo.
- Superficie.
- Consumo diario total, consumo diario por ha y consumo acumulado por ha.
- Crecimiento bruto y utilizable promedio.
- Producción utilizable acumulada.
- Stock inicial mínimo, central y máximo.
- Stock final mínimo, central y máximo.
- Stock final total central.
- Ecorregión, unidad de vegetación y estado de selección regional.
- Confianzas geográfica, ambiental, satelital, histórica y de stock inicial.
- Estado, versión metodológica y detalle JSON completo.
- Timestamps.

Los campos centrales facilitarán consultas y analíticas; `detalle_json` conservará la trazabilidad completa sin normalizar cada escena histórica.

### Transacción y compatibilidad

La persistencia se hará en una transacción. Una falla de Flask no insertará una fila parcial y no invalidará el último stock exitoso.

Los endpoints DMP, DMI y las tablas existentes se conservarán. El nuevo Front dejará de usar `disponibilidad_forrajera` como stock. Los registros antiguos no se borrarán ni reinterpretarán automáticamente.

La documentación OpenAPI se actualizará con contratos, estados 201/400/409/502 y ejemplos.

## Front

### Flujo de usuario

1. El usuario calcula el consumo DMI como actualmente.
2. El consumo queda visible en el mismo componente y se muestra su fecha.
3. El usuario selecciona una fecha de Stock, por defecto hoy.
4. Presiona `Calcular stock`.
5. El Front espera, bloquea solicitudes duplicadas e informa que el cálculo puede demorar varios minutos.
6. Al finalizar actualiza detalle, historial y resumen.

El botón Stock estará deshabilitado si no existe un DMI previo. DMI no se volverá a ejecutar dentro de Stock.

### Presentación

La sección `Oferta forrajera` pasará a `Stock utilizable` y mostrará:

- Stock final central por ha.
- Rango mínimo-máximo.
- Stock total del potrero.
- Crecimiento bruto y utilizable.
- Consumo total y por ha.
- Porcentaje del consumo cubierto por el crecimiento.
- Reducción o aumento neto del stock.
- Fecha y antigüedad del DMI utilizado.
- Ecorregión, unidad de vegetación y perfiles regionales.
- Confianzas y advertencias.
- Etiqueta visible `Stock inicial preliminar no validado`.

El historial mostrará la evolución del stock central con su rango, consumo y crecimiento. Las analíticas de estancia utilizarán `estimacion_stock` para la distribución entre potreros y la comparación crecimiento-consumo.

## Configuración local

```text
Flask:  http://localhost:5000
Backend: configuración local del repositorio
Front: servidor Vite local
MySQL: BackendTerrabovina/docker-compose.yml
```

Backend:

```env
MODEL_API_BASE_URL=http://localhost:5000
MODEL_API_TIMEOUT_MS=300000
```

Front:

```env
VITE_API_URL=http://localhost:3000/api/v2
```

No se cambiarán valores productivos ni valores por defecto de despliegue remoto.

## Manejo de errores

- 400: fecha o geometría inválida, cobertura incompatible u otra entrada inválida.
- 409: el potrero no tiene un DMI persistido.
- 422: ubicación sin referencia regional o historia insuficiente.
- 502: Flask o una fuente necesaria no responde.
- El Front presentará mensajes accionables y conservará el último resultado exitoso.
- Nunca se guardarán resultados parciales ni datos remotos fabricados.

## Pruebas

### Flask

- Validación de entrada, fechas, área y consumo.
- GIS exacto, parcial y sin referencia.
- MapBiomas incompatible.
- Escena inválida e historia insuficiente.
- Factor DMP, límites, curvas, fracción utilizable y balance.
- Confirmación de ausencia de fallbacks ficticios.
- Caso real de Corrientes comparable con Stock3.

### Backend

- Autenticación y propiedad.
- DMI obligatorio y selección del registro más reciente.
- Contrato enviado a Flask.
- Persistencia completa y rollback.
- Último stock e histórico.
- Errores 409 y 502.
- Analíticas basadas en stock sin mezclar disponibilidad histórica.

### Front

- DMI permanece visible y operativo.
- Botón Stock bloqueado sin DMI.
- Fecha válida y estado de espera prolongada.
- Presentación de valores, rangos, unidades y advertencias.
- Manejo de errores, actualización del historial y resumen.

### Integración local

```text
crear potrero
-> asignar ganado
-> calcular DMI
-> calcular Stock
-> verificar persistencia
-> verificar detalle e historial
-> verificar resumen de estancia
```

## Orden de implementación

1. Incorporar módulo Stock y datos GIS en Flask.
2. Agregar `/predict/stock` y pruebas de Flask.
3. Crear migración, modelo y repositorio en Backend.
4. Agregar cliente, controlador, rutas y OpenAPI en Backend.
5. Actualizar analíticas y pruebas de Backend.
6. Agregar servicios, estado y componentes de Stock en Front.
7. Actualizar historial y resumen en Front.
8. Ejecutar pruebas unitarias e integración local.
9. Comparar el caso Corrientes con `Stock3` y documentar diferencias.

## Criterios de aceptación

- DMI mantiene su comportamiento y ubicación visual.
- Stock utiliza el último DMI sin recalcularlo.
- El cálculo completo funciona en local en las tres ramas aprobadas.
- No se mezclan unidades de DMP diario y stock por ha.
- El resultado incluye valor central, rango, total, crecimiento, consumo, GIS, referencias y confianza.
- No se fabrican datos ante fallas.
- El stock inicial aparece siempre como preliminar mientras use el proxy.
- Las pruebas existentes continúan pasando y las nuevas cubren el flujo.
- No hay push, despliegue ni cambios fuera de los tres proyectos locales.
