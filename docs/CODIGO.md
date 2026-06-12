# Referencia tecnica del codigo

## Proposito

Este documento describe el codigo fuente del proyecto sin modificar archivos ejecutables. Sirve para ubicar rapidamente donde esta cada responsabilidad, que exporta cada modulo importante, como se relacionan las funciones y que dependencias usan.

La documentacion esta organizada por directorios:

- `app/`: rutas, paginas, API routes y server actions.
- `components/`: componentes de interfaz.
- `hooks/`: hooks client-side reutilizables.
- `lib/`: servicios internos, clientes externos y utilidades.
- `prisma/`: schemas y clientes generados.

## Convenciones del codigo

### Alias

El proyecto usa alias `@/*`, configurado en `tsconfig.json`.

Ejemplos:

- `@/lib/prisma`
- `@/lib/auth`
- `@/components/ui/button`
- `@/app/(protected)/dashboard/actions`

### Server actions

Los archivos `actions.ts` bajo `app/(protected)/dashboard/**` usan `"use server"` y exponen funciones asincronas. En general:

1. Reciben un `token`.
2. Validan con `verifyToken`.
3. Buscan el usuario en base.
4. Aplican filtros por `tenantId`.
5. Ejecutan consultas/mutaciones con Prisma.
6. Devuelven objetos serializables.
7. En mutaciones, suelen llamar `revalidatePath`.
8. En cambios sensibles, llaman `createAuditLog`.

### API routes

Los archivos `app/api/**/route.ts` exportan metodos HTTP:

- `GET`
- `POST`
- `PUT`

Usan `NextResponse` y reciben `Request` o `NextRequest`.

### Client components

Los componentes con `"use client"` usan estado, hooks, eventos, `localStorage`, formularios o APIs browser.

### Serializacion

Prisma devuelve `Decimal`, `BigInt` y `Date`. El codigo convierte esos valores antes de enviarlos a componentes o JSON mediante helpers locales.

## Codigo en `lib/`

### `lib/auth.ts`

Responsabilidad:

- Firmar y verificar JWT.
- Definir el payload de sesion.
- Validar roles simples.

Exports:

- `TokenPayload`: shape del JWT.
- `signToken(payload)`: crea token con expiracion de 1 dia.
- `verifyToken(token)`: valida token y rechaza si `aprobado` es falso.
- `hasRole(userRole, allowedRoles)`: comprueba si un rol esta permitido.

Dependencias:

- `jsonwebtoken`
- enum `Rol` generado por Prisma.
- variable `JWT_SECRET`.

Notas:

- Si `JWT_SECRET` no existe, usa `default-secret`.
- Cambiar el payload afecta `useUserRole`, login y validaciones.

### `lib/prisma.ts`

Responsabilidad:

- Crear cliente Prisma principal para PostgreSQL.

Export:

- `default prisma`

Dependencias:

- `PrismaClient` generado en `prisma/generated/prisma/client`.
- `PrismaPg`.
- `pg.Pool`.
- Variables `POSTGRES_PRISMA_URL`, `DATABASE_URL`, `DB_CA_CERT`, `DB_SSL`.

Notas:

- Usa singleton global en desarrollo.
- Remueve `sslmode` del connection string.
- Pool principal usa maximo 10 conexiones.

### `lib/prisma-fresh.ts`

Responsabilidad:

- Crear un PrismaClient nuevo sin singleton global.

Export:

- `default prisma`

Uso esperado:

- Casos donde se necesita evitar una instancia global stale.

### `lib/mysql.ts`

Responsabilidad:

- Crear pool MySQL legacy para Servilution.
- Ejecutar SQL manual tipado.
- Exponer helpers compatibles con vistas actuales.

Exports:

- `query<T>(sql, params?)`
- `default mysql`

Objeto `mysql`:

- `mysql.query`
- `mysql.clientes.findMany`
- `mysql.clientes.getFilterOptions`
- `mysql.servicios_prestados.findMany`
- `mysql.servicios_prestados.getFilterOptions`

Dependencias:

- `mysql2/promise`
- `DATABASE_URL_MYSQL`
- tipos generados en `prisma/generated/prisma-mysql/client`.

Notas:

- Construye SQL con joins contra tablas legacy.
- Normaliza relaciones como cliente, servicio, empresa, tecnico, municipio, barrio, metodo de pago y estado.
- Convierte decimales a `number | null` cuando prepara datos.

### `lib/tecnicos.ts`

Responsabilidad:

- Crear pool MySQL para base legacy de tecnicos.
- Ejecutar consultas y mapear datos a estructura compatible.

Exports:

- `query<T>(sql, params?)`
- `default tecnicos`

Objeto `tecnicos`:

- `tecnicos.query`
- `tecnicos.clientes.findMany`
- `tecnicos.clientes.getFilterOptions`
- `tecnicos.servicios_prestados.findMany`
- `tecnicos.servicios_prestados.getFilterOptions`

