# Base de datos

## Vision general

El proyecto usa tres schemas Prisma:

| Schema | Motor | Config | Cliente generado | Uso |
|---|---|---|---|---|
| `prisma/schema.prisma` | PostgreSQL | `prisma.config.ts` | `prisma/generated/prisma` | Base principal del sistema |
| `prisma/schema.mysql.prisma` | MySQL/MariaDB | `prisma.mysql.config.ts` | `prisma/generated/prisma-mysql` | Integracion legacy Servilution |
| `prisma/schema.tecnicos.prisma` | MySQL/MariaDB | `prisma.tecnicos.config.ts` | `prisma/generated/prisma-tecnicos` | Integracion legacy servicio tecnico |

La base principal es la unica usada para la mayoria de escrituras del dashboard. Las bases MySQL se consultan mediante helpers manuales y se usan para vistas/migraciones legacy.

## Conexion PostgreSQL principal

Archivo:

- `lib/prisma.ts`

Variables:

- `POSTGRES_PRISMA_URL`
- `DATABASE_URL`
- `DB_CA_CERT`
- `DB_SSL`

Comportamiento:

- Prioriza `POSTGRES_PRISMA_URL`.
- Si no existe, usa `DATABASE_URL`.
- Limpia el parametro `sslmode` del connection string.
- Crea un `pg.Pool`.
- Usa `PrismaPg`.
- En desarrollo guarda el cliente en `globalThis.prisma`.

## Conexion PostgreSQL fresh

Archivo:

- `lib/prisma-fresh.ts`

Uso:

- Crea cliente nuevo cada vez.
- No reutiliza `globalThis`.
- Sirve cuando se necesita evitar una instancia global vieja.

## Conexion MySQL legacy

Archivo:

- `lib/mysql.ts`

Variable:

- `DATABASE_URL_MYSQL`

Modelos principales:

- `clientes`
- `servicios_prestados`
- `empresa`
- `perfil_trabajador`
- `servicios`
- `estado_servicio`
- `estado_inicial_servicio`
- `metodos_de_pago`
- `municipios`
- `barrios`
- `departamentos`
- `zonas_locativas`
- `usuarios`
- `rol`
- `geolocalizacion_servicios`
- `direcciones`

Uso:

- Consulta clientes y servicios del sistema legacy Servilution.
- Normaliza resultados para vistas actuales.
- Expone helpers parecidos a Prisma:
  - `clientes.findMany`
  - `servicios_prestados.findMany`
  - `getFilterOptions`

## Conexion MySQL tecnicos

Archivo:

- `lib/tecnicos.ts`

Variable:

- `DATABASE_URL_MYSQL_TECNICOS`

Modelos principales:

- `asesor`
- `clientes`
- `trabajadores`
- `servicios_prestados`
- `tipo_de_servicios`
- `especializacion`
- `estatus`
- `metodos_de_pago`
- `municipios`
- `barrios`
- `departamentos`
- `control_calidad`
- `marcas`
- `registros_llamada`
- `servicios_marcas`
- `users`
- `historial_de_cambios`

Uso:

- Consulta clientes y servicios del sistema legacy de tecnicos.
- Mapea campos como `dia_visita` a `fecha_visita` para compatibilidad UI.

## Modelos principales PostgreSQL

### Tenant

Representa un sistema/empresa raiz dentro de la plataforma.

Campos clave:

- `id`
- `nombre`
- `correo`
- `nit`
- `numero`
- `pagina`
- `createdAt`
- `updatedAt`

Relaciones:

- Usuarios, clientes, servicios, ordenes, citas, contabilidad, insumos, permisos, auditoria y configuraciones.

Importancia:

- Es el eje multi-tenant del sistema.

### Empresa

Representa empresas o unidades internas dentro de un tenant.

Campos:

- `id`
- `nombre`
- `tenantId`
- `estado`
- `createdAt`

Relaciones:

