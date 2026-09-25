# Recepción: impresiones y adicionales

## Estado de entrega — 25 de septiembre de 2026

Implementado y probado en la copia de desarrollo de Axis. **No instalado en producción.** El módulo está desactivado por defecto y requiere las tablas nuevas y `NEXT_PUBLIC_RECEPCION_ENABLED=true` tanto al compilar como al ejecutar. No se modificaron citas ni pagos reales durante esta implementación.

## Tarifas autorizadas

| Concepto | Unidad | Precio COP |
| --- | --- | ---: |
| Impresión | Cada hoja entera | 800 |
| Tiempo extra, 1 a 15 minutos | Un adicional separado del alquiler | 4.000 |
| Tiempo extra, 16 a 30 minutos | Un adicional separado del alquiler | 8.000 |
| Tiempo extra, más de 30 minutos | Una reserva normal como adicional | Catálogo vigente de alquiler |

Se cobra **un solo tramo**, sin sumar 4.000 + 8.000 + reserva normal. Esta regla sustituye la anterior de 1–14 minutos y hora desde 15. La tarifa normal se obtiene del único servicio activo cuyo nombre contiene «alquiler» y tiene una sesión; nunca se fija en el navegador en 18.900. Si no existe una correspondencia única o el precio no es válido, el cobro se bloquea para corregir el catálogo.

Cada cargo conserva su descripción, cantidad y tarifa original. Cambiar el catálogo no altera deudas ni cobros previos. Los administradores pueden actualizar impresión y los dos tramos con motivo auditado. El precio de la reserva normal se administra en el catálogo de alquiler.

La reserva inicia a la hora pactada; la entrega se solicita cinco minutos antes del final. La cortesía está incluida en el tiempo reservado. Por ejemplo, reserva 10:00–11:00: entrega prevista 10:55, cortesía hasta 11:00; 11:15 corresponde a 4.000, 11:16 y 11:30 a 8.000, 11:31 a la tarifa normal. El cobro no concede permiso para retrasar el siguiente turno.

Los minutos se registran manualmente como enteros, después de verificar la entrega, con hora y responsable en la nota. No se han conectado lectores de huella, NFC, impresoras ni cámaras. La versión inicial deriva a revisión los excesos superiores a 60 minutos; falta definir si se repiten tramos u horas. Tampoco inventa una tarifa nueva para reservas contratadas menores de una hora: acepta horas completas o 55 minutos de uso más la cortesía; bloquea otras duraciones para revisión.

## Uso en recepción

1. En PSICOLOGOS, abrir **Gestión de Citas → Recepción: impresiones y adicionales**. Hay también un acceso desde Servicios y Paquetes.
2. Seleccionar la fecha y un profesional registrado en Equipo de Trabajo.
3. Para impresiones, indicar hojas. Para tiempo extra, elegir su reserva de alquiler finalizada e indicar minutos y verificación de entrega.
4. Revisar el total y registrar el cargo. Queda pendiente hasta registrar dinero recibido.
5. Seleccionar uno o varios cargos del mismo profesional, indicar el abono a cada uno, fecha real del pago, medio y recibo/referencia. Confirmar que el dinero fue recibido.
6. Consultar el libro diario: el ingreso se crea automáticamente junto con el pago. **No ingresarlo otra vez como movimiento manual.**

Un pago puede cubrir varios cargos del mismo profesional y se admiten abonos parciales. Para varios medios de pago, registrar los importes efectivamente recibidos en operaciones separadas, cada una con su referencia. No se admite pagar más que el saldo ni aplicar un pago a otro profesional.

Para corregir un cargo sin pagos, administración puede anularlo con motivo. Para devolver un pago de esta versión, se registra la devolución íntegra en su mismo medio: conserva el pago, añade un egreso y reabre los saldos. La pantalla **registra una devolución realizada**; no ejecuta una transferencia bancaria. Las devoluciones parciales y por otro medio requieren un desarrollo posterior.