Dependencias:

- `mysql2/promise`
- `DATABASE_URL_MYSQL_TECNICOS`
- tipos generados en `prisma/generated/prisma-tecnicos/client`.

Notas:

- Mapea campos legacy como `dia_visita`, `id_servicio_prestado`, `id_trabajador`.
- Convierte valores para que las vistas de servicio tecnico funcionen parecido a Servilution.

### `lib/audit.ts`

Responsabilidad:

- Registrar auditoria de cambios.

Export:

- `createAuditLog(params)`

Parametros:

- `tenantId`
- `usuarioId`
- `accion`
- `entidad`
- `entidadId`
- `detalles`
- `metadata`
- `tx` opcional

Dependencias:

- `prisma.auditoria`
- `Prisma.TransactionClient`

Notas:

- Si falla la auditoria, registra error pero no rompe la accion principal.
- Puede ejecutarse dentro de transacciones.

### `lib/notifications.ts`

Responsabilidad:

- Enviar push notifications por Expo.

Export:

- `sendPushNotification(tecnicoId, title, body, data?)`

Dependencias:

- `expo-server-sdk`
- `prisma.usuario`

Funcionamiento:

- Busca `pushToken` del tecnico.
- Valida token Expo.
- Crea mensaje.
- Envia por chunks.

### `lib/mail.ts`

Responsabilidad:

- Enviar correos de solicitud de permisos.

Export:

- `sendPermissionRequestEmail(toEmail, permisoId, solicitanteName, tipoPermiso, motivo)`

Dependencias:

- `nodemailer`
- `jsonwebtoken`
- `JWT_SECRET`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `NEXT_PUBLIC_APP_URL`

Funcionamiento:

- Genera token de aprobacion y rechazo.
- Construye enlaces a `/api/permisos/responder`.
- Envia HTML con botones de aceptar/rechazar.

### `lib/redis.ts`

Responsabilidad:

- Configurar Redis opcional.

Exports:

- `redis`
- `isRedisConfigured`

Dependencias:

- `ioredis`
- `REDIS_URL`

Notas:

- Si no existe `REDIS_URL`, `redis` es `null`.
- Usa `lazyConnect`.
- Reutiliza instancia global en desarrollo.

### `lib/chatwoot.ts`

Responsabilidad:

- Cliente de API Chatwoot mediante proxy interno.

Export:

- `chatwootService`

Metodos:

- `signIn(email, password)`
- `getProfile(auth)`
- `getInboxes(accountId, auth)`
- `getConversations(accountId, auth, inboxId, status)`
- `getMessages(accountId, auth, conversationId)`
- `sendMessage(accountId, auth, conversationId, content)`
- `toggleStatus(accountId, auth, conversationId, status)`

Dependencias:

- Tipos en `lib/chatwoot-types.ts`.
- Rewrite `/chatwoot-api`.

### `lib/chatwoot-types.ts`

Responsabilidad:

- Definir interfaces para Chatwoot.

Exports:

- `AuthHeaders`
- `Account`
- `Conversation`
- `Message`
- `Inbox`
- `CustomView`
- `LoginResponse`

### `lib/utils.ts`

Responsabilidad:

- Utilidades generales.

Exports:

- `cn(...inputs)`: combina clases con `clsx` y `tailwind-merge`.
- `serializeData(obj)`: serializa estructuras con tipos especiales.

### `lib/constants/municipios.ts`

Responsabilidad:

- Constante local de municipios de Antioquia.

Export:

- `municipiosAntioquia`

Uso:

- Pantalla de localidades/configuracion.

## Hooks

### `hooks/use-user-role.ts`

Responsabilidad:

- Leer JWT desde `localStorage`.
- Decodificar datos de usuario para la UI.

Export:

- `useUserRole()`

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

Dependencias:

- `jwt-decode`
- `localStorage`

Riesgo:

- Solo sirve para UI. No reemplaza validacion en servidor.

### `hooks/use-activity-monitor.ts`

Responsabilidad:

- Detectar actividad/inactividad del usuario en navegador.
- Enviar logs a la API.

Export:

- `useActivityMonitor(userId)`

Detecta:

- `mousemove`
- `keydown`
- `scroll`
- `click`
- `touchstart`
- `visibilitychange`

Retorna:

- `isIdle`
- `showReconnected`

API usada:

- `POST /api/monitor/log`

### `hooks/use-chatwoot.ts`

Responsabilidad:

- Manejar estado de integracion Chatwoot.

Exports:

- `ChatStatus`
- `useChatwoot()`

Estado interno:

- `auth`
- `accountId`
- `myAccounts`
- `conversations`
- `messages`
- `inboxes`
- `selectedChat`
- `selectedInbox`
- `conversationStatus`
- `isRefreshing`

Acciones retornadas:

