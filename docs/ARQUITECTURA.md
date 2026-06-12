# Arquitectura

## Que es

Axis Software es una aplicacion de gestion operativa multi-tenant. Su proposito es permitir que distintos negocios o lineas de servicio trabajen desde un mismo panel web, con aislamiento por sistema/empresa mediante `tenantId`.

En el codigo conviven tres dominios fuertes:

1. Gestion de servicios operativos: clientes, direcciones, vehiculos, ordenes, tecnicos, estados, pagos, evidencias y refuerzos.
2. Gestion de citas: pacientes, psicologos, consultorios, terapias, paquetes y programacion.
3. Gestion administrativa: usuarios, aprobaciones, permisos, contabilidad, nomina, recaudo, anticipos, egresos, balances, auditoria, actividad e insumos.

## Para que sirve

El sistema sirve para:

- Registrar clientes, sedes, direcciones y vehiculos.
- Crear, programar, editar, asignar y liquidar servicios.
- Permitir que tecnicos consulten sus servicios desde endpoints orientados a app movil.
- Registrar llegada, salida, geolocalizacion, fotos, facturas, comprobantes y evidencias.
- Gestionar citas psicologicas, consultorios, paquetes de sesiones y estados de pago.
- Calcular indicadores de dashboard, ingresos, deuda, cancelaciones y servicios pendientes.
- Controlar inventario/insumos y solicitudes de productos por tecnicos.
- Gestionar nomina, cuentas de cobro, turnos, anticipos, recaudo de efectivo, egresos y balances.
- Auditar cambios importantes y monitorear actividad de usuarios.
- Integrar mensajeria de Chatwoot en el dashboard.
- Manejar codigos de referido y registro publico de referidos.

## Capas del sistema

```text
Navegador / App tecnica
        |
        | paginas React, hooks, fetch, server actions
        v
Next.js App Router
        |
        | app/(protected), app/(auth), app/api
        v
Servicios internos
        |
        | lib/auth, lib/prisma, lib/audit, lib/mail,
        | lib/notifications, lib/chatwoot, lib/mysql, lib/tecnicos
        v
Datos e integraciones
        |
        | PostgreSQL/Supabase, MySQL legacy, Supabase Storage,
        | Supabase Realtime, Redis, SMTP, Expo Push, Chatwoot
```

## Framework y renderizado

El proyecto usa Next.js App Router:

- `app/layout.tsx` define el layout raiz, fuentes Geist y `Toaster`.
- `app/(auth)` contiene pantallas publicas de autenticacion.
- `app/(pending)` contiene pantalla de verificacion de cuenta pendiente.
- `app/(protected)/dashboard` contiene el dashboard protegido.
- `app/api` contiene endpoints HTTP usados por frontend web, app tecnica, monitoreo, storage y flujos publicos.

Las pantallas usan una mezcla de:

- Server Components cuando se puede cargar informacion desde servidor.
- Client Components para formularios, estado local, tablas, modales, filtros, Chatwoot y programaciones.
- Server Actions en `actions.ts` para operaciones de negocio directamente invocadas desde el dashboard.

## Autenticacion

La autenticacion es propia, no depende de Supabase Auth.

Archivos principales:

- `lib/auth.ts`
- `app/api/sign-in/route.ts`
- `app/api/sign-up/route.ts`
- `app/api/sign-out/route.ts`
- `app/api/auth/validate/route.ts`
- `hooks/use-user-role.ts`

Funcionamiento:

1. El login recibe `username` y `password`.
2. Busca `Usuario` por `username`.
3. Verifica que el usuario exista, este activo y tenga rol.
4. Compara contrasena con `bcrypt.compare`.
5. Firma un JWT con `signToken`.
6. El JWT incluye `userId`, `tenantId`, `tenantName`, `username`, `nombre`, `apellido`, `role` y `aprobado`.
7. `verifyToken` valida firma, expiracion y que `aprobado` sea verdadero.
8. En cliente, `useUserRole` lee el token de `localStorage` y decodifica datos de rol/tenant para UI.

El token expira en `1d`.

## Roles

El enum `Rol` define:

- `SU_ADMIN`: acceso global. Puede ver informacion de todos los tenants en varios modulos.
- `ADMIN`: administracion del tenant actual.
- `ASESOR`: operacion comercial/administrativa con acceso limitado.
- `TECNICO`: usuario de campo, principalmente orientado a app tecnica y servicios asignados.

El helper `hasRole` existe en `lib/auth.ts`, aunque muchas validaciones se implementan directamente en server actions y componentes.

## Multi-tenant

El modelo central es `Tenant`. La mayoria de tablas del dominio principal tienen `tenantId` y relacion con `Tenant`.

Patron general:

