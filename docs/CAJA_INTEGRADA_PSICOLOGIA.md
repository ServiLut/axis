# Caja integrada de Psicólogos en Colombia

## Propósito

En **Contabilidad → Caja diaria** se muestran ingresos y salidas por el día en que el dinero se recibió o entregó y por medio de pago. No se debe sumar ese importe otra vez al valor de las sesiones realizadas. Este es un control operativo de dinero: no sustituye el libro contable con cuentas, causación, soportes y comprobantes, ni la facturación electrónica o el extracto bancario.

## Circuitos de captura

- **Consulta directa:** seleccionar la cita, confirmar dinero recibido y registrar hasta cuatro líneas de pago. Por ejemplo, $20.000 en efectivo y $30.000 por transferencia generan dos movimientos de caja enlazados a una sola cita. Se admite pago parcial; no se admite pagar más que el precio de la cita. La fecha de la cita puede ser futura y la caja conserva la fecha efectiva del ingreso.
- **Paquete:** registrar el cobro contra el paquete completo. Las sesiones consumidas no generan un segundo ingreso. El paquete adquirido antes del 26/09/2026 requiere revisión de sus soportes históricos antes de registrar un cobro nuevo.
- **Impresiones y tiempo extra:** siguen su captura en Recepción; al confirmar pago crean automáticamente el movimiento en la misma caja.
- **Gastos:** internet, servicios públicos, papelería y otros pagos efectuados se registran como EGRESO en Caja diaria, con fecha, medio, importe, concepto y referencia. El antiguo módulo de Egresos conserva su historial, pero no admite nuevas partidas para PSICOLOGOS cuando Recepción está activa, para evitar dobles gastos.
- **Otros ingresos:** solo para conceptos distintos de consultas, paquetes, impresiones o adicionales. Se debe revisar el concepto y soporte para evitar duplicidad.

Un pago no efectivo requiere referencia. La aplicación bloquea la reutilización de referencias activas dentro de cobros de citas, paquetes y Recepción; las operaciones de pago dividido son atómicas e idempotentes. La devolución se registra únicamente después de entregar realmente el dinero en el mismo medio: agrega una salida y conserva el ingreso original.

## Alertas y lectura de cifras

El panel muestra rojo para citas o paquetes anteriores cuyo valor no consta completamente en el nuevo libro, y para citas posteriores al inicio de este circuito que aparecen marcadas como cobradas sin asiento. **Rojo significa investigar o cobrar según el soporte**, no prueba deuda, pérdida ni responsabilidad personal. Los estados de pago históricos se muestran para verificación separada y no se inventan como dinero recibido. Los contadores cubren toda la consulta; la lista se carga en páginas de 200 registros para poder recorrerla completa.

Un comprobante adjunto o la marca `CONCILIADO` en Axis no demuestra por sí solo el abono en banco. Se requiere cotejo contra caja física, pasarela o extracto. El libro tampoco descubre citas que jamás fueron creadas: eso requiere cruzar agenda, WhatsApp, Doctoralia, comprobantes y banco.

## Instalación y verificación

1. Conservar respaldo de PostgreSQL. Confirmar tenant `4` (`PSICOLOGOS`), empresa `3` (`Psicólogos en Colombia`) y las tablas `MovimientoCaja`, `PagoRecepcion` y `CargoRecepcion`.
2. Ejecutar una sola vez `docs/sql/2026-09-26-pagos-servicios.sql` mediante `psql -v ON_ERROR_STOP=1`. Es transaccional y solo agrega `PagoServicioPsicologia`, índices y RLS.
3. Publicar el código con `NEXT_PUBLIC_RECEPCION_ENABLED=true`. El backend comprueba tenant, rol, cuenta activa/aprobada y precio pendiente antes de guardar dinero.
4. En una copia de pruebas, recorrer con sesión autenticada consulta con dos medios, paquete, pago parcial, gasto y devolución. Confirmar que cada movimiento aparece exactamente una vez en el libro y que una cita cancelada no se ofrece como cobro ordinario.
5. En producción verificar visualmente la pantalla con un usuario de PSICOLOGOS. No crear pagos ficticios en producción. Si falta la sesión, registrar esta cobertura como pendiente.

`npm.cmd run test:psicologia` cubre 35 casos; `npm.cmd run build` compila con la función activa y variables ficticias locales.

## Límites para la siguiente fase

Los gastos anteriores del módulo Egresos carecen de fecha efectiva y medio verificables; no se pueden migrar a caja como si fueran salidas bancarias. La nueva caja no representa saldo inicial, conciliación con extracto, cuentas contables, IVA, impuestos ni factura electrónica. Tampoco hay importación bancaria o lectura de WhatsApp que confirme ingresos ausentes. Se necesita un cierre diario firmado con saldo inicial y soportes, una revisión de cartera histórica y un circuito controlado de ajuste de errores manuales.