- `handleLogin`
- `handleLogout`
- `sendMessage`
- `fetchMessages`
- `fetchInboxes`
- `toggleChatStatus`

Persistencia local:

- `cw_auth`
- `cw_accounts`
- `cw_account_id`

Polling:

- Conversaciones cada 5 segundos.
- Mensajes cada 3 segundos.

## API routes en `app/api/`

### Autenticacion

#### `app/api/sign-in/route.ts`

Export:

- `POST(request)`

Hace:

- Lee `username` y `password`.
- Busca usuario por `username`.
- Verifica `activo`.
- Compara password con bcrypt.
- Verifica que tenga `rol`.
- Firma JWT.
- Devuelve token y usuario sin password.

Depende de:

- `prisma.usuario`
- `bcrypt`
- `signToken`

#### `app/api/sign-up/route.ts`

Export:

- `POST(request)`

Hace:

- Crea usuario pendiente de aprobacion.
- Valida obligatorios.
- Revisa duplicados.
- Hashea password.
- Asigna `tenantId = 1`.

#### `app/api/sign-out/route.ts`

Export:

- `POST(request)`

Hace:

- Lee token desde cookie o header.
- Cierra sesiones abiertas en `SesionActividad`.
- Elimina cookie `token`.

#### `app/api/auth/validate/route.ts`

Export:

- `GET(req)`

Hace:

- Valida token Bearer.
- Verifica en BD que usuario exista, este aprobado y activo.

### Perfil

#### `app/api/profile/route.ts`

Exports:

- `GET()`
- `PUT(req)`

`GET`:

- Retorna datos de usuario y cuentas de pago.
- Rechaza si no esta aprobado o activo.

`PUT`:

- Actualiza perfil.
- Hashea nueva password si se envia.
- Actualiza o crea `CuentasPago`.
- Maneja errores de unicidad Prisma `P2002`.

#### `app/api/profile/push-token/route.ts`

Export:

- `PUT(request)`

Hace:

- Guarda `pushToken` en `Usuario`.

#### `app/api/profile/referral-code/route.ts`

Export:

- `GET()`

Hace:

- Devuelve codigo de referido existente.
- Si no existe, genera codigo unico de 6 caracteres.

### Referidos

#### `app/api/referidos/validate/route.ts`

Export:

- `POST(req)`

Hace:

- Valida si un codigo corresponde a un usuario.

#### `app/api/referidos/register/route.ts`

Export:

- `POST(req)`

Hace:

- Crea un `Referidos` asociado al usuario dueño del codigo.

### Servicios para app tecnica

#### `app/api/my-services/route.ts`

Export:

- `GET(request)`

Hace:

- Lista ordenes asignadas al tecnico autenticado.
- Filtra por `type=pending` o `type=completed`.
- Pagina por `page` y `limit`.

Estados completados:

- `Finalizado`
- `Liquidado`
- `Completado`
- `Terminado`

#### `app/api/my-services/[id]/route.ts`

Export:

- `GET(request, props)`

Hace:

- Devuelve detalle de una orden por ID.
- Incluye cliente, servicio, estado, tipo, direccion y geolocalizaciones.

#### `app/api/my-services/[id]/arrival/route.ts`

Export:

- `POST(request, props)`

Hace:

- Recibe coordenadas, link Maps y foto.
- Sube foto a bucket `fotoLlegada`.
- Crea `Geolocalizacion`.
- Cambia estado a uno que contenga `Proceso`.
- Emite broadcast `service-arrival`.

#### `app/api/my-services/[id]/finalize/route.ts`

Export:

- `PUT(request, props)`

Hace:

- Recibe datos finales del servicio.
- Valida archivos obligatorios segun metodo de pago.
- Sube factura, comprobante y foto de salida.
- Actualiza `OrdenServicio`.
- Actualiza geolocalizacion abierta con salida.
- Emite broadcast `service-finalized`.

Punto sensible:

- Usa `estadoServicioId: 64` al finalizar.

#### `app/api/my-services/[id]/upload-evidence/route.ts`

Export:

- `POST(request)`

Hace:

- Recibe `serviceId` y arreglo de URLs.
- Evita duplicar evidencia si `evidenciaPath` ya existe.
- Guarda URLs separadas por coma.

### Servicios genericos

#### `app/api/servicios/route.ts`

Export:

- `GET(req)`

Hace:

- Obtiene ordenes relacionadas al usuario autenticado.
- Serializa valores Prisma para JSON.

### Productos e insumos

#### `app/api/productos/route.ts`

Export:

- `GET()`

Hace:

- Lista productos por `tenantId`.
- Retorna datos serializados.

#### `app/api/productos/[id]/solicitar/route.ts`

Export:

- `POST(request, params)`

Hace:

- Crea solicitud de producto.
- Emite broadcast `product-requested`.

#### `app/api/my-product-requests/route.ts`

