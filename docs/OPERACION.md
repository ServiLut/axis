# Operacion y mantenimiento

## Requisitos

- Node.js 22 recomendado.
- npm o pnpm.
- Acceso a PostgreSQL/Supabase.
- Acceso opcional a bases MySQL legacy.
- Acceso opcional a Redis.
- Acceso opcional a SMTP.
- Acceso opcional a Chatwoot.
- Acceso opcional a Expo Push para notificaciones moviles.

## Scripts disponibles

Definidos en `package.json`:

| Script | Uso |
|---|---|
| `npm run dev` | Levanta Next.js en desarrollo. |
| `npm run build` | Ejecuta `prisma generate` y `next build`. |
| `npm run start` | Inicia servidor Next.js de produccion. |
| `npm run lint` | Ejecuta ESLint. |
| `npm run sb:init` | Inicializa Supabase local. |
| `npm run sb:start` | Inicia Supabase local. |
| `npm run sb:stop` | Detiene Supabase local. |
| `npm run seed:nomina` | Ejecuta seed de nomina si existe el archivo correspondiente. |
| `npm run db:pull:mysql` | Introspecciona base MySQL legacy. |
| `npm run generate:mysql` | Genera cliente Prisma MySQL legacy. |
| `npm run db:pull:tecnicos` | Introspecciona base MySQL tecnicos. |
| `npm run generate:tecnicos` | Genera cliente Prisma tecnicos. |

## Instalacion

Instalar dependencias:

```bash
npm install
```

Generar Prisma principal:

```bash
npx prisma generate
```

Generar clientes legacy si se usan vistas legacy:

```bash
npm run generate:mysql
npm run generate:tecnicos
```

Levantar desarrollo:

```bash
npm run dev
```

Compilar:

```bash
npm run build
```

## Variables de entorno

### Base principal

| Variable | Requerida | Uso |
|---|---:|---|
| `POSTGRES_URL_NON_POOLING` | Si se usa Prisma CLI con `prisma.config.ts` | URL directa/no pooling para Prisma config. |
| `POSTGRES_PRISMA_URL` | Recomendada | URL usada por `lib/prisma.ts`, ideal para pool transaccional/serverless. |
| `DATABASE_URL` | Alternativa | Fallback para `lib/prisma.ts`. |
| `DB_CA_CERT` | Opcional | Certificado CA para SSL estricto. |
| `DB_SSL` | Opcional | Si es `"true"`, usa SSL con `rejectUnauthorized: false`. |

### Bases legacy

| Variable | Requerida | Uso |
|---|---:|---|
| `DATABASE_URL_MYSQL` | Si se usa Servilution | Conexion MySQL para `lib/mysql.ts` y `schema.mysql.prisma`. |
| `DATABASE_URL_MYSQL_TECNICOS` | Si se usa Serv. Tecnico | Conexion MySQL para `lib/tecnicos.ts` y `schema.tecnicos.prisma`. |

### Autenticacion

| Variable | Requerida | Uso |
|---|---:|---|
| `JWT_SECRET` | Si | Firma de tokens de sesion y enlaces de permisos. |

Nota:

- Si no existe `JWT_SECRET`, el codigo usa `default-secret`. Eso solo deberia ocurrir en desarrollo local controlado.

### Supabase

| Variable | Requerida | Uso |
|---|---:|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Si | Cliente browser y server para realtime/storage. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Si para realtime browser | Cliente publico de Supabase Realtime. |
| `SUPABASE_SERVICE_ROLE_KEY` | Si para subidas server | API routes/actions que suben a Storage. |

Buckets usados:

- `turno`
- `fotoLlegada`
- `fotoSalida`
- `facturas`
- `facturaElectronica`
- `comprobantePago`
- `evidencia`

### Chatwoot

| Variable | Requerida | Uso |
|---|---:|---|
| `NEXT_PUBLIC_CHATWOOT_BASE_URL` | Opcional | Destino del rewrite `/chatwoot-api/:path*`. |

Si no existe, se usa:

```text
https://app.chatwoot.com
```

### Correo

