# Modulos funcionales

## Vision general

El dashboard esta organizado por modulos en `app/(protected)/dashboard`. La navegacion visible se define en `components/dashboard/sidebar.tsx` y cambia segun rol y tenant.

## Pantallas publicas

### Inicio

Ruta:

- `/`

Archivo:

- `app/page.tsx`

Funcion:

- Punto de entrada publico. Redirige o presenta acceso inicial segun implementacion de la pantalla.

### Login

Ruta:

- `/sign-in`

Archivos:

- `app/(auth)/sign-in/page.tsx`
- `app/api/sign-in/route.ts`

Funcion:

- Permite iniciar sesion con `username` y `password`.
- Consume `/api/sign-in`.
- Al autenticar, recibe token JWT y datos basicos del usuario.

Depende de:

- `Usuario`
- `Tenant`
- `bcrypt`
- `signToken`

### Registro de usuarios

Ruta:

- `/sign-up`

Archivos:

- `app/(auth)/sign-up/page.tsx`
- `app/api/sign-up/route.ts`

Funcion:

- Crea usuarios nuevos con estado `aprobado = false`.
- Valida duplicados por `username`, `email` y `numeroDocumento`.
- Asigna `tenantId = 1` por defecto.

Depende de:

- `Usuario`
- `bcrypt.hash`

### Verificacion pendiente

Ruta:

- `/verificacion`

Archivo:

- `app/(pending)/verificacion/page.tsx`

Funcion:

- Pantalla para usuarios registrados pero no aprobados.

### Registro publico de referidos

Ruta:

- `/registro-referidos`

Archivos:

- `app/registro-referidos/page.tsx`
- `app/api/referidos/validate/route.ts`
- `app/api/referidos/register/route.ts`

Funcion:

- Permite validar un codigo de referido.
- Permite registrar un referido con nombre, apellido, telefono y codigo.
- Crea registros en `Referidos` asociados al usuario dueño del codigo.

Depende de:

- `Usuario.codigoReferido`
- `Referidos`

## Layout protegido

Ruta base:

- `/dashboard`

Archivos:

- `app/(protected)/dashboard/layout.tsx`
- `components/dashboard/dashboard-layout-client.tsx`
- `components/dashboard/sidebar.tsx`
- `components/dashboard/header.tsx`
- `components/dashboard/realtime-notifications.tsx`

Funcion:

- Envuelve todas las paginas protegidas.
- Renderiza sidebar, header, toasts y notificaciones realtime.
- Lee rol y tenant desde `useUserRole`.
- Escucha eventos Supabase para llegada, finalizacion y solicitudes de insumos.

Depende de:

- JWT guardado en `localStorage`.
- Supabase Realtime.
- `useUserRole`.

## Dashboard principal

Ruta:

- `/dashboard`

Archivos:

- `app/(protected)/dashboard/page.tsx`
- `app/(protected)/dashboard/actions.ts`

Funciones principales:

- `getDashboardStats`
- `getAllTenants`
- `switchUserTenant`
- `getUnpaidServicesDetails`

Que muestra:

- Servicios agendados hoy.
- Servicios realizados hoy.
- Servicios en proceso.
- Totales historicos.
- Ingresos de hoy y totales.
- Cuentas por cobrar.
- Top de servicios.
- Cancelaciones y tasa de cancelacion.
- Servicios finalizados pendientes.

Como funciona:

- Valida token con `verifyToken`.
- Consulta el usuario para obtener `tenantId` y `rol`.
- Si el usuario es `SU_ADMIN`, usa datos globales.
- En otros roles filtra por `tenantId`.
- Agrega datos con `count`, `aggregate` y `groupBy` de Prisma.

Depende de:

- `OrdenServicio`
- `Servicio`
- `EstadoServicio`
- `MetodoPago`
- `Tenant`
- `Usuario`

## Gestion de clientes

Rutas:

- `/dashboard/clientes`
- `/dashboard/clientes/nuevo`
- `/dashboard/clientes/[id]/editar`
- `/dashboard/clientes/referidos`

Archivos:

- `app/(protected)/dashboard/clientes/page.tsx`
- `app/(protected)/dashboard/clientes/actions.ts`
- `app/(protected)/dashboard/clientes/nuevo/page.tsx`
- `app/(protected)/dashboard/clientes/nuevo/actions.ts`
- `app/(protected)/dashboard/clientes/[id]/editar/page.tsx`
- `app/(protected)/dashboard/clientes/referidos/page.tsx`
- `app/(protected)/dashboard/clientes/referidos/actions.ts`