Export:

- `GET()`

Hace:

- Lista solicitudes de insumos del usuario autenticado.

### Storage

#### `app/api/storage/sign-url/route.ts`

Export:

- `POST(request)`

Hace:

- Crea signed upload URL en Supabase Storage.
- Devuelve `signedUrl`, `path` y `publicUrl`.

### Turnos

#### `app/api/turnos/route.ts`

Export:

- `POST(request)`

Hace:

- Crea turno.
- Calcula horas trabajadas menos descanso.
- Multiplica por `valorHora` de la cuenta de pago.
- Guarda fotos como URLs si se envian.

#### `app/api/turnos/[id]/route.ts`

Export:

- `PUT(request, params)`

Hace:

- Actualiza turno propio.
- Rechaza si pertenece a otro usuario.
- Rechaza si ya tiene `cuentaCobroId`.
- Recalcula valor total.

### Monitor

#### `app/api/monitor/log/route.ts`

Export:

- `POST(request)`

Hace:

- Crea/reutiliza sesion diaria abierta.
- Crea `LogEvento`.
- Incrementa `tiempoInactivo` si tipo es `INACTIVIDAD_DETECTADA`.

#### `app/api/monitor/report/route.ts`

Export:

- `GET(request)`

Hace:

- Requiere `ADMIN` o `SU_ADMIN`.
- Reporta estado online/offline por fecha.

### Permisos por correo

#### `app/api/permisos/responder/route.ts`

Export:

- `GET(req)`

Hace:

- Lee token de query string.
- Verifica accion `APROBADO` o `RECHAZADO`.
- Actualiza `Permiso`.
- Devuelve HTML de resultado.

## Server actions del dashboard

### `app/(protected)/dashboard/actions.ts`

Exports:

- `getDashboardStats(token)`: indicadores de servicios, ingresos, deuda, cancelaciones y top servicios.
- `getAllTenants(token)`: listado simple de tenants.
- `switchUserTenant(token, newTenantId)`: cambia tenant del usuario y devuelve JWT nuevo.
- `getUnpaidServicesDetails(token, type)`: detalle de servicios por cobrar.

Dependencias:

- `prisma`
- `verifyToken`
- `signToken`
- modelos `OrdenServicio`, `Servicio`, `Tenant`, `Usuario`.

### Clientes

#### `app/(protected)/dashboard/clientes/actions.ts`

Exports:

- `getClientes(token, ...)`: lista clientes con filtros.
- `getCliente(token, id)`: detalle de cliente.
- `deleteCliente(token, id)`: elimina o marca cliente segun logica del action.
- `updateCliente(token, id, formData)`: actualiza cliente, direcciones y vehiculos.
- `getClientesStats(token)`: estadisticas por municipios/barrios.
- `getClienteServicios(token, clienteId)`: ordenes del cliente.
- `getAllClientesForExport(token, ...)`: exportacion de clientes.

Dependencias:

- `Cliente`
- `Direccion`
- `Vehiculo`
- `OrdenServicio`
- `Auditoria`

#### `app/(protected)/dashboard/clientes/nuevo/actions.ts`

Exports:

- `createCliente(token, formData)`: crea cliente con direcciones/vehiculos.
- `getClientForMigration(token, clientId)`: obtiene cliente para migracion.
- `getServilutionClientForMigration(token, clientId)`: obtiene cliente legacy.

#### `app/(protected)/dashboard/clientes/referidos/actions.ts`

Export:

- `getReferidos(token)`: lista referidos.

### Servicios

#### `app/(protected)/dashboard/servicios/actions.ts`

Exports:

- `getOrdenesServicio`
- `getOrdenServicio`
- `deleteOrdenServicio`
- `getOrdenesStats`
- `getFilterData`
- `getFormData`
- `addDireccionToCliente`
- `addVehiculoToCliente`
- `createOrdenServicio`
- `updateOrdenServicio`
- `sendServiceToTechnician`
- `searchClientes`
- `getTenantsList`
- `getAllOrdenesServicioForExport`
- `uploadFacturaElectronica`
- `uploadComprobantePago`
- `uploadEvidence`
- `registrarRefuerzo`
- `liquidarOrdenTransferencia`

Responsabilidades:

- CRUD operativo de ordenes.
- Carga de datos para formularios.
- Busqueda de clientes.
- Subida de archivos.
- Envio de push a tecnicos.
- Auditoria.
- Creacion de refuerzos.
- Liquidacion de transferencias con trazabilidad.

Dependencias:

- `OrdenServicio`
- `Cliente`
- `Direccion`
- `Vehiculo`
- `Usuario`
- `Servicio`
- `TipoServicio`
- `EstadoServicio`
- `MetodoPago`
- `Zona`
- `Empresa`
- `ConsignacionEfectivo`
- `ConsignacionOrden`
- Supabase Storage
- Redis opcional
- Expo Push