- Usuarios normales consultan y escriben con `tenantId` del token o de su usuario en base.
- `SU_ADMIN` puede saltar el filtro en varios listados/reportes.
- Algunas vistas cambian segun `tenantId`:
  - Tenant 1 muestra modulo `Servilution`.
  - Tenant 2 muestra modulo `Serv. Tecnico`.
  - Tenant 4 transforma gestion de servicios en gestion de citas y habilita servicios/paquetes.

El filtrado por tenant no esta centralizado en middleware global; se implementa en cada action/API. Por eso cualquier cambio debe revisar el filtro del modulo afectado.

## Navegacion y permisos visuales

La navegacion principal esta en `components/dashboard/sidebar.tsx`.

Reglas relevantes:

- Si no hay rol, no se renderizan items.
- `servilution` se muestra solo con `tenantId === 1`.
- `serv-tecnico` se muestra solo con `tenantId === 2`.
- Para `tenantId === 4`, el menu `Gestion de Servicios` se transforma en `Gestion de Citas`.
- En tenant 4, los administradores ven `Servicios y Paquetes`.
- Rutas administrativas como empresas, nomina, metodos de pago, tipos de servicio, localidades, zonas, monitoreo y varias contables son solo para `ADMIN`/`SU_ADMIN`.
- Recaudo, cuenta de cobro, anticipos y egresos tambien se permiten a `ASESOR`.

Estas reglas son de interfaz; la seguridad real depende de las validaciones en servidor.

## Capa de datos principal

La base principal es PostgreSQL. Prisma usa el schema:

- `prisma/schema.prisma`

El cliente se genera en:

- `prisma/generated/prisma`

La conexion se crea en:

- `lib/prisma.ts`

Detalles:

- Usa `PrismaPg` de `@prisma/adapter-pg`.
- Usa `pg.Pool`.
- Prioriza `POSTGRES_PRISMA_URL`; si no existe, usa `DATABASE_URL`.
- Elimina `sslmode` del connection string antes de crear el pool.
- Soporta SSL mediante `DB_CA_CERT` o `DB_SSL=true`.
- En desarrollo reutiliza singleton global `globalThis.prisma`.

Existe `lib/prisma-fresh.ts`, que crea un cliente nuevo sin singleton global. Esta variante esta pensada para evitar instancias viejas en escenarios especificos.

## Capa de datos legacy MySQL

Hay dos conexiones MySQL/MariaDB:

1. `lib/mysql.ts`
   - Usa `DATABASE_URL_MYSQL`.
   - Tipos generados desde `prisma/schema.mysql.prisma`.
   - Cliente generado en `prisma/generated/prisma-mysql`.
   - Expone `query`, `clientes.findMany`, `clientes.getFilterOptions`, `servicios_prestados.findMany` y `servicios_prestados.getFilterOptions`.

2. `lib/tecnicos.ts`
   - Usa `DATABASE_URL_MYSQL_TECNICOS`.
   - Tipos generados desde `prisma/schema.tecnicos.prisma`.
   - Cliente generado en `prisma/generated/prisma-tecnicos`.
   - Expone una interfaz parecida para clientes y servicios prestados.

Estos helpers hacen SQL manual para simular includes/relaciones de Prisma y normalizar datos para las vistas legacy.

## Storage y archivos

El proyecto usa Supabase Storage para archivos.

Variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Usos principales:

- `app/api/storage/sign-url/route.ts`: crea URLs firmadas de subida.
- `app/api/my-services/[id]/arrival/route.ts`: sube foto de llegada a bucket `fotoLlegada`.
- `app/api/my-services/[id]/finalize/route.ts`: sube factura a `facturas`, comprobante a `comprobantePago` y foto de salida a `fotoSalida`.
- `app/(protected)/dashboard/servicios/actions.ts`: sube factura electronica a `facturaElectronica`, comprobantes a `comprobantePago` y evidencias a `evidencia`.

## Realtime

Supabase Realtime se usa para notificaciones dentro del dashboard.

Canal:

- `dashboard-notifications`

Eventos:

- `service-arrival`: un tecnico registra llegada.
- `service-finalized`: un tecnico finaliza un servicio.
- `product-requested`: un tecnico solicita un insumo.

El cliente que escucha estos eventos es:

- `components/dashboard/realtime-notifications.tsx`

## Notificaciones push

El helper `lib/notifications.ts` usa Expo:

- Busca `pushToken` en `Usuario`.
- Valida el token con `Expo.isExpoPushToken`.
- Envia mensajes con `expo.sendPushNotificationsAsync`.

Se usa al asignar servicios y al responder solicitudes de insumos.

## Correo SMTP

`lib/mail.ts` usa Nodemailer para enviar solicitudes de permisos.