### Límite contable explícito

Impresiones y tiempo extra tienen cargos y pagos propios. **El alquiler base, las consultas y los paquetes todavía conservan su circuito de pago en Citas.** No se migran automáticamente marcas CONCILIADO a transacciones: eso podría duplicar anticipos o comprobantes compartidos.

Balances distingue el valor de servicios realizados, el de aquellos actualmente marcados conciliados y lo pendiente de conciliar. La sección separada del libro suma movimientos por fecha efectiva y medio, sin incorporarlos por segunda vez al importe de servicios. No representa un cierre integral histórico ni saldo bancario confirmado. Tampoco incluye un saldo inicial de caja.

El registro de cargos no constituye emisión de factura electrónica. No se integra con un proveedor de facturación en esta entrega.

## Controles implementados

- Usuario autenticado, activo, aprobado, con rol habilitado. Recepción se limita a tenant 4, incluido SU_ADMIN.
- Profesional, cita y consultorio de la misma empresa/sistema. El adicional requiere reserva de alquiler y que su fin ya haya pasado.
- Cantidades enteras positivas; dinero en centavos/NUMERIC(12,2); fechas válidas en Bogotá.
- UUID por operación y comparación de su contenido: el mismo reintento retorna el registro previo; reutilizar un UUID para otro importe se rechaza.
- Referencia activa de pago única por empresa y medio; un pago puede aplicarse a varios cargos para evitar duplicar una transferencia.
- Un solo adicional activo por reserva. Para corregirlo debe anularse el anterior, después de resolver pagos si los tiene.
- Operaciones atómicas: pago, aplicaciones, movimiento y auditoría se guardan juntos; un fallo revierte todo.
- Bloqueo breve por tenant para serializar creación de reservas, cobros y correcciones dentro de las rutas revisadas. No se invocan servicios externos mientras se mantiene el bloqueo.
- RLS sin políticas públicas en las cuatro tablas nuevas; solo el backend puede operar. No se exponen credenciales de servicio al navegador.

Los controles entre tablas se aplican en las acciones del servidor y las restricciones SQL. Un administrador de base con privilegios para saltar RLS sigue pudiendo alterar datos directamente: no es un sistema de auditoría inmutable externo.

## Correcciones relacionadas

- Calendario muestra REALIZADO cuando corresponde.
- Crear, editar, mover o restaurar una cita comprueba cruces del profesional y del consultorio en las rutas revisadas. Intervalos contiguos son válidos; canceladas no ocupan horario.
- La edición de alquiler conserva el precio histórico cuando no cambia la duración contratada. Nuevas reservas toman la tarifa del servidor y reservan la cortesía. Arrastrar el calendario no permite ampliar duración sin revisar el valor.
- La búsqueda de clientes y el formulario de profesionales/catálogo se limitan al tenant activo; la lista de citas de PSICOLOGOS no se amplía a todas las empresas al ser SU_ADMIN.
- Balances de Psicología no incluye como conciliadas las citas pendientes y restringe nómina, anticipos y egresos a PSICOLOGOS incluso para SU_ADMIN. Presenta importes con dos decimales y aclara que el prorrateo de paquetes es una estimación de prestaciones, no movimientos bancarios.
- Egresos valida monto y responsable, limita edición/anulación a administradores y conserva el original al anular: crea una partida opuesta con fecha actual y motivo. La interfaz explica el reverso.
- Una auditoría fallida dentro de transacción hace fallar y revertir la operación.

## Instalación propuesta