#### `app/(protected)/dashboard/servicios/programacion/actions.ts`

Export:

- `getOrdenesByDateRange(token, startDate, endDate, tecnicoId?)`

Responsabilidad:

- Obtener ordenes para calendario/programacion.
- Mapear estados de BD a estados visuales.

#### `app/(protected)/dashboard/servicios/seguimiento/actions.ts`

Exports:

- `SugerenciaOrden`
- `getSugerenciasRefuerzo`
- `getSeguimientoTrimestral`
- `rechazarSeguimiento`
- `registrarRefuerzo`

Responsabilidad:

- Detectar servicios candidatos a refuerzo.
- Detectar seguimiento trimestral.
- Marcar seguimiento revisado.
- Crear orden de refuerzo.

### Citas

#### `app/(protected)/dashboard/citas/actions.ts`

Exports:

- `getCitas`
- `getCita`
- `createCita`
- `getCitasStats`
- `deleteCita`
- `getFormDataCitas`
- `getConsultorios`
- `getClientPackages`
- `searchClientes`
- `sendCitaToPsicologo`
- `getAllCitasForExport`
- `getTenantsList`
- `uploadComprobantePagoCita`
- `markCitaAsRealizada`
- `markCitaAsCancelada`
- `toggleCitaPago`
- `updateCitaPago`
- `checkConsultorioDisponibilidad`
- `updateCita`

Responsabilidades:

- Listado, creacion, edicion y estados de citas.
- Gestion de pagos de citas.
- Validacion de consultorios.
- Consumo y ajuste de paquetes.
- Auditoria de citas.

Dependencias:

- `CitasPsicologos`
- `Cliente`
- `Usuario`
- `Servicio`
- `Empresa`
- `consultorios`
- `PaqueteAdquirido`
- `TerapiasPsicologos`

#### `app/(protected)/dashboard/citas/programacion/actions.ts`

Exports:

- `getCitasByDateRange`
- `moveCita`
- `unassignCita`

Responsabilidad:

- Adaptar citas a estructura compatible con calendario.
- Mover cita entre horarios/consultorios.
- Desasignar consultorio.

#### `app/(protected)/dashboard/citas/servicios-paquetes/actions.ts`

Exports:

- `getManagementOptions`
- `getTerapiasPsicologos`
- `createTerapiaPsicologos`
- `updateTerapiaPsicologos`
- `toggleTerapiaPsicologosActivo`
- `getPaquetesAdquiridos`
- `createPaqueteAdquirido`
- `updatePaqueteAdquirido`
- `cancelPaqueteAdquirido`

Responsabilidad:

- Administrar catalogo de terapias/servicios.
- Administrar paquetes adquiridos.
- Validar ownership por cliente o psicologo.
- Auditar cambios.

### Usuarios

#### `app/(protected)/dashboard/usuarios/actions.ts`

Exports:

- `createUsuario`
- `getEmpresasOptions`

Responsabilidad:

- Crear usuarios desde dashboard.
- Cargar empresas para formulario.

#### `app/(protected)/dashboard/usuarios/aprobar/actions.ts`

Exports:

- `getUsuariosPendientes`
- `aprobarUsuario`
- `getEmpresasOptions`
- `rechazarUsuario`

Responsabilidad:

- Aprobar o rechazar usuarios registrados.
- Asignar rol y empresa.

#### `app/(protected)/dashboard/usuarios/asesores/actions.ts`

Exports:

- `getAsesores`
- `getAsesor`
- `deleteAsesor`
- `updateAsesor`
- `getServiciosFinalizadosPorAsesor`
- `getReporteServiciosFinalizados`

Responsabilidad:

- Gestion y reportes de asesores.

#### `app/(protected)/dashboard/usuarios/tecnicos/actions.ts`

Exports:

- `getTecnicos`
- `getTecnico`
- `toggleTecnicoStatus`
- `deleteTecnico`
- `updateTecnico`

Responsabilidad:

- Gestion de tecnicos.

#### `app/(protected)/dashboard/usuarios/ranking/actions.ts`

Exports:

- `getUserRanking`
- `getUserDetails`

Responsabilidad:

- Ranking y detalle de desempeno.

#### `app/(protected)/dashboard/usuarios/tecnicos/update-actions.ts`

Export:

- `sendUpdateNotification`

Responsabilidad:

- Enviar aviso de actualizacion.

### Configuracion

#### `configuracion/empresas/actions.ts`

Exports:

- `getEmpresas`
- `createEmpresa`
- `updateEmpresa`
- `deleteEmpresa`
- `getEmpresaServices`
- `getEmpresaUsers`

#### `configuracion/servicios/actions.ts`

Exports:

- `getServicios`
- `getEmpresasOptions`
- `createServicio`
- `updateServicio`
- `deleteServicio`