- Clientes.
- Usuarios.
- Servicios.
- Tipos de servicio.
- Metodos/estados segun modulo.
- Citas y terapias.

### Usuario

Representa usuarios del sistema.

Campos clave:

- `id`
- `tenantId`
- `username`
- `email`
- `password`
- `activo`
- `aprobado`
- `nombre`
- `apellido`
- `telefono`
- `tipoDocumento`
- `numeroDocumento`
- `rol`
- `empresaId`
- `pushToken`
- `placa`
- `moto`
- `codigoReferido`

Relaciones:

- Tenant.
- Empresa.
- Ordenes creadas/asignadas.
- Citas creadas/asignadas como psicologo.
- Cuentas de pago.
- Nominas.
- Turnos.
- Anticipos.
- Permisos.
- Auditoria.
- Solicitudes de insumos.
- Referidos.

Notas:

- `username`, `email` y `numeroDocumento` tienen restricciones unicas.
- `rol` puede ser `null` hasta aprobacion/configuracion.
- `aprobado = false` bloquea `verifyToken`.

### Cliente

Representa cliente/paciente.

Campos:

- `id`
- `tenantId`
- `nombre`
- `apellido`
- `telefono`
- `telefono2`
- `correo`
- `tipoDocumento`
- `numeroDocumento`
- `empresaId`
- `creadoPorId`
- `deletedAt`
- `documentoPath`
- `registroDocumento`

Relaciones:

- Tenant.
- Empresa.
- Usuario creador.
- Direcciones.
- Vehiculos.
- Ordenes de servicio.
- Citas.
- Paquetes adquiridos.

Notas:

- `deletedAt` permite borrado logico.

### Direccion

Representa sedes/direcciones de un cliente.

Campos:

- `id`
- `tenantId`
- `clienteId`
- `direccion`
- `piso`
- `bloque`
- `unidad`
- `barrio`
- `municipio`
- `linkMaps`
- `createdAt`

Relaciones:

- Cliente.
- Tenant.
- Ordenes.

### Vehiculo

Representa vehiculos asociados a un cliente cuando el servicio se realiza sobre un vehiculo.

Campos:

- `id`
- `tenantId`
- `clienteId`
- `placa`
- `marca`
- `modelo`
- `color`
- `tipo`

Relaciones:

- Cliente.
- Tenant.
- Ordenes de servicio.

### Servicio

Catalogo de servicios.

Campos:

- `id`
- `tenantId`
- `nombre`
- `activo`
- `empresaId`
- `deleteAt`

Relaciones:

- Ordenes.
- Citas.
- Empresa.
- Tenant.

### TipoServicio

Clasifica una orden o cita: por ejemplo servicio nuevo, refuerzo u otros tipos.

Campos:

- `id`
- `tenantId`
- `nombre`
- `activo`
- `empresaId`
- `createdAt`

Relaciones:

- Ordenes.
- Empresa.
- Tenant.

Nota:

- El codigo usa `tipoServicioId = 3` como refuerzo en varios flujos.

### OrdenServicio

Modelo central de operacion de servicios.

Campos funcionales:

- `id`
- `tenantId`
- `clienteId`
- `servicioId`
- `tipoServicioId`
- `creadoPorId`
- `tecnicoId`
- `direccionId`
- `vehiculoId`
- `empresaId`
- `zonaId`
- `estadoServicioId`
- `direccionTexto`
- `barrio`
- `municipio`
- `departamento`
- `fechaVisita`
- `horaInicio`
- `horaFin`
- `observacion`
- `observacionFinal`
- `nivelInfestacion`
- `condicionesHigiene`
- `condicionesLocal`
- `valorCotizado`
- `valorPagado`
- `valorRepuestos`
- `valorRepuestosTecnico`
- `metodoPagoId`
- `numeroOrden`
- `facturaPath`
- `facturaElectronica`
- `comprobantePago`
- `evidenciaPath`
- `linkMaps`
- `ordenPadreId`
- `seguimientoRevisado`
- `estadoPago`