| Variable | Requerida | Uso |
|---|---:|---|
| `SMTP_HOST` | Para permisos por correo | Host SMTP. |
| `SMTP_PORT` | Opcional | Puerto SMTP, default `465`. |
| `SMTP_USER` | Para permisos por correo | Usuario/remitente SMTP. |
| `SMTP_PASS` | Para permisos por correo | Password SMTP. |
| `NEXT_PUBLIC_APP_URL` | Recomendada | URL base para enlaces de aprobar/rechazar permisos. |

### Redis

| Variable | Requerida | Uso |
|---|---:|---|
| `REDIS_URL` | Opcional | Cache/invalidadcion de estadisticas. |

Si no existe, `redis` queda en `null` y la app sigue funcionando.

### Entorno

| Variable | Uso |
|---|---|
| `NODE_ENV` | Controla singleton de clientes y logs de desarrollo. |
| `NEXT_TELEMETRY_DISABLED` | Se define en Docker para deshabilitar telemetria. |
| `PORT` | Puerto en runner Docker. |
| `HOSTNAME` | Host en runner Docker. |

## Docker

Archivo:

- `Dockerfile`

Etapas:

1. `deps`
   - Base `node:22-bookworm-slim`.
   - Instala `openssl`.
   - Copia `package.json`, `package-lock.json` y `prisma`.
   - Ejecuta `npm ci`.

2. `builder`
   - Copia `node_modules`.
   - Copia todo el proyecto.
   - Ejecuta `npm run build`.
   - Usa cache de Next en `/app/.next/cache`.

3. `runner`
   - Crea usuario no root `nextjs`.
   - Copia `public`, `.next/standalone` y `.next/static`.
   - Expone puerto `3000`.
   - Ejecuta `node server.js`.

Requisito:

- `next.config.ts` tiene `output: "standalone"`.

## Configuracion Next.js

Archivo:

- `next.config.ts`

Configuraciones:

- `output: "standalone"` para Docker/produccion.
- Permite imagen remota de `i.pravatar.cc`.
- Define rewrite `/chatwoot-api/:path*`.

## TypeScript

Archivo:

- `tsconfig.json`

Caracteristicas:

- `strict: true`.
- `moduleResolution: "bundler"`.
- Alias `@/*` apunta a raiz del proyecto.
- Incluye archivos `.ts`, `.tsx`, `.mts` y tipos generados de Next.

## UI y Tailwind

Archivos:

- `components.json`
- `app/globals.css`
- `postcss.config.mjs`

shadcn/ui:

- Estilo `new-york`.
- `baseColor: stone`.
- Iconos `lucide`.
- Aliases:
  - `@/components`
  - `@/components/ui`
  - `@/lib`
  - `@/hooks`

## Prisma y generated files

No editar manualmente:

- `prisma/generated/prisma`
- `prisma/generated/prisma-mysql`
- `prisma/generated/prisma-tecnicos`

Modificar primero:

- `prisma/schema.prisma`
- `prisma/schema.mysql.prisma`
- `prisma/schema.tecnicos.prisma`

Luego generar:

```bash
npx prisma generate
npm run generate:mysql
npm run generate:tecnicos
```

## Backups y dumps

Directorio:

- `backups/`

Contenido observado:

- `dump_data.sql`
- paquetes JSON de sesiones realizadas.

Uso:

- Respaldos manuales o exportaciones operativas.

Precaucion:

- No asumir que todos los archivos de backup estan versionados.
- Revisar `git status` antes de borrar o mover respaldos.

## Logs locales

Archivos observados:

- `lint_output.log`
- `lint_remaining.log`
- `lint_remaining_2.log`
- `tsc_output.log`
- `tsc_full.log`
- `list_files.log`

Uso:

- Evidencia de lint, TypeScript o inventarios previos.

Precaucion:

- Pueden estar desactualizados respecto al codigo actual.

## Seguridad operacional

### JWT

- Cambiar `JWT_SECRET` invalida tokens existentes.
- No usar `default-secret` en produccion.
- Los enlaces de permisos por correo tambien dependen de `JWT_SECRET`.

### Service role de Supabase

- `SUPABASE_SERVICE_ROLE_KEY` permite operaciones privilegiadas.
- Nunca debe exponerse al cliente.
- Solo se usa en server routes/actions.

### Multi-tenant