#### `configuracion/tipos-servicio/actions.ts`

Exports:

- `getTiposServicio`
- `getEmpresasOptions`
- `createTipoServicio`
- `updateTipoServicio`
- `deleteTipoServicio`

#### `configuracion/metodos-pago/actions.ts`

Exports:

- `getMetodosPago`
- `getEmpresasOptions`
- `createMetodoPago`
- `updateMetodoPago`
- `deleteMetodoPago`

#### `configuracion/zonas/actions.ts`

Exports:

- `getZonas`
- `createZona`
- `updateZona`
- `deleteZona`

#### `configuracion/pico-placa/actions.ts`

Exports:

- `TecnicoPicoPlaca`
- `getPicoPlacaRules`
- `updatePicoPlacaRulesBatch`
- `updateUsuarioVehiculo`
- `getTecnicosStatus`

#### `configuracion/nomina/actions.ts`

Exports:

- `NominaFormData`
- `getUsuariosNomina`
- `saveConfiguracionNomina`

#### `configuracion/permisos/actions.ts`

Exports:

- `requestPermission`
- `getPendingPermissions`
- `approvePermission`
- `rejectPermission`
- `checkPermission`
- `getPermissionHistory`
- `getMyPermissionStatus`

Responsabilidad:

- Permisos temporales para acciones sensibles.
- Notificacion por correo a administradores.

### Contabilidad

#### `contabilidad/recaudo/actions.ts`

Exports:

- `TechnicianFinancialStatus`
- `PendingOrder`
- `getTechniciansFinancialStatus`
- `getPendingCashOrders`
- `registerConsignation`
- `registerAdvanceFromOrders`
- `uploadConsignationProof`
- `ConsignacionHistoryItem`
- `DeclaracionHistoryItem`
- `getConsignacionHistory`
- `getDeclaracionHistory`
- `updateConsignacion`
- `updateDeclaracion`

Responsabilidad:

- Recaudo en efectivo, consignaciones, declaraciones y anticipos desde ordenes.

#### `contabilidad/cuenta-cobro/actions.ts`

Exports:

- `getTurnos`
- `updateTurno`
- `deleteTurno`
- `createCuentaCobroGroup`
- `getCuentasCobro`
- `getCuentaCobroDetails`
- `getCuentaCobroPdfData`
- `sendCuentaCobro`
- `updateCuentaCobroStatus`

#### `contabilidad/nomina/actions.ts`

Exports:

- `NominaSummary`
- `updateValorRepuestosTecnico`
- `getNominas`
- `getServiciosPendientes`
- `getTecnicos`
- `createNomina`
- `getNominaById`
- `updateNominaEstado`

#### `contabilidad/anticipos/actions.ts`

Exports:

- `getAnticipos`
- `getTecnicos`
- `createAnticipo`
- `updateAnticipo`
- `deleteAnticipo`

#### `contabilidad/egresos/actions.ts`

Exports:

- `getEgresos`
- `getUsuarios`
- `createEgreso`
- `updateEgreso`
- `deleteEgreso`

#### `contabilidad/balances/actions.ts`

Exports:

- `BalanceSummary`
- `getBalanceGeneral`

Responsabilidad:

- Consolidar ingresos, nominas, anticipos, egresos y neto por periodo.
- Manejar logica especial de tenant 4 basada en citas/paquetes.

### Insumos

#### `app/(protected)/dashboard/insumos/actions.ts`

Exports:

- `getProducts`
- `getProductRequests`
- `updateProductRequestStatus`

Responsabilidad:

- Listado de productos.
- Solicitudes de insumos.
- Aceptacion/rechazo y descuento de stock.
- Push notification al usuario solicitante.

### Monitoreo

#### `monitoreo/auditoria/actions.ts`

Exports:

- `getAuditoria`
- `getEntidadesAuditadas`
- `getAuditFilterOptions`
- `getAuditoriaForExport`

Responsabilidad:

- Consulta y exportacion de auditoria.

#### `monitoreo/actividad/actions.ts`

Exports:

- `getRecentSessions`
- `getSessionEvents`

Responsabilidad:

- Lectura de sesiones y eventos de actividad.

### Integraciones legacy

#### `servilution/clientes/actions.ts`

Export:

- `getClienteDetails`

Usa:

- `lib/mysql.ts`

#### `serv-tecnico/clientes/actions.ts`

Export:

- `getClienteDetails`

Usa:

- `lib/tecnicos.ts`

## Paginas principales

### Raiz y publicas

- `app/layout.tsx`: layout raiz, fuentes, metadata y toaster.
- `app/page.tsx`: pagina inicial.
- `app/not-found.tsx`: pagina 404.
- `app/(auth)/sign-in/page.tsx`: formulario de login.
- `app/(auth)/sign-up/page.tsx`: formulario de registro.
- `app/(pending)/verificacion/page.tsx`: cuenta pendiente.
- `app/registro-referidos/page.tsx`: registro publico de referidos.

