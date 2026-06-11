# API y flujos

## Convenciones generales

El proyecto usa dos formas principales para ejecutar negocio:

- API Routes en `app/api/**/route.ts`, llamadas por fetch, app tecnica, formularios publicos o integraciones.
- Server Actions en `app/(protected)/dashboard/**/actions.ts`, llamadas desde pantallas del dashboard.

La mayoria de endpoints/actions validan JWT con `verifyToken`.

Formatos de token aceptados:

- `Authorization: Bearer <token>`
- `x-auth-token: <token>` en varios endpoints usados por app/proxy.
- Cookie `token` en `sign-out`.

`verifyToken` devuelve `null` si el token es invalido, expiro o `aprobado` es falso.

## API Routes

| Metodo | Ruta | Para que sirve | Auth | Modelos/servicios |
|---|---|---|---|---|
| `POST` | `/api/sign-in` | Iniciar sesion con usuario y contrasena. | No | `Usuario`, `Tenant`, `bcrypt`, JWT |
| `POST` | `/api/sign-up` | Registrar usuario pendiente de aprobacion. | No | `Usuario`, `bcrypt` |
| `POST` | `/api/sign-out` | Cerrar sesion y cerrar sesiones de actividad abiertas. | Cookie o Bearer | `SesionActividad` |
| `GET` | `/api/auth/validate` | Validar token y estado activo/aprobado en BD. | Bearer | `Usuario` |
| `GET` | `/api/profile` | Obtener perfil y cuenta de pago. | Bearer o `x-auth-token` | `Usuario`, `CuentasPago` |
| `PUT` | `/api/profile` | Actualizar perfil, contrasena y cuenta de pago. | Bearer o `x-auth-token` | `Usuario`, `CuentasPago`, `bcrypt` |
| `PUT` | `/api/profile/push-token` | Guardar token push de Expo. | Bearer o `x-auth-token` | `Usuario` |
| `GET` | `/api/profile/referral-code` | Obtener o crear codigo de referido. | Bearer o `x-auth-token` | `Usuario` |
| `POST` | `/api/referidos/validate` | Validar codigo de referido. | No | `Usuario` |
| `POST` | `/api/referidos/register` | Registrar referido publico. | No | `Usuario`, `Referidos` |
| `GET` | `/api/servicios` | Obtener ordenes del usuario autenticado. | Bearer | `OrdenServicio`, `Usuario` |
| `GET` | `/api/my-services` | Listar servicios asignados a tecnico, pendientes o completados. | Bearer o `x-auth-token` | `OrdenServicio` |
| `GET` | `/api/my-services/[id]` | Detalle de servicio para tecnico/app. | Bearer o `x-auth-token` | `OrdenServicio`, `Geolocalizacion` |
| `POST` | `/api/my-services/[id]/arrival` | Registrar llegada con coordenadas y foto. | Bearer o `x-auth-token` | `Geolocalizacion`, `OrdenServicio`, Supabase |
| `PUT` | `/api/my-services/[id]/finalize` | Finalizar servicio con evidencias, datos tecnicos y pago. | Bearer o `x-auth-token` | `OrdenServicio`, `Geolocalizacion`, Supabase |
| `POST` | `/api/my-services/[id]/upload-evidence` | Guardar URLs de evidencia en la orden. | Bearer o `x-auth-token` | `OrdenServicio` |
| `GET` | `/api/productos` | Listar productos/insumos disponibles del tenant. | Bearer o `x-auth-token` | `ProductosFumigacion` |
| `POST` | `/api/productos/[id]/solicitar` | Crear solicitud de insumo. | Bearer o `x-auth-token` | `ProductosFumigacionSolicitados`, Supabase Realtime |
| `GET` | `/api/my-product-requests` | Listar solicitudes de insumos del usuario. | Bearer o `x-auth-token` | `ProductosFumigacionSolicitados` |
| `POST` | `/api/storage/sign-url` | Crear URL firmada de subida a Supabase Storage. | Bearer | Supabase Storage |
| `POST` | `/api/turnos` | Crear turno con horas, descanso, fotos y valor calculado. | Bearer | `Turno`, `CuentasPago`, `Usuario` |
| `PUT` | `/api/turnos/[id]` | Actualizar turno propio no cerrado. | Bearer | `Turno`, `CuentasPago` |
| `POST` | `/api/monitor/log` | Registrar eventos de actividad/inactividad. | No, recibe `userId` | `SesionActividad`, `LogEvento` |
| `GET` | `/api/monitor/report` | Reporte de usuarios online/offline por fecha. | Bearer admin | `Usuario`, `SesionActividad`, `LogEvento` |
| `GET` | `/api/permisos/responder` | Aprobar/rechazar permiso desde enlace de correo. | Token JWT en query | `Permiso` |