Relaciones:

- Cliente.
- Servicio.
- TipoServicio.
- Usuario creador.
- Usuario tecnico.
- Direccion.
- Vehiculo.
- Empresa.
- Zona.
- EstadoServicio.
- MetodoPago.
- Geolocalizaciones.
- NominaDetalle.
- DeclaracionEfectivo.
- ConsignacionOrden.

Importancia:

- Soporta ciclo de vida completo: creacion, agenda, asignacion, llegada, finalizacion, evidencias, pago, refuerzo, seguimiento, nomina y recaudo.

### Geolocalizacion

Registra ubicacion y fotos de llegada/salida de servicios.

Campos:

- `tenantId`
- `usuarioId`
- `ordenId`
- `latitud`
- `longitud`
- `llegada`
- `salida`
- `fotoLlegada`
- `fotoSalida`
- `linkMaps`

Relaciones:

- Orden.
- Usuario.
- Tenant.

### EstadoServicio

Catalogo de estados de ordenes por tenant/empresa.

Campos:

- `id`
- `tenantId`
- `empresaId`
- `nombre`
- `activo`

Uso:

- Reportes y flujos dependen de nombres como `Liquidado`, `Finalizado`, `En Proceso`, `Cancelado`, `No Concretado`.

### MetodoPago

Catalogo de formas de pago.

Campos:

- `id`
- `tenantId`
- `empresaId`
- `nombre`
- `activo`

Uso:

- Ordenes.
- Reportes.
- Citas.
- Cuenta por cobrar.

### Zona

Catalogo de zonas locativas o zonas operativas.

Campos:

- `id`
- `tenantId`
- `nombre`
- `estado`
- `deletedAt`

### PicoPlaca

Reglas por dia para restriccion de placa.

Campos:

- `tenantId`
- `dia`
- `n1`
- `n2`

Relacionado con:

- `Usuario.placa`
- `Usuario.moto`

## Modelos de contabilidad

### ConfiguracionPagos

Define configuracion de pago/nomina para usuarios.

Uso:

- Calculo de nomina.
- Modalidad por porcentaje o salario fijo.

### Nomina

Agrupa pagos a tecnicos/usuarios.

Campos clave:

- `tenantId`
- `usuarioId`
- `fechaGeneracion`
- `totalPagar`
- `estado`

Estado:

- `BORRADOR`
- `PAGADO`
- `ANULADO`

### NominaDetalle

Detalle de servicios/citas pagados dentro de una nomina.

Relaciones:

- `Nomina`
- `OrdenServicio`
- `CitasPsicologos`

### Anticipos

Registra anticipos monetarios.

Relaciones:

- Tenant.
- Usuario.
- Consignacion opcional.

### CuentasPago

Datos bancarios y valor por hora del usuario.

Uso:

- Perfil.
- Turnos.
- Cuentas de cobro.

### Turno

Registro de jornada/honorarios.

Campos:

- `tenantId`
- `usuarioId`
- `fecha`
- `horaEntrada`
- `horaSalida`
- `tiempoDescanso`
- `valorTotal`
- `fotoEntrada`
- `fotoSalida`
- `cuentaCobroId`

### CuentaCobro

Agrupa turnos para cobro.

Estado:

- `PAGADA`
- `PENDIENTE`
- `RECHAZADA`
- `GENERADA`

### Egresos

Registra salidas generales de dinero.

Campos:

- `tenantId`
- `userId`
- `titulo`
- `monto`
- `razon`
- `created_at`

### DeclaracionEfectivo

Registra efectivo declarado por tecnico para una orden.

Campos:

- `ordenId`
- `tecnicoId`
- `valorDeclarado`
- `evidenciaPath`
- `consignado`

### ConsignacionEfectivo

Registra consignaciones o transferencias conciliadas.