### Dashboard

- `app/(protected)/dashboard/layout.tsx`: layout protegido con notificaciones y dashboard client.
- `app/(protected)/dashboard/page.tsx`: dashboard principal.
- `app/(protected)/dashboard/clientes/page.tsx`: listado clientes.
- `app/(protected)/dashboard/clientes/nuevo/page.tsx`: crear cliente.
- `app/(protected)/dashboard/clientes/[id]/editar/page.tsx`: editar cliente.
- `app/(protected)/dashboard/servicios/page.tsx`: listado servicios.
- `app/(protected)/dashboard/servicios/nuevo/page.tsx`: crear servicio.
- `app/(protected)/dashboard/servicios/[id]/editar/page.tsx`: editar servicio.
- `app/(protected)/dashboard/servicios/programacion/page.tsx`: calendario servicios.
- `app/(protected)/dashboard/servicios/seguimiento/page.tsx`: refuerzos/seguimiento.
- `app/(protected)/dashboard/citas/page.tsx`: listado citas.
- `app/(protected)/dashboard/citas/nuevo/page.tsx`: crear cita.
- `app/(protected)/dashboard/citas/[id]/editar/page.tsx`: editar cita.
- `app/(protected)/dashboard/citas/programacion/page.tsx`: calendario citas.
- `app/(protected)/dashboard/citas/servicios-paquetes/page.tsx`: terapias y paquetes.

### Administracion

- `usuarios/*`: usuarios, tecnicos, asesores, aprobaciones y ranking.
- `configuracion/*`: empresas, servicios, tipos, metodos, zonas, nomina, permisos, perfil, pico y placa.
- `contabilidad/*`: recaudo, cuenta de cobro, nomina, anticipos, egresos y balances.
- `insumos/*`: stock y solicitudes.
- `monitoreo/*`: auditoria y actividad.
- `mensajeria/page.tsx`: Chatwoot.
- `servilution/*`: vistas legacy tenant 1.
- `serv-tecnico/*`: vistas legacy tenant 2.

## Componentes

### Dashboard

#### `components/dashboard/sidebar.tsx`

Export:

- `Sidebar`

Responsabilidad:

- Definir menu principal.
- Filtrar opciones por rol y tenant.
- Transformar menu de servicios a citas cuando `tenantId === 4`.
- Permitir cambio de tenant.
- Manejar logout.

#### `components/dashboard/header.tsx`

Export:

- `Header`

Responsabilidad:

- Mostrar boton menu, nombre de usuario y tenant.

#### `components/dashboard/dashboard-layout-client.tsx`

Export:

- `DashboardLayoutClient`

Responsabilidad:

- Layout client-side del dashboard.
- Integra sidebar/header y estado responsive.

#### `components/dashboard/realtime-notifications.tsx`

Export:

- `RealtimeNotifications`

Responsabilidad:

- Suscribirse a canal Supabase `dashboard-notifications`.
- Mostrar toasts de llegada, finalizacion y solicitud de insumos.

#### `components/dashboard/report-download-button.tsx`

Export:

- `ReportDownloadButton`

Responsabilidad:

- Boton de descarga de reportes.

#### `components/dashboard/servilution/service-actions.tsx`

Exports:

- `ServiceData`
- `ServiceActions`

Responsabilidad:

- Acciones visuales para servicios legacy Servilution.

#### `components/dashboard/serv-tecnico/service-actions.tsx`

Exports:

- `ServiceData`
- `ServiceActions`

Responsabilidad:

- Acciones visuales para servicios legacy de tecnico.

### Contabilidad

#### `components/contabilidad/recaudo/consignation-modal.tsx`

Export:

- `ConsignationModal`

Responsabilidad:

- Modal para registrar/gestionar consignaciones.

#### `components/contabilidad/recaudo/history-tables.tsx`

Exports:

- `ConsignacionHistoryTable`
- `DeclaracionHistoryTable`

Responsabilidad:

- Tablas de historial para recaudo.

### UI base

Directorio:

- `components/ui`

Componentes exportados detectados:

- `Button`
- `Badge`
- `Card` y subcomponentes.
- `Checkbox`
- `Combobox`
- `Command` y subcomponentes.
- `Dialog` y subcomponentes.
- `DropdownMenu` y subcomponentes.
- `FilterDateRange`
- `FilterSelect`
- `Input`
- `Label`
- `PaginationControls`
- `Popover` y subcomponentes.
- `RadioGroup`
- `ScrollArea`
- `Search`
- `Select` y subcomponentes.
- `Separator`
- `Skeleton`
- `Table` y subcomponentes.
- `Tabs` y subcomponentes.
- `Textarea`
- `Toaster`/`sonner`

Responsabilidad:

- Proveer componentes reutilizables basados en Radix UI, Tailwind y shadcn/ui.

