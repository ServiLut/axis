# Axis Software

Axis Software es una aplicacion web de gestion operativa construida con Next.js, React, TypeScript y Prisma. El sistema centraliza procesos de servicios, clientes, tecnicos, citas, contabilidad, insumos, referidos, auditoria, monitoreo de actividad y mensajeria.

El proyecto funciona como una plataforma multi-tenant: un mismo codigo sirve a varios sistemas o empresas, y la mayoria de consultas se filtran por `tenantId` para separar datos. Tambien tiene comportamientos especificos por tenant, por ejemplo:

- `tenantId = 1`: operacion principal de servicios tipo fumigacion/control de plagas y modulo legacy Servilution.
- `tenantId = 2`: modulo legacy de servicio tecnico.
- `tenantId = 4`: operacion de citas/psicologia, consultorios, terapias y paquetes.

## Documentacion del proyecto

La documentacion completa esta separada por tema:

- [Arquitectura](docs/ARQUITECTURA.md): que es el sistema, como funciona por capas y de que depende.
- [Modulos funcionales](docs/MODULOS.md): descripcion de cada modulo del dashboard y de las pantallas publicas.
- [API y flujos](docs/API_Y_FLUJOS.md): endpoints, server actions y flujos principales de negocio.
- [Base de datos](docs/BASE_DE_DATOS.md): modelos Prisma, conexiones PostgreSQL/MySQL, enums y relaciones principales.
- [Referencia tecnica del codigo](docs/CODIGO.md): archivos, exports, responsabilidades y puntos de modificacion.
- [Operacion y mantenimiento](docs/OPERACION.md): instalacion, variables de entorno, scripts, Docker, despliegue y cuidados.

## Stack principal

- Next.js `16.0.10` con App Router.
- React `19.2.1`.
- TypeScript con modo `strict`.
- Prisma 7 con cliente generado localmente en `prisma/generated`.
- PostgreSQL/Supabase como base principal.
- MySQL/MariaDB para integraciones legacy.
- Supabase Storage y Supabase Realtime.
- JWT propio con `jsonwebtoken`.
- Hash de contrasenas con `bcrypt`.
- Tailwind CSS 4, Radix UI, shadcn/ui y lucide-react.
- Chatwoot mediante proxy interno de Next.js.
- Expo Push Notifications.
- Nodemailer para correos SMTP.
- Redis opcional para cache/invalidadcion.

## Estructura general

```text
app/                         Rutas Next.js, paginas, API routes y server actions.
components/                  Componentes de UI, dashboard, contabilidad y acciones visuales.
hooks/                       Hooks client-side: rol de usuario, Chatwoot y monitoreo de actividad.
lib/                         Clientes de datos, autenticacion, auditoria, correo, Redis y helpers.
prisma/                      Schemas Prisma, clientes generados y configuraciones de base de datos.
scripts/                     Scripts de diagnostico, revision y mantenimiento puntual.
public/                      Assets publicos.
supabase/                    Configuracion local de Supabase.
types/                       Declaraciones TypeScript adicionales.
backups/                     Respaldos/dumps locales del proyecto.
```

## Instalacion local

Requisitos:

- Node.js 22 recomendado.
- npm o pnpm. El proyecto incluye `package-lock.json`, `pnpm-lock.yaml` y `pnpm-workspace.yaml`.
- Acceso a las bases configuradas por variables de entorno.

Instalar dependencias:

```bash
npm install
```

Generar Prisma principal:

```bash
npx prisma generate
```

Generar clientes legacy si se necesitan:

```bash
npm run generate:mysql
npm run generate:tecnicos
```

Levantar desarrollo:

```bash
npm run dev
```

Compilar produccion:

```bash
npm run build
```

## Nota critica de mantenimiento

Este proyecto tiene multiples flujos acoplados a nombres de modelos, campos, estados y roles. Antes de cambiar codigo funcional, revisar:

- Las acciones en `app/(protected)/dashboard/**/actions.ts`.
- Las API routes en `app/api/**/route.ts`.
- Los schemas `prisma/schema.prisma`, `prisma/schema.mysql.prisma` y `prisma/schema.tecnicos.prisma`.
- Los clientes Prisma generados en `prisma/generated/`.
- La documentacion de [API y flujos](docs/API_Y_FLUJOS.md) y [base de datos](docs/BASE_DE_DATOS.md).

Los archivos generados de Prisma no deben editarse manualmente.
