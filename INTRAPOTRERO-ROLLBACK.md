# Respaldo y recuperación

Se verificaron estas ramas y revisiones desplegadas en Dokploy antes de implementar el análisis. En los tres repositorios se creó y publicó el tag **`respaldo/pre-intrapotrero-20260927`** apuntando al commit previo. El nombre usa fecha UTC; el trabajo comenzó el 26/09 en Argentina.

| Servicio / repositorio | Rama desplegada | Commit previo |
|---|---|---|
| Front, IgnaBilli/PFI-Front | `New-Front-Style` | `1f53548953db5142ae3af0397a8a1645f0ccb6da` |
| Node, JuanManuelSosa2004/BackendTerrabovina | `StockCalc` | `989fbe6b5d832b44f214ed52466918f876d9f94e` |
| Flask, IgnaBilli/Flask | `StockCalc` | `593d72afc64b966001be535ba6b6d727eb4ac85c` |

No se incorporaron las ramas de otras propuestas o previews. Se conservaron los archivos locales ajenos a la tarea.

## Dos recuperaciones diferentes

**Recuperar la clasificación de un potrero:** usar el historial en el front y cargar la revisión deseada. Revisarla y guardarla crea una versión nueva desde hoy. Para quitar todo el ajuste, eliminar las zonas pendientes y guardar una configuración vacía: desde hoy factor 1. No borra el efecto histórico de días anteriores ni sus registros.

**Recuperar el sistema anterior:** desplegar los commits de la tabla o el tag indicado. Primero front, luego Node y finalmente Flask. Dokploy tiene autodeploy de las ramas; evitar nuevos pushes durante la recuperación. Se puede usar un despliegue anterior exitoso desde su historial, verificando el SHA. Si se necesita mantener la rama como fuente, crear un commit de reversión de los commits de esta entrega y publicarlo, revisando antes los cambios posteriores. No hacer force-push ni reset destructivo sobre trabajo ajeno.

## Datos y límites del respaldo

El tag respalda **código**, no una instantánea completa de MySQL, imágenes Docker, variables de entorno o fuentes externas. No se generó un nuevo dump completo de producción en esta tarea. La nueva tabla es aditiva: el código anterior puede ignorarla. Mantener `intrapotrero_version` y sus registros al volver atrás; **no ejecutar `db:migrate:undo` ni `down` para un rollback ordinario**, porque borraría el historial nuevo.

El balance nuevo se identifica como `balance_diario_ambientes_v4`. El código anterior v3 no reutiliza ese ledger al solicitar un cálculo: vuelve a inicializar su ventana con su método previo. Los resultados históricos guardados permanecen y pueden verse hasta recalcular. El scheduler anterior solo continúa v3; después de volver atrás se requiere actualizar manualmente los potreros que llegaron a v4 para retomar esa rutina. Revertir código no restaura exactamente un saldo anterior ni elimina el paso del tiempo o los movimientos de ganado registrados desde entonces.

## Comprobación al desplegar o recuperar

1. Verificar rama y SHA en Dokploy y estado Done por servicio.
2. Comprobar arranque de Flask, luego Node y luego front en la entrega normal; para retiro de la función, orden inverso.
3. Abrir un potrero existente, revisar que la ficha y el saldo se carguen. En la versión nueva abrir Análisis intrapotrero y comprobar región/catálogo y ausencia de errores.
4. Revisar logs ante fallo de migración. No sustituir ni borrar tablas de potreros, ganado o estimaciones.
5. Conservar tags, revisiones de zonas e historial de estimaciones. Los secretos de despliegue no forman parte de esta documentación.