## Prisma

### Schemas editables

- `prisma/schema.prisma`: base principal PostgreSQL.
- `prisma/schema.mysql.prisma`: base legacy MySQL Servilution.
- `prisma/schema.tecnicos.prisma`: base legacy MySQL tecnicos.

### Configuracion Prisma

- `prisma.config.ts`: usa `POSTGRES_URL_NON_POOLING`.
- `prisma.mysql.config.ts`: usa `DATABASE_URL_MYSQL`.
- `prisma.tecnicos.config.ts`: usa `DATABASE_URL_MYSQL_TECNICOS`.

### Clientes generados

No editar:

- `prisma/generated/prisma`
- `prisma/generated/prisma-mysql`
- `prisma/generated/prisma-tecnicos`

Regenerar con:

```bash
npx prisma generate
npm run generate:mysql
npm run generate:tecnicos
```

## Scripts

Directorio:

- `scripts/`

Archivos observados:

- `debug-consultorios.ts`
- `debug-cita-issue.ts`
- `check-users.ts`
- `check-tenants.ts`
- `check-referidos.ts`
- `check-mysql.ts`
- `fix-sequence.ts`
- `debug-db.ts`
- `list-all-tables.ts`
- `list-services.ts`
- `test-audit.ts`

Responsabilidad general:

- Diagnostico puntual de datos, usuarios, tenants, referidos, MySQL, secuencias, tablas, servicios y auditoria.

Precaucion:

- Revisar cada script antes de ejecutarlo; algunos pueden escribir o corregir datos.

## Donde tocar segun necesidad

### Cambiar login o token

Revisar:

- `lib/auth.ts`
- `app/api/sign-in/route.ts`
- `app/api/auth/validate/route.ts`
- `hooks/use-user-role.ts`

### Cambiar clientes

Revisar:

- `app/(protected)/dashboard/clientes/actions.ts`
- `app/(protected)/dashboard/clientes/nuevo/actions.ts`
- `prisma/schema.prisma` modelo `Cliente`
- modelos `Direccion` y `Vehiculo`

### Cambiar ordenes de servicio

Revisar:

- `app/(protected)/dashboard/servicios/actions.ts`
- `app/api/my-services/**/route.ts`
- `prisma/schema.prisma` modelo `OrdenServicio`
- `EstadoServicio`
- `MetodoPago`
- `Geolocalizacion`

### Cambiar citas

Revisar:

- `app/(protected)/dashboard/citas/actions.ts`
- `app/(protected)/dashboard/citas/programacion/actions.ts`
- `app/(protected)/dashboard/citas/servicios-paquetes/actions.ts`
- modelos `CitasPsicologos`, `PaqueteAdquirido`, `TerapiasPsicologos`, `consultorios`

### Cambiar pagos/contabilidad

Revisar:

- `app/(protected)/dashboard/contabilidad/**/actions.ts`
- modelos `Nomina`, `NominaDetalle`, `Anticipos`, `Turno`, `CuentaCobro`, `ConsignacionEfectivo`, `DeclaracionEfectivo`, `Egresos`

### Cambiar permisos

Revisar:

- `app/(protected)/dashboard/configuracion/permisos/actions.ts`
- `app/api/permisos/responder/route.ts`
- `lib/mail.ts`
- modelo `Permiso`

### Cambiar Chatwoot

Revisar:

- `lib/chatwoot.ts`
- `hooks/use-chatwoot.ts`
- `app/(protected)/dashboard/mensajeria/page.tsx`
- `next.config.ts`

### Cambiar notificaciones realtime

Revisar:

- `components/dashboard/realtime-notifications.tsx`
- endpoints que emiten broadcasts:
  - `app/api/my-services/[id]/arrival/route.ts`
  - `app/api/my-services/[id]/finalize/route.ts`
  - `app/api/productos/[id]/solicitar/route.ts`

### Cambiar storage

Revisar:

- `app/api/storage/sign-url/route.ts`
- `app/api/my-services/[id]/arrival/route.ts`
- `app/api/my-services/[id]/finalize/route.ts`
- `app/(protected)/dashboard/servicios/actions.ts`

## Reglas de cuidado al modificar codigo

1. No renombrar exports usados por paginas o componentes sin buscar referencias.
2. No cambiar nombres de campos Prisma sin migracion y regeneracion.
3. No editar `prisma/generated`.
4. Mantener filtros por `tenantId`.
5. Mantener validaciones de rol en servidor.
6. Si se modifica un flujo con dinero, registrar auditoria.
7. Si se modifica una mutacion visible en UI, revisar `revalidatePath`.
8. Si se cambia un estado, revisar comparaciones por texto.
9. Si se cambian headers de auth, revisar app tecnica y proxy.
10. Si se cambian buckets de storage, actualizar variables/permisos de Supabase y documentacion.