Antes de crear o modificar actions:

- Obtener usuario desde token.
- Confirmar `tenantId`.
- Si no es `SU_ADMIN`, filtrar por `tenantId`.
- Validar que entidades modificadas pertenecen al tenant.

### Roles

No confiar solo en sidebar.

El sidebar oculta rutas, pero las actions/API deben validar rol en servidor.

### Estados por texto

No renombrar estados o metodos de pago sin revisar:

- Dashboard.
- Programacion.
- Seguimiento.
- Contabilidad.
- App tecnica.

## Checklist antes de tocar logica

1. Identificar modulo afectado.
2. Leer la action/API correspondiente.
3. Revisar modelos Prisma relacionados.
4. Confirmar filtros por `tenantId`.
5. Confirmar roles permitidos.
6. Revisar auditoria si la accion modifica datos sensibles.
7. Revisar revalidacion de rutas.
8. Revisar efectos en app tecnica y Supabase Storage/Realtimes si aplica.
9. Revisar si hay dependencias de nombres/IDs de estados.
10. Ejecutar lint/build/pruebas pertinentes.

## Pruebas y verificacion

Comandos disponibles:

```bash
npm run lint
npm run build
```

No hay script dedicado de test en `package.json`.

Para cambios en Prisma:

```bash
npx prisma generate
```

Para cambios en clientes legacy:

```bash
npm run generate:mysql
npm run generate:tecnicos
```

## Mantenimiento de documentacion

Cuando se agregue un modulo:

- Documentar ruta en `docs/MODULOS.md`.
- Documentar endpoints/actions en `docs/API_Y_FLUJOS.md`.
- Documentar modelos nuevos en `docs/BASE_DE_DATOS.md`.
- Documentar variables nuevas en `docs/OPERACION.md`.

Cuando se agregue una variable de entorno:

- Agregarla en `docs/OPERACION.md`.
- Indicar si es requerida u opcional.
- Indicar que archivo la consume.

Cuando se agregue un flujo de negocio:

- Documentar pasos.
- Documentar modelos que toca.
- Documentar roles permitidos.
- Documentar eventos, notificaciones o archivos si existen.

## Problemas comunes

### Token invalido despues de login

Posibles causas:

- Usuario no aprobado.
- Usuario inactivo.
- `JWT_SECRET` cambio.
- Token expirado.
- Token guardado viejo en `localStorage`.

### No se ven modulos en sidebar

Posibles causas:

- `useUserRole` no pudo decodificar token.
- Rol no esta presente en JWT.
- Tenant no cumple regla del modulo.
- Usuario no tiene rol permitido.

### No suben archivos

Revisar:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- Existencia del bucket.
- Permisos del bucket.
- Tamano/tipo del archivo.

### Chatwoot no conecta

Revisar:

- `NEXT_PUBLIC_CHATWOOT_BASE_URL`.
- Rewrite `/chatwoot-api`.
- Credenciales Chatwoot.
- CORS/proxy si se despliega detras de Nginx.

### Reportes no cuadran

Revisar:

- Nombres de estados.
- Metodo de pago `por cobrar`.
- `tenantId`.
- Fechas y zona horaria.
- Valores `Decimal` convertidos a numero.

### App tecnica no autentica detras de proxy

Revisar:

- Header `Authorization`.
- Header `x-auth-token`.
- Configuracion de Nginx/proxy para reenviar headers.

## Archivos criticos

No tocar sin revisar impacto:

- `lib/auth.ts`
- `lib/prisma.ts`
- `app/api/sign-in/route.ts`
- `app/api/my-services/[id]/finalize/route.ts`
- `app/(protected)/dashboard/servicios/actions.ts`
- `app/(protected)/dashboard/citas/actions.ts`
- `prisma/schema.prisma`
- `next.config.ts`

## Resumen de dependencias externas

- PostgreSQL/Supabase: persistencia principal.
- Supabase Storage: archivos.
- Supabase Realtime: notificaciones del dashboard.
- MySQL/MariaDB: lectura legacy.
- Redis: cache opcional.
- SMTP: aprobacion de permisos por correo.
- Chatwoot: mensajeria.
- Expo: push notifications.
- Docker: empaquetado de produccion.