Funciones principales:

- Listar clientes con filtros y paginacion.
- Crear clientes.
- Editar clientes.
- Eliminar clientes por borrado logico (`deletedAt`) segun action.
- Consultar estadisticas de clientes.
- Consultar servicios de un cliente.
- Exportar clientes.
- Migrar clientes desde bases legacy.
- Consultar referidos.

Como funciona:

- Valida JWT.
- Usa `tenantId` del usuario salvo casos globales.
- Busca por nombre, apellido, telefono, documento, direcciones, barrios y municipios.
- Incluye direcciones y vehiculos cuando corresponde.
- Registra cambios importantes en `Auditoria`.

Depende de:

- `Cliente`
- `Direccion`
- `Vehiculo`
- `OrdenServicio`
- `Empresa`
- `Referidos`
- `mysql` y `tecnicos` para migraciones/consultas legacy.

## Gestion de servicios

Rutas:

- `/dashboard/servicios`
- `/dashboard/servicios/nuevo`
- `/dashboard/servicios/[id]/editar`
- `/dashboard/servicios/programacion`
- `/dashboard/servicios/seguimiento`

Archivos:

- `app/(protected)/dashboard/servicios/page.tsx`
- `app/(protected)/dashboard/servicios/actions.ts`
- `app/(protected)/dashboard/servicios/nuevo/page.tsx`
- `app/(protected)/dashboard/servicios/[id]/editar/page.tsx`
- `app/(protected)/dashboard/servicios/programacion/page.tsx`
- `app/(protected)/dashboard/servicios/programacion/actions.ts`
- `app/(protected)/dashboard/servicios/seguimiento/page.tsx`
- `app/(protected)/dashboard/servicios/seguimiento/actions.ts`

Funciones principales:

- `getOrdenesServicio`
- `getOrdenServicio`
- `createOrdenServicio`
- `updateOrdenServicio`
- `deleteOrdenServicio`
- `getOrdenesStats`
- `getFilterData`
- `getFormData`
- `addDireccionToCliente`
- `addVehiculoToCliente`
- `sendServiceToTechnician`
- `searchClientes`
- `getAllOrdenesServicioForExport`
- `uploadFacturaElectronica`
- `uploadComprobantePago`
- `uploadEvidence`
- `registrarRefuerzo`
- `liquidarOrdenTransferencia`

Que es:

- Es el nucleo operativo de ordenes de servicio.

Como funciona:

- Una orden se crea con cliente, servicio, tipo de servicio, estado, empresa, tecnico opcional, direccion o vehiculo, fecha, hora, valores, metodo de pago y observaciones.
- La fecha/hora se transforma con zona `America/Bogota`.
- Si se asigna tecnico, se envia notificacion push.
- Se registra auditoria en creacion y actualizacion.
- Se invalida cache Redis de estadisticas si Redis esta disponible.
- Para `tenantId = 1`, si el servicio no es refuerzo (`tipoServicioId !== 3`), se crean seguimientos automaticos:
  - Primer refuerzo a 7 o 14 dias segun `servicioId`.
  - Seguimiento a 3 meses.
- Las evidencias y comprobantes se suben a Supabase Storage.
- La liquidacion de transferencia crea una `ConsignacionEfectivo`, enlaza la orden con `ConsignacionOrden`, cambia `estadoPago` a `CONCILIADO` y actualiza `valorPagado`.

Depende de:

- `OrdenServicio`
- `Cliente`
- `Direccion`
- `Vehiculo`
- `Servicio`
- `TipoServicio`
- `EstadoServicio`
- `MetodoPago`
- `Zona`
- `Empresa`
- `Geolocalizacion`
- `ConsignacionEfectivo`
- `ConsignacionOrden`
- `Auditoria`
- Supabase Storage
- Expo Push
- Redis opcional

## Programacion de servicios

Ruta:

- `/dashboard/servicios/programacion`

Funcion:

- Muestra ordenes por rango de fechas y tecnico opcional.
- Normaliza nombres de estados a estados visuales como `PROGRAMADO`, `EN_PROCESO`, `SERVICIO_LISTO` o `CANCELADO`.