## Server Actions por dominio

### Dashboard

Archivo:

- `app/(protected)/dashboard/actions.ts`

Actions:

- `getDashboardStats`: calcula indicadores del panel.
- `getAllTenants`: lista tenants.
- `switchUserTenant`: cambia tenant del usuario y devuelve JWT nuevo.
- `getUnpaidServicesDetails`: lista servicios por cobrar.

### Clientes

Archivos:

- `clientes/actions.ts`
- `clientes/nuevo/actions.ts`
- `clientes/referidos/actions.ts`

Actions:

- `getClientes`
- `getCliente`
- `deleteCliente`
- `updateCliente`
- `getClientesStats`
- `getClienteServicios`
- `getAllClientesForExport`
- `createCliente`
- `getClientForMigration`
- `getServilutionClientForMigration`
- `getReferidos`

### Servicios

Archivo:

- `servicios/actions.ts`

Actions:

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

### Programacion y seguimiento

Archivos:

- `servicios/programacion/actions.ts`
- `servicios/seguimiento/actions.ts`

Actions:

- `getOrdenesByDateRange`
- `getSugerenciasRefuerzo`
- `getSeguimientoTrimestral`
- `rechazarSeguimiento`
- `registrarRefuerzo`

### Citas

Archivos:

- `citas/actions.ts`
- `citas/programacion/actions.ts`
- `citas/servicios-paquetes/actions.ts`

Actions:

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
- `getCitasByDateRange`
- `moveCita`
- `unassignCita`
- `getManagementOptions`
- `getTerapiasPsicologos`
- `createTerapiaPsicologos`
- `updateTerapiaPsicologos`
- `toggleTerapiaPsicologosActivo`
- `getPaquetesAdquiridos`
- `createPaqueteAdquirido`
- `updatePaqueteAdquirido`
- `cancelPaqueteAdquirido`

### Usuarios

Archivos:

- `usuarios/actions.ts`
- `usuarios/aprobar/actions.ts`
- `usuarios/asesores/actions.ts`
- `usuarios/tecnicos/actions.ts`
- `usuarios/ranking/actions.ts`
- `usuarios/tecnicos/update-actions.ts`

Actions:

- `createUsuario`
- `getEmpresasOptions`
- `getUsuariosPendientes`
- `aprobarUsuario`
- `rechazarUsuario`
- `getAsesores`
- `getAsesor`
- `deleteAsesor`
- `updateAsesor`
- `getServiciosFinalizadosPorAsesor`
- `getReporteServiciosFinalizados`
- `getTecnicos`
- `getTecnico`
- `toggleTecnicoStatus`
- `deleteTecnico`
- `updateTecnico`
- `getUserRanking`
- `getUserDetails`
- `sendUpdateNotification`

### Configuracion

Archivos:

- `configuracion/empresas/actions.ts`
- `configuracion/servicios/actions.ts`
- `configuracion/tipos-servicio/actions.ts`
- `configuracion/metodos-pago/actions.ts`
- `configuracion/zonas/actions.ts`
- `configuracion/pico-placa/actions.ts`
- `configuracion/nomina/actions.ts`
- `configuracion/permisos/actions.ts`

Actions destacadas:

- CRUD de empresas, servicios, tipos, metodos de pago y zonas.
- `getPicoPlacaRules`
- `updatePicoPlacaRulesBatch`
- `updateUsuarioVehiculo`
- `getTecnicosStatus`
- `getUsuariosNomina`
- `saveConfiguracionNomina`
- `requestPermission`
- `getPendingPermissions`
- `approvePermission`
- `rejectPermission`
- `checkPermission`
- `getPermissionHistory`
- `getMyPermissionStatus`

### Contabilidad

Archivos:

- `contabilidad/recaudo/actions.ts`
- `contabilidad/cuenta-cobro/actions.ts`
- `contabilidad/nomina/actions.ts`
- `contabilidad/anticipos/actions.ts`
- `contabilidad/egresos/actions.ts`
- `contabilidad/balances/actions.ts`

Actions:

- Recaudo efectivo y consignaciones.
- Turnos y cuentas de cobro.
- Nomina y detalles.
- Anticipos.
- Egresos.
- Balance general.

### Insumos

Archivo:

- `insumos/actions.ts`

Actions:

- `getProducts`
- `getProductRequests`
- `updateProductRequestStatus`

### Monitoreo

Archivos:

- `monitoreo/auditoria/actions.ts`
- `monitoreo/actividad/actions.ts`

Actions:

- `getAuditoria`
- `getEntidadesAuditadas`
- `getAuditFilterOptions`
- `getAuditoriaForExport`
- `getRecentSessions`
- `getSessionEvents`

## Flujos principales

### Flujo de login

1. Usuario envia `username` y `password` a `/api/sign-in`.
2. API busca `Usuario` con relacion `tenant`.
3. Rechaza si no existe, esta inactivo o no tiene rol.
4. Compara password con bcrypt.
5. Firma JWT con datos de usuario, tenant y rol.
6. Frontend guarda token.
7. `useUserRole` decodifica token para renderizar UI.

Puntos sensibles:

- `verifyToken` tambien valida `aprobado`.
- Usuarios nuevos quedan `aprobado = false`.
- La aprobacion se administra desde `/dashboard/usuarios/aprobar`.

### Flujo de creacion de servicio

1. Usuario abre `/dashboard/servicios/nuevo`.
2. La pantalla carga datos de formulario con `getFormData`.
3. Usuario selecciona cliente, direccion o vehiculo, empresa, tipo, servicio, estado, tecnico, fecha, hora, valores y metodo de pago.
4. `createOrdenServicio` valida token y usuario.
5. Valida que exista cliente, servicio, tipo, estado y direccion o vehiculo.
6. Convierte fecha/hora con zona `America/Bogota`.
7. Crea `OrdenServicio`.
8. Registra auditoria `CREATE`.
9. Si hay tecnico, envia push.
10. Revalida `/dashboard/servicios`.
11. Si Redis existe, invalida cache de estadisticas.
12. Para tenant 1, crea refuerzos automaticos a 7/14 dias y 3 meses si aplica.

### Flujo de actualizacion de servicio

1. Usuario edita desde `/dashboard/servicios/[id]/editar`.
2. `updateOrdenServicio` valida token, usuario y pertenencia al tenant.
3. Valida campos obligatorios.
4. Actualiza datos principales, direccion cacheada, valores, estado, tecnico y fecha.
5. Registra auditoria con `antes` y `despues`.
6. Si cambia tecnico, envia push.
7. Revalida e invalida cache Redis si existe.

### Flujo tecnico de llegada

1. App tecnica llama `POST /api/my-services/[id]/arrival`.
2. Envia JWT, latitud, longitud, link de Maps y foto.
3. API sube foto al bucket `fotoLlegada`.
4. Crea `Geolocalizacion` con llegada, coordenadas y foto.
5. Busca estado que contenga `Proceso`.
6. Actualiza estado de la orden a "En Proceso".
7. Publica evento Supabase `service-arrival`.
8. Dashboard muestra toast con acceso al servicio.

### Flujo tecnico de finalizacion

1. App tecnica llama `PUT /api/my-services/[id]/finalize`.
2. Envia datos tecnicos: infestacion, higiene, condiciones del local, valor pagado, metodo de pago, factura, foto de salida y comprobante.
3. API valida archivos obligatorios segun metodo de pago.
4. Sube archivos a Supabase Storage.
5. Actualiza `OrdenServicio` con:
   - `nivelInfestacion`
   - `condicionesHigiene`
   - `condicionesLocal`
   - `estadoServicioId = 64`
   - `horaFin`
   - `facturaPath`
   - `comprobantePago`
   - `valorPagado`
   - `metodoPagoId`
6. Actualiza `Geolocalizacion` abierta con salida y foto de salida.
7. Publica evento `service-finalized`.

Punto sensible:

- El estado final se fija por ID `64`. Cambiar estados en base puede romper este flujo.

### Flujo de evidencias y storage

Hay dos estilos:

- API `POST /api/storage/sign-url` genera URL firmada para subida directa.
- Actions/API suben archivos usando `SUPABASE_SERVICE_ROLE_KEY`.

Buckets usados:

- `turno`
- `fotoLlegada`
- `fotoSalida`
- `facturas`
- `facturaElectronica`
- `comprobantePago`
- `evidencia`

### Flujo de citas

1. Tenant 4 ve el menu de servicios como gestion de citas.
2. `createCita` recibe paciente, psicologo, servicio/terapia/paquete, consultorio, fecha/hora, valor y metodo.
3. Convierte horario en zona `America/Bogota`.
4. Si hay consultorio, valida que no haya solapamiento.
5. Si se agenda desde una terapia sin paquete, crea `PaqueteAdquirido` y consume la primera sesion.
6. Si usa paquete existente, decrementa saldo e incrementa sesiones consumidas.
7. Crea `CitasPsicologos`.
8. Registra auditoria.

### Flujo de paquetes

