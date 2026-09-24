# Registro de clientes y caja diaria de Psicología

Los cambios de interfaz se aplican al sistema de Psicología (tenant 4). Se mantienen los formularios de los demás sistemas y los datos existentes.

## Clientes

- Registro y edición aceptan teléfonos internacionales con `+` o prefijo `00`, espacios, guiones y paréntesis. El indicativo se conserva.
- Los números colombianos locales existentes continúan funcionando. La detección de duplicados compara también las variantes con `57` y `+57` dentro del mismo tenant.
- El listado y detalle del cliente permiten abrir WhatsApp con el indicativo correspondiente. No se envían mensajes automáticamente.
- La opción **Otra ciudad o país** permite escribir una ubicación como `Varsovia, Polonia` en el campo de municipio existente, con barrio libre opcional. No requiere columnas nuevas.
- Los controles de carga de documentos y vehículos se ocultan en los formularios de pacientes. La edición conserva los adjuntos y vehículos que ya tuviera el cliente.

## Dashboard

El selector consulta las citas de una fecha en horario de Bogotá, desde las 00:00 inclusive hasta las 00:00 del día siguiente, exclusivo. El detalle de pendientes usa la misma fecha; los indicadores globales mantienen todo el historial.

Los valores reflejan el estado de pago **actual** de las citas agendadas en la fecha elegida. Un pago conciliado posteriormente aparece conciliado al consultar esa agenda. No es un cierre histórico ni un informe de transacciones recibidas durante aquella fecha. Las reglas existentes de conciliación y cálculo de importes no se cambiaron.

## Caja diaria

Ruta preparada: `/dashboard/contabilidad/caja`.

La función está desactivada por defecto. Solo se habilita al compilar y ejecutar con `NEXT_PUBLIC_CAJA_DIARIA_ENABLED=true`. Con la variable ausente o falsa no aparece en el menú y las acciones rechazan solicitudes antes de consultar la base.

Incluye movimientos manuales de ingreso o egreso, fecha, monto en COP, concepto, medio de pago (efectivo, transferencia, tarjeta u otro), referencia opcional y usuario creador. Presenta movimientos del día y totales separados por medio. El neto es ingresos menos egresos del día; no incluye saldo inicial. No se suman automáticamente pagos de citas ni registros de otros módulos, y esta caja no alimenta los balances actuales.

El servidor valida sesión, usuario activo y aprobado, tenant y rol (`ADMIN`, `SU_ADMIN` o `ASESOR`). Incluso un superadministrador consulta únicamente el tenant de Psicología activo. Los importes se validan antes de escribir y se totalizan en centavos. Los reintentos reutilizan un UUID y una restricción única evita duplicados. Los registros no se pueden modificar ni eliminar desde esta primera versión.

### Instalación pendiente de aprobación

La definición aditiva está en `prisma/schema.prisma` y la propuesta SQL en `docs/sql/2026-09-24-caja-diaria.sql`. La propuesta está deliberadamente fuera de las migraciones automáticas. No se ha ejecutado en ninguna base de datos. Las consultas parametrizadas permiten compilar usando los clientes Prisma existentes; el build habitual regenera el cliente desde el esquema.

Antes de habilitarla, el responsable debe revisar y aprobar la instalación, comprobar la definición en un entorno de pruebas separado y aplicar exclusivamente la tabla nueva. La tabla usa RLS sin políticas públicas: verificar que el rol del backend pueda operar y que las credenciales públicas no tengan acceso. Tras validar permisos, inserciones, reintentos y sumas en ese entorno, se podrá autorizar por separado su instalación en producción y activar la variable mediante un nuevo build.

No usar `db push`, `migrate reset` ni introspecciones para instalar este cambio. Para deshabilitar la interfaz se vuelve a compilar con la variable falsa; no se borra la tabla ni sus registros.

## Documentos profesionales pendientes

El modelo `Usuario` y el formulario de técnicos no contienen un repositorio de acreditaciones profesionales. Ese requisito sigue pendiente de definir su almacenamiento y revisión. No se añadieron campos de carga que aparenten guardar documentos ni se reutilizaron campos ajenos para ese fin.

## Verificación local

Las pruebas usan fixtures y dependencias simuladas; no se conectan a bases de datos.

```powershell
node node_modules/tsx/dist/cli.mjs --test tests/psychology-inputs.test.ts tests/caja.test.ts tests/psychology-actions.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

Los contratos cubren fechas, límites del día, consultas por tenant, formatos de teléfono, duplicados, cálculo exacto, permisos, desactivación de caja y reintentos. La instalación SQL real sigue pendiente de validación en una base de pruebas autorizada.