Depende de:

- `OrdenServicio`
- `Cliente`
- `Usuario` tecnico
- `Servicio`
- `TipoServicio`
- `Empresa`
- `Zona`
- `EstadoServicio`

## Seguimiento de servicios

Ruta:

- `/dashboard/servicios/seguimiento`

Funciones:

- `getSugerenciasRefuerzo`
- `getSeguimientoTrimestral`
- `rechazarSeguimiento`
- `registrarRefuerzo`

Como funciona:

- Sugiere refuerzos para servicios que cumplieron 14 dias.
- Para servicios especiales como `C: CONTROL DE CHINCHES` o servicio `3`, usa ventana de 7 dias.
- Sugiere seguimiento trimestral con base en servicios de hace 3 meses.
- Evita sugerir si ya hay un refuerzo posterior para el cliente.
- Permite marcar seguimiento como revisado/rechazado.
- Permite crear una nueva orden tipo refuerzo con `tipoServicioId = 3`.

Depende de:

- `OrdenServicio`
- `TipoServicio`
- `EstadoServicio`
- `Cliente`
- `Servicio`

## Gestion de citas

Rutas:

- `/dashboard/citas`
- `/dashboard/citas/nuevo`
- `/dashboard/citas/[id]/editar`
- `/dashboard/citas/programacion`
- `/dashboard/citas/servicios-paquetes`

Archivos:

- `app/(protected)/dashboard/citas/page.tsx`
- `app/(protected)/dashboard/citas/actions.ts`
- `app/(protected)/dashboard/citas/nuevo/page.tsx`
- `app/(protected)/dashboard/citas/[id]/editar/page.tsx`
- `app/(protected)/dashboard/citas/programacion/actions.ts`
- `app/(protected)/dashboard/citas/servicios-paquetes/actions.ts`

Funciones principales:

- Listar, crear, editar y eliminar citas.
- Ver estadisticas de citas.
- Cargar opciones de formulario.
- Consultar disponibilidad de consultorio.
- Marcar cita como realizada/cancelada.
- Actualizar o alternar pago.
- Subir comprobante de pago.
- Gestionar terapias/servicios psicologicos.
- Gestionar paquetes adquiridos.

Como funciona:

- Crea `CitasPsicologos` con paciente, psicologo, servicio, terapia o paquete, consultorio, fecha/hora, valor y metodo de pago.
- Usa zona horaria `America/Bogota`.
- Valida solapamiento de consultorio con reglas de intervalo:
  - nueva hora inicio menor que hora fin existente
  - nueva hora fin mayor que hora inicio existente
- Si se crea cita desde terapia y no hay paquete, crea un `PaqueteAdquirido`.
- Si se agenda desde paquete existente, consume una sesion.
- Al actualizar una cita puede crear un paquete nuevo y devolver saldo al paquete anterior o eliminarlo si queda sin citas.
- Registra auditoria.

Depende de:

- `CitasPsicologos`
- `Cliente`
- `Usuario` psicologo
- `Servicio`
- `Empresa`
- `consultorios`
- `TerapiasPsicologos`
- `PaqueteAdquirido`
- `MetodoPago`
- `Auditoria`

## Servicios y paquetes de citas

Ruta:

- `/dashboard/citas/servicios-paquetes`

Funciones:

- `getManagementOptions`
- `getTerapiasPsicologos`
- `createTerapiaPsicologos`
- `updateTerapiaPsicologos`
- `toggleTerapiaPsicologosActivo`
- `getPaquetesAdquiridos`
- `createPaqueteAdquirido`
- `updatePaqueteAdquirido`
- `cancelPaqueteAdquirido`

Como funciona:

- Administra catalogo de terapias/servicios.
- Administra paquetes comprados por cliente o psicologo.
- Valida sesiones totales, sesiones consumidas, saldo restante, precio pagado, vencimiento y estado.
- Limita escritura por tenant, salvo usuarios con capacidad global.
- Audita creaciones, actualizaciones, activaciones/desactivaciones y paquetes.

Depende de:

- `TerapiasPsicologos`
- `PaqueteAdquirido`
- `Cliente`
- `Usuario`
- `Tenant`
- `Empresa`

## Equipo de trabajo y usuarios

Rutas:

- `/dashboard/usuarios/ranking`
- `/dashboard/usuarios/asesores`
- `/dashboard/usuarios/asesores/[id]/editar`
- `/dashboard/usuarios/tecnicos`
- `/dashboard/usuarios/tecnicos/[id]/editar`
- `/dashboard/usuarios/aprobar`
- `/dashboard/usuarios/nuevo`

Archivos:

- `app/(protected)/dashboard/usuarios/actions.ts`
- `app/(protected)/dashboard/usuarios/ranking/actions.ts`
- `app/(protected)/dashboard/usuarios/asesores/actions.ts`
- `app/(protected)/dashboard/usuarios/tecnicos/actions.ts`
- `app/(protected)/dashboard/usuarios/tecnicos/update-actions.ts`
- `app/(protected)/dashboard/usuarios/aprobar/actions.ts`

Funciones:

- Crear usuarios.
- Aprobar/rechazar usuarios pendientes.
- Listar, editar, activar/desactivar y eliminar asesores/tecnicos.
- Consultar ranking de usuarios por actividad/servicios.
- Consultar detalle de usuario para ranking.
- Enviar notificaciones de actualizacion.

Depende de:

- `Usuario`
- `Empresa`
- `OrdenServicio`
- `Auditoria`
- `Rol`
- Expo Push

## Contabilidad

### Recaudo efectivo

Ruta:

- `/dashboard/contabilidad/recaudo`

Funciones:

- `getTechniciansFinancialStatus`
- `getPendingCashOrders`
- `registerConsignation`
- `registerAdvanceFromOrders`
- `uploadConsignationProof`
- `getConsignacionHistory`
- `getDeclaracionHistory`
- `updateConsignacion`
- `updateDeclaracion`

Funcion:

- Gestiona dinero en efectivo declarado por tecnicos.
- Permite revisar ordenes pendientes de consignacion.
- Registra consignaciones, anticipos desde ordenes, comprobantes y diferencias.
- Mantiene historia de consignaciones y declaraciones.

Depende de:

- `OrdenServicio`
- `DeclaracionEfectivo`
- `ConsignacionEfectivo`
- `ConsignacionOrden`
- `Anticipos`
- `Usuario`

### Cuenta de cobro

Ruta:

- `/dashboard/contabilidad/cuenta-cobro`

Funciones:

- `getTurnos`
- `updateTurno`
- `deleteTurno`
- `createCuentaCobroGroup`
- `getCuentasCobro`
- `getCuentaCobroDetails`
- `getCuentaCobroPdfData`
- `sendCuentaCobro`
- `updateCuentaCobroStatus`

Funcion:

- Administra turnos/honorarios por usuario.
- Agrupa turnos en cuentas de cobro.
- Prepara datos para PDF.
- Cambia estados `PAGADA` o `RECHAZADA`.

Depende de:

- `Turno`
- `CuentaCobro`
- `Usuario`
- `CuentasPago`

### Nomina

Rutas:

- `/dashboard/contabilidad/nomina`
- `/dashboard/configuracion/nomina`

Funciones contables:

- `updateValorRepuestosTecnico`
- `getNominas`
- `getServiciosPendientes`
- `getTecnicos`
- `createNomina`
- `getNominaById`
- `updateNominaEstado`

Funciones de configuracion:

- `getUsuariosNomina`
- `saveConfiguracionNomina`

Funcion:

- Calcula pagos a tecnicos segun configuracion.
- Maneja estado de nominas (`BORRADOR`, `PAGADO`, `ANULADO`).
- Permite registrar valor de repuestos asociado al tecnico.

Depende de:

- `Nomina`
- `NominaDetalle`
- `ConfiguracionPagos`
- `OrdenServicio`
- `Usuario`

### Anticipos

Ruta:

- `/dashboard/contabilidad/anticipos`

Funciones:

- `getAnticipos`
- `getTecnicos`
- `createAnticipo`
- `updateAnticipo`
- `deleteAnticipo`

Funcion:

- Registra anticipos monetarios a tecnicos/usuarios.

Depende de:

- `Anticipos`
- `Usuario`
- `ConsignacionEfectivo`

### Egresos

Ruta:

- `/dashboard/contabilidad/egresos`

Funciones:

- `getEgresos`
- `getUsuarios`
- `createEgreso`
- `updateEgreso`
- `deleteEgreso`

Funcion:

- Registra salidas generales de dinero no cubiertas por nomina o anticipos.