Campos:

- `tenantId`
- `tecnicoId`
- `fechaConsignacion`
- `valorConsignado`
- `referenciaBanco`
- `comprobantePath`
- `estado`
- `diferencia`
- `observacion`
- `creadoPorId`

Estado:

- `PENDIENTE`
- `VALIDADA`
- `OBSERVADA`

### ConsignacionOrden

Tabla puente entre consignacion y orden.

Restriccion:

- `ordenId` es unico, una orden se enlaza a una sola consignacion.

## Modelos de citas/psicologia

### CitasPsicologos

Representa cita o sesion.

Campos importantes:

- `tenantId`
- `empresaId`
- `pacienteId`
- `servicioId`
- `creadoPorId`
- `psicologoId`
- `tipoServicio`
- `fechaCita`
- `horaInicio`
- `horaFin`
- `valor`
- `observacion`
- `metodoPago`
- `paqueteId`
- `consultorioId`
- `realizada`
- campos de pago/evidencia segun schema

Relaciones:

- Cliente.
- Usuario creador.
- Usuario psicologo.
- Servicio.
- Empresa.
- PaqueteAdquirido.
- Consultorio.

### consultorios

Catalogo de consultorios.

Campos:

- `id`
- `tenantId`
- `empresaId`
- `nombre`

Uso:

- Programacion de citas.
- Validacion de solapamientos.

### TerapiasPsicologos

Catalogo de terapias/servicios para citas.

Campos:

- `tenantId`
- `empresaId`
- `nombre`
- `descripcion`
- `categoria`
- `cantidadSesiones`
- `precioBase`
- `activo`

### PaqueteAdquirido

Paquete comprado por cliente o psicologo.

Campos:

- `tenantId`
- `clienteId`
- `usuarioId`
- `catalogoId`
- `sesionesTotales`
- `sesionesConsumidas`
- `saldoRestante`
- `fechaCompra`
- `fechaVencimiento`
- `precioPagado`
- `estado`

Estado:

- `ACTIVO`
- `FINALIZADO`
- `CANCELADO`
- `VENCIDO`

## Modelos de monitoreo y auditoria

### Auditoria

Registra cambios funcionales.

Campos:

- `tenantId`
- `usuarioId`
- `accion`
- `entidad`
- `entidadId`
- `detalles`
- `metadata`
- `createdAt`

### SesionActividad

Registra sesiones de actividad de usuarios.

Campos:

- `usuarioId`
- `fechaInicio`
- `fechaFin`
- `duracionMin`
- `tiempoInactivo`
- `dispositivo`
- `ip`

### LogEvento

Eventos dentro de una sesion.

Campos:

- `sesionId`
- `tipo`
- `descripcion`
- `ruta`
- `createdAt`

Tipos usados:

- `INACTIVIDAD_DETECTADA`
- `INACTIVIDAD_INICIO`
- `INACTIVIDAD_FIN`
- `FOCO_PERDIDO`
- `FOCO_RECUPERADO`
- Otros definidos por cliente.

## Modelos de insumos

### ProductosFumigacion

Inventario de productos/insumos.

Campos:

- `tenantId`
- `categoria`
- `nombre`
- `descripcion`
- `unidadMedida`
- `precio`
- `Moneda`
- `stockActual`
- `stockMinimo`
- `tiempoReposicion`
- `provedorId`
- `activo`

### ProductosFumigacionSolicitados

Solicitudes de insumos hechas por usuarios.

Campos:

- `tenantId`
- `userId`
- `productoId`
- `cantidad`
- `unidadMedida`
- `estado`

Estado:

- `PENDIENTE`
- `RECHAZADA`
- `ACEPTADA`

### Proveedores

Catalogo de proveedores.

Campos:

- `tenantId`
- `nombre`
- `nit`
- `pais`
- `ciudad`
- `direccion`
- `telefono`
- `email`
- `activo`
- `Departamento`