Variables:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `NEXT_PUBLIC_APP_URL`
- `JWT_SECRET`

Los correos incluyen enlaces firmados para aprobar o rechazar permisos desde:

- `app/api/permisos/responder/route.ts`

## Chatwoot

La mensajeria del dashboard usa Chatwoot.

Archivos:

- `lib/chatwoot.ts`
- `lib/chatwoot-types.ts`
- `hooks/use-chatwoot.ts`
- `app/(protected)/dashboard/mensajeria/page.tsx`
- `next.config.ts`

Next.js define un rewrite:

```text
/chatwoot-api/:path* -> NEXT_PUBLIC_CHATWOOT_BASE_URL/:path*
```

Si `NEXT_PUBLIC_CHATWOOT_BASE_URL` no existe, usa `https://app.chatwoot.com`.

El hook mantiene autenticacion Chatwoot en `localStorage` (`cw_auth`, `cw_accounts`, `cw_account_id`), consulta bandejas, conversaciones, mensajes, envia mensajes y cambia estados.

## Auditoria

`lib/audit.ts` expone `createAuditLog`.

Registra en modelo `Auditoria`:

- `tenantId`
- `usuarioId`
- `accion`
- `entidad`
- `entidadId`
- `detalles`
- `metadata`

El helper acepta una transaccion Prisma opcional (`tx`) para registrar auditoria dentro de una misma operacion atomica.

La auditoria se usa en creacion/edicion/eliminacion de clientes, servicios, citas, paquetes, archivos y otras acciones relevantes.

## Monitoreo de actividad

Archivos:

- `hooks/use-activity-monitor.ts`
- `app/api/monitor/log/route.ts`
- `app/api/monitor/report/route.ts`
- `app/(protected)/dashboard/monitoreo/actividad/page.tsx`

El hook del cliente:

- Detecta actividad: mouse, teclado, scroll, click y touch.
- Marca inactividad despues de 5 minutos.
- Registra perdida/recuperacion de foco.
- Envia eventos a `/api/monitor/log`.

La API:

- Crea o reutiliza una `SesionActividad` abierta del dia.
- Crea registros `LogEvento`.
- Suma minutos en `tiempoInactivo` cuando recibe `INACTIVIDAD_DETECTADA`.

El reporte:

- Requiere `ADMIN` o `SU_ADMIN`.
- Lista usuarios activos/inactivos por fecha.
- Calcula estado visual `ONLINE`/`OFFLINE`.

## Cache

`lib/redis.ts` configura Redis opcional por `REDIS_URL`.

Si no existe `REDIS_URL`, devuelve `null` y el sistema sigue funcionando.

En `servicios/actions.ts` se invalida `stats:ordenes:${tenantId}` despues de crear o actualizar ordenes, si Redis esta configurado.

## Serializacion

El proyecto maneja `BigInt`, `Decimal` y `Date` con helpers locales porque Next.js/JSON no serializa todos esos tipos directamente.

Ejemplos:

- `lib/utils.ts` contiene `serializeData`.
- `citas/actions.ts` contiene helper para BigInt/Decimal/Date.
- Varias actions convierten `Decimal` a `Number` antes de retornar datos a componentes.

## UI

El sistema usa:

- Tailwind CSS 4.
- shadcn/ui estilo `new-york`.
- Radix UI para primitives accesibles.
- lucide-react para iconos.
- sonner para toasts.
- Componentes UI en `components/ui`.
- Componentes de layout en `components/dashboard`.

## Build y despliegue

`next.config.ts` usa:

```ts
output: "standalone"
```

El `Dockerfile` usa tres etapas:

1. `deps`: instala dependencias con `npm ci`.
2. `builder`: ejecuta `npm run build`.
3. `runner`: copia `.next/standalone`, `public` y `.next/static`, crea usuario `nextjs` y ejecuta `node server.js`.

El build ejecuta:

```bash
prisma generate && next build
```

## Riesgos arquitectonicos a tener presentes

- El filtrado multi-tenant esta distribuido por modulo. Cambiar una action puede romper aislamiento si se omite `tenantId`.
- Algunas reglas dependen de nombres de estado en texto: `Liquidado`, `Finalizado`, `En Proceso`, `Agendado`, `Cancelado`, `No Concretado`.
- `verifyToken` rechaza usuarios no aprobados; pantallas o endpoints que dependan de usuarios pendientes deben manejarlo aparte.
- Hay diferencias de esquema entre PostgreSQL, MySQL legacy y MySQL tecnicos.
- Los clientes en `prisma/generated` son generados; no se deben editar a mano.
- Algunos endpoints aceptan `Authorization: Bearer ...` y tambien `x-auth-token` para compatibilidad con app/proxy.