Depende de:

- `Egresos`
- `Usuario`
- `Tenant`

### Balances

Ruta:

- `/dashboard/contabilidad/balances`

Funcion:

- Calcula ingresos, egresos y neto por periodo.
- Para tenant 4 calcula ingresos desde citas realizadas y prorratea paquetes por numero de sesiones.
- Para otros tenants calcula ingresos desde ordenes finalizadas/liquidadas.
- Resta nominas pagadas, anticipos y egresos.

Depende de:

- `OrdenServicio`
- `CitasPsicologos`
- `PaqueteAdquirido`
- `Nomina`
- `Anticipos`
- `Egresos`
- `MetodoPago`

## Insumos

Rutas:

- `/dashboard/insumos/stock`
- `/dashboard/insumos/solicitudes`

Archivos:

- `app/(protected)/dashboard/insumos/actions.ts`
- `app/api/productos/route.ts`
- `app/api/productos/[id]/solicitar/route.ts`
- `app/api/my-product-requests/route.ts`

Funciones:

- Listar productos.
- Listar solicitudes.
- Solicitar productos desde app/API.
- Aceptar o rechazar solicitudes.
- Descontar stock al aceptar.
- Notificar al solicitante.
- Notificar realtime al dashboard.

Depende de:

- `ProductosFumigacion`
- `ProductosFumigacionSolicitados`
- `Proveedores`
- `Usuario`
- Supabase Realtime
- Expo Push

## Configuracion

Rutas:

- `/dashboard/configuracion/perfil`
- `/dashboard/mi-codigo`
- `/dashboard/configuracion/permisos`
- `/dashboard/configuracion/empresas`
- `/dashboard/configuracion/nomina`
- `/dashboard/configuracion/servicios`
- `/dashboard/configuracion/pico-placa`
- `/dashboard/configuracion/metodos-pago`
- `/dashboard/configuracion/tipos-servicio`
- `/dashboard/configuracion/localidades`
- `/dashboard/configuracion/zonas`

### Perfil

Permite consultar y actualizar datos personales, contrasena y cuenta de pago del usuario.

Depende de:

- `app/api/profile/route.ts`
- `Usuario`
- `CuentasPago`
- `bcrypt`

### Mi codigo referido

Genera y muestra el codigo de referido del usuario.

Depende de:

- `app/api/profile/referral-code/route.ts`
- `Usuario.codigoReferido`

### Permisos

Administra permisos temporales para acciones sensibles.

Tipos:

- `EDITAR_VALOR_COTIZADO`
- `EDITAR_TIPO_SERVICIO`
- `DESCARGAR_EXCEL`

Estados:

- `PENDIENTE`
- `APROBADO`
- `RECHAZADO`
- `EXPIRADO`

Funcionamiento:

- Un usuario solicita permiso con motivo.
- Se evita duplicar solicitudes pendientes o aprobadas vigentes.
- Se notifica por correo a administradores.
- Admin aprueba/rechaza desde dashboard o enlace por correo.
- Permisos aprobados tienen expiracion.

Depende de:

- `Permiso`
- `Usuario`
- `sendPermissionRequestEmail`
- `app/api/permisos/responder/route.ts`

### Empresas

Gestiona empresas internas del tenant.

Depende de:

- `Empresa`
- `Servicio`
- `Usuario`

### Servicios

Gestiona catalogo de servicios.

Depende de:

- `Servicio`
- `Empresa`

### Tipos de servicio

Gestiona tipos como servicio nuevo, refuerzo u otros tipos definidos por tenant.

Depende de:

- `TipoServicio`
- `Empresa`

### Metodos de pago

Gestiona metodos disponibles para ordenes/citas.

Depende de:

- `MetodoPago`
- `Empresa`

### Pico y placa

Gestiona reglas de restriccion por dia y estado de tecnicos segun placa/moto.

Depende de:

- `PicoPlaca`
- `Usuario.placa`
- `Usuario.moto`

### Localidades

Muestra municipios/localidades desde constante local.

Depende de:

- `lib/constants/municipios.ts`

### Zonas locativas

Gestiona zonas por tenant.

Depende de:

- `Zona`

## Monitoreo

Rutas:

- `/dashboard/monitoreo/auditoria`
- `/dashboard/monitoreo/actividad`

### Auditoria