1. Confirmar visualmente la empresa Psicólogos en Colombia y el sistema PSICOLOGOS; verificar que tenant 4 y el catálogo de alquiler corresponden a esa operación. Tener respaldo comprobable y desplegar primero sobre una copia de pruebas.
2. Comprobar si ya existe `MovimientoCaja`. Si no, ejecutar `docs/sql/2026-09-24-caja-diaria.sql`. Si existe, comparar su estructura antes de continuar, sin recrearla.
3. Ejecutar una sola vez `docs/sql/2026-09-25-recepcion.sql`, que crea ServicioRecepcion, CargoRecepcion, PagoRecepcion y AplicacionPagoRecepcion, índices, restricciones y RLS. El archivo es transaccional y no reescribe históricos.
4. Verificar con el rol real del backend que puede usar las tablas y que los roles públicos no pueden leerlas ni escribir. Prisma schema no representa los CHECK ni índices parciales: **no usar db push/reset en sustitución del SQL**.
5. Configurar `NEXT_PUBLIC_RECEPCION_ENABLED=true`, construir la aplicación en el entorno Linux del VPS y ejecutar con la misma variable. `NEXT_PUBLIC_CAJA_DIARIA_ENABLED` puede seguir ausente: Recepción habilita también el acceso al libro.
6. En la copia de pruebas, ejecutar un recorrido autenticado completo desde la interfaz: impresión, adicional, abono, devolución y balance. Comprobar horarios simultáneos en dos sesiones y catálogo real. Ese recorrido con la configuración del VPS todavía está pendiente.
7. Publicar únicamente tras pasar esas comprobaciones. Para desactivar Recepción, retirar su flag, retirar el de caja si estuviera activo y reconstruir. Conservar tablas e historial; no borrarlos como reversión. Las correcciones generales de agenda/balances pertenecen al código y no dependen del flag de Recepción.

## Pruebas ejecutadas localmente

`npm.cmd run test:psicologia`: **29 pruebas aprobadas**. Incluyen:

- 1/2/3/10 hojas; límites de 15/16/30/31 minutos; cotizaciones históricas conservadas.
- Pago parcial compartido, sobrepago, referencia repetida, una devolución, una anulación y sus saldos exactos.
- Reintentos del mismo UUID y fallos forzados de auditoría sin operaciones huérfanas.
- Tenant/rol incorrecto, usuarios inactivos y lectura denegada por RLS al rol público.
- Reserva con conflicto, restauración con conflicto, prohibición de ampliar alquiler desde el calendario, estados realizados.
- Balances con prestaciones pendientes y paquetes de valor periódico; filtros de Bogotá y empresa; reverso de egreso sin borrado.

Las cuatro pruebas de SQL ejecutan ambos scripts en PostgreSQL embebido (PGlite), sin bases externas. Verifican restricciones y transacciones reales, pero no sustituyen pruebas de varias conexiones concurrentes sobre el PostgreSQL del VPS.

También aprobados: Prisma validate/generate, TypeScript y ESLint sobre los archivos de aplicación modificados. `npm.cmd run build` terminó con código 0 y 71 páginas prerenderizadas usando endpoints y claves ficticios locales, con Recepción habilitada. El empaquetado standalone emitió dos advertencias de Windows por nombres `node:buffer`; el artefacto Windows no se debe desplegar al VPS: reconstruir y validar allí en Linux. El primer intento sin variables había fallado por configuración ausente, no por TypeScript.

## Hallazgos que requieren la siguiente revisión

No se certifica que todo Axis carezca de errores. Siguen pendientes la unificación de cobros de citas/paquetes con el libro, cierre con saldo inicial, adjuntos propios de pagos de recepción, conciliación bancaria, exportación contable integral, automatización de reportes y facturación electrónica.

En el código heredado de nómina hay que excluir alquileres de honorarios clínicos según contrato y recalcular importes en servidor; el endpoint acepta totales provenientes del cliente. Las acciones heredadas de comprobantes/conciliación y eliminación de citas también requieren completar la misma revisión de permisos y trazabilidad. Estos circuitos no forman parte de la nueva recepción y no deben tomarse como ya auditados íntegramente.

Los indicios históricos documentados en el informe son diferencias para investigar; por sí solos no demuestran apropiación de dinero ni responsabilidad de una persona.