1. Admin crea catalogo `TerapiasPsicologos`.
2. Admin crea `PaqueteAdquirido` para cliente o psicologo.
3. El paquete guarda sesiones totales, consumidas, saldo, precio, vencimiento y estado.
4. Las citas pueden consumir sesiones del paquete.
5. Si una cita cambia de terapia/paquete, el sistema puede devolver saldo o eliminar paquete viejo si ya no esta asociado.

### Flujo de permisos temporales

1. Usuario solicita permiso con `requestPermission`.
2. El sistema busca solicitudes pendientes o permisos activos similares.
3. Crea `Permiso` en estado `PENDIENTE`.
4. Busca admins:
   - `SU_ADMIN`
   - `ADMIN` del tenant actual
   - `ADMIN` del tenant 1
5. Envia correo con enlaces firmados.
6. Admin aprueba/rechaza desde dashboard o enlace.
7. Permiso aprobado queda con expiracion.
8. `checkPermission` permite a `SU_ADMIN` y `ADMIN`, y para otros roles valida permiso activo.

### Flujo de insumos

1. Tecnico consulta productos con `/api/productos`.
2. Tecnico solicita producto con `/api/productos/[id]/solicitar`.
3. Se crea `ProductosFumigacionSolicitados` en `PENDIENTE`.
4. Se emite broadcast `product-requested`.
5. Admin/asesor revisa en `/dashboard/insumos/solicitudes`.
6. `updateProductRequestStatus` acepta o rechaza.
7. Si acepta, descuenta stock.
8. Envia push al solicitante.

### Flujo de recaudo efectivo

1. Tecnico finaliza servicios con pagos en efectivo.
2. Se generan o consultan declaraciones/ordenes pendientes.
3. Admin registra consignacion con valor, referencia y comprobante.
4. Se relacionan ordenes mediante `ConsignacionOrden`.
5. Se actualiza estado de pago de ordenes.
6. Puede registrar anticipos desde ordenes.
7. Historial permite revisar y corregir consignaciones/declaraciones.

### Flujo de cuenta de cobro

1. Usuario registra turnos con `/api/turnos`.
2. El valor se calcula con horas trabajadas menos descanso por `valorHora` de `CuentasPago`.
3. Admin agrupa turnos en `CuentaCobro`.
4. Se puede generar informacion para PDF.
5. Se marca cuenta como pagada o rechazada.
6. Turnos vinculados a cuenta cerrada no pueden editarse desde API de turno.

### Flujo de monitoreo

1. `useActivityMonitor` detecta actividad en el navegador.
2. Envia eventos a `/api/monitor/log`.
3. La API crea/reutiliza `SesionActividad` diaria abierta.
4. Crea `LogEvento`.
5. Si el evento es inactividad, suma minutos a `tiempoInactivo`.
6. `/api/monitor/report` devuelve reporte diario para admins.

## Estados y nombres sensibles

Varios calculos dependen de texto:

- Dashboard:
  - `Liquidado`
  - `En Proceso`
  - `Finalizado`
  - `Cancelado`
  - `No Concretado`
  - metodo de pago `por cobrar`

- App tecnica:
  - busca estado que contenga `Proceso`.
  - finalizacion usa `estadoServicioId = 64`.

- Programacion:
  - detecta `nuevo`, `agendado`, `reprogramado`, `programado`, `proceso`, `finalizado`, `listo`, `cancelado`.

- Refuerzos:
  - tipo `Refuerzo`.
  - `tipoServicioId = 3`.
  - servicio especial `C: CONTROL DE CHINCHES`.

Cambiar estos nombres/IDs en base sin ajustar codigo puede romper reportes y flujos.

## Manejo de errores

Patrones comunes:

- `{ error: "..." }` en server actions.
- `NextResponse.json({ message: "..." }, { status })` en API routes.
- `console.error` para diagnostico servidor.
- Validaciones tempranas por token, usuario y campos requeridos.

## Revalidacion

Varias actions llaman `revalidatePath` despues de mutaciones para refrescar datos del dashboard:

- `/dashboard/servicios`
- `/dashboard/clientes`
- `/dashboard/citas`
- `/dashboard/citas/programacion`
- `/dashboard/citas/servicios-paquetes`
- `/dashboard/insumos/solicitudes`
- `/dashboard/insumos/stock`
- `/dashboard/configuracion/permisos`

## Auditoria por flujo

Se registra auditoria en:

- Crear/editar/eliminar clientes.
- Crear/editar/eliminar servicios.
- Subir archivos de servicio.
- Liquidar transferencias.
- Crear/editar/cancelar citas y paquetes.
- Crear/editar/desactivar terapias.
- Crear usuarios u operaciones administrativas relevantes.

La auditoria guarda JSON en `detalles`, usualmente con `antes` y `despues`.