## Modelos de permisos y referidos

### Permiso

Solicitud temporal de autorizacion.

Campos:

- `tenantId`
- `usuarioId`
- `adminId`
- `tipo`
- `entidadId`
- `estado`
- `fechaSolicitud`
- `fechaAprobacion`
- `fechaExpiracion`
- `motivo`

Tipos:

- `EDITAR_VALOR_COTIZADO`
- `EDITAR_TIPO_SERVICIO`
- `DESCARGAR_EXCEL`

Estados:

- `PENDIENTE`
- `APROBADO`
- `RECHAZADO`
- `EXPIRADO`

### Referidos

Registra personas referidas por un usuario.

Campos:

- `nombre`
- `apellido`
- `telefono`
- `referidoPorId`
- `codigo`
- `created_at`

Relacion:

- `Usuario` mediante `referidoPorId`.

## Enums principales

### Rol

- `SU_ADMIN`
- `ADMIN`
- `ASESOR`
- `TECNICO`

### TipoPago

- `PORCENTAJE`
- `SALARIO_FIJO`

### EstadoNomina

- `BORRADOR`
- `PAGADO`
- `ANULADO`

### EstadoPaquete

- `ACTIVO`
- `FINALIZADO`
- `CANCELADO`
- `VENCIDO`

### EstadoCuentaCobro

- `PAGADA`
- `PENDIENTE`
- `RECHAZADA`
- `GENERADA`

### EstadoSolicitudProductos

- `PENDIENTE`
- `RECHAZADA`
- `ACEPTADA`

### TipoPermiso

- `EDITAR_VALOR_COTIZADO`
- `EDITAR_TIPO_SERVICIO`
- `DESCARGAR_EXCEL`

### EstadoPermiso

- `PENDIENTE`
- `APROBADO`
- `RECHAZADO`
- `EXPIRADO`

### EstadoPagoOrden

- `PENDIENTE`
- `EFECTIVO_DECLARADO`
- `CONSIGNADO`
- `CONCILIADO`

### EstadoConsignacion

- `PENDIENTE`
- `VALIDADA`
- `OBSERVADA`

## Reglas de integridad importantes

- `Usuario.username` es unico.
- `Usuario.email` es unico.
- `Usuario.numeroDocumento` es unico opcional.
- `OrdenServicio.estadoServicioId` es requerido.
- `DeclaracionEfectivo.ordenId` es unico.
- `ConsignacionOrden.ordenId` es unico.
- Varios modelos tienen `tenantId` obligatorio; otros legacy/recientes lo tienen opcional.
- Muchas relaciones usan `onDelete: NoAction`, por eso se prefiere borrado logico o validacion antes de eliminar.

## Datos sensibles para no cambiar sin revisar codigo

- `tenantId = 1`, `2`, `4` tienen comportamientos especiales.
- `tipoServicioId = 3` se usa como refuerzo.
- `estadoServicioId = 64` se usa al finalizar servicios desde app tecnica.
- Nombres de estados y metodos de pago se comparan por texto en reportes.
- Buckets de Supabase estan escritos en codigo.
- Los schemas legacy tienen nombres de columnas en mayusculas/minusculas mixtas y no deben renombrarse desde la app.

## Generacion Prisma

Comandos:

```bash
npx prisma generate
npm run generate:mysql
npm run generate:tecnicos
```

Los clientes generados quedan en:

- `prisma/generated/prisma`
- `prisma/generated/prisma-mysql`
- `prisma/generated/prisma-tecnicos`

No se deben editar manualmente.

## Pull de bases legacy

Scripts:

```bash
npm run db:pull:mysql
npm run db:pull:tecnicos
```

Uso:

- Actualizar schemas Prisma desde bases MySQL.

Precaucion:

- Un `db pull` puede modificar muchos nombres/relaciones. Revisar diffs antes de generar clientes o subir cambios.