Permite consultar cambios registrados por `createAuditLog`.

Funciones:

- `getAuditoria`
- `getEntidadesAuditadas`
- `getAuditFilterOptions`
- `getAuditoriaForExport`

Depende de:

- `Auditoria`
- `Usuario`
- Entidades relacionadas usadas como referencias.

### Actividad

Muestra sesiones y eventos de uso.

Funciones:

- `getRecentSessions`
- `getSessionEvents`

Depende de:

- `SesionActividad`
- `LogEvento`
- `Usuario`
- `useActivityMonitor`

## Mensajeria

Ruta:

- `/dashboard/mensajeria`

Funcion:

- Integra Chatwoot para iniciar sesion, ver cuentas, bandejas, conversaciones, mensajes, enviar mensajes y cambiar estado de conversaciones.

Depende de:

- `hooks/use-chatwoot.ts`
- `lib/chatwoot.ts`
- `NEXT_PUBLIC_CHATWOOT_BASE_URL`
- Rewrite `/chatwoot-api/:path*`

## Modulos legacy

### Servilution

Rutas:

- `/dashboard/servilution/clientes`
- `/dashboard/servilution/servicios`

Visible:

- Solo `tenantId === 1`.

Funcion:

- Consulta clientes y servicios desde base MySQL legacy configurada por `DATABASE_URL_MYSQL`.

Depende de:

- `lib/mysql.ts`
- `prisma/schema.mysql.prisma`

### Serv. Tecnico

Rutas:

- `/dashboard/serv-tecnico/clientes`
- `/dashboard/serv-tecnico/servicios`

Visible:

- Solo `tenantId === 2`.

Funcion:

- Consulta clientes y servicios desde base MySQL tecnica configurada por `DATABASE_URL_MYSQL_TECNICOS`.

Depende de:

- `lib/tecnicos.ts`
- `prisma/schema.tecnicos.prisma`

## App tecnica / endpoints de campo

No es un modulo visual del dashboard, pero el backend expone endpoints para tecnicos:

- `/api/my-services`
- `/api/my-services/[id]`
- `/api/my-services/[id]/arrival`
- `/api/my-services/[id]/finalize`
- `/api/my-services/[id]/upload-evidence`
- `/api/productos`
- `/api/productos/[id]/solicitar`
- `/api/my-product-requests`
- `/api/profile/push-token`

Funcion:

- Listar servicios asignados.
- Ver detalle de servicio.
- Registrar llegada con geolocalizacion y foto.
- Finalizar servicio con datos tecnicos, factura, foto de salida, comprobante y valor pagado.
- Cargar evidencia.
- Consultar y solicitar insumos.
- Guardar token push.

Depende de:

- JWT por `Authorization` o `x-auth-token`.
- Supabase Storage.
- Supabase Realtime.
- `OrdenServicio`
- `Geolocalizacion`
- `ProductosFumigacion`
- `ProductosFumigacionSolicitados`

## Componentes UI

Directorio:

- `components/ui`

Contiene primitives reutilizables:

- `button`
- `input`
- `textarea`
- `select`
- `table`
- `dialog`
- `dropdown-menu`
- `popover`
- `tabs`
- `card`
- `badge`
- `checkbox`
- `radio-group`
- `scroll-area`
- `pagination-controls`
- `filter-select`
- `filter-date-range`
- `search`
- `skeleton`
- `alert`
- `sonner`

Depende de:

- Radix UI.
- Tailwind CSS.
- `class-variance-authority`.
- `tailwind-merge`.
- `lucide-react`.

## Hooks

### `useUserRole`

Lee y decodifica JWT desde `localStorage`.

Retorna:

- `userId`
- `role`
- `tenantId`
- `tenantName`
- `username`
- `nombre`
- `apellido`
- `userFullName`
- `loading`

### `useActivityMonitor`

Registra actividad e inactividad de usuario.

Eventos detectados:

- `mousemove`
- `keydown`
- `scroll`
- `click`
- `touchstart`
- `visibilitychange`

Envia logs a:

- `/api/monitor/log`

### `useChatwoot`

Mantiene estado de Chatwoot:

- autenticacion
- cuentas
- bandejas
- conversaciones
- mensajes
- chat seleccionado
- filtro de estado
- polling automatico

Usa:

- `lib/chatwoot.ts`
- `localStorage`
- `sonner`
