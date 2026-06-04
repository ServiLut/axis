# Sistema de Gestión de Fumigación

Este proyecto es una aplicación web completa diseñada para la gestión operativa de empresas de fumigación y control de plagas. Es un sistema **Multi-Tenant**, lo que permite que múltiples empresas utilicen la plataforma de manera aislada y segura.

## Visión General

El sistema centraliza la operación del negocio, permitiendo la administración de:
- **Clientes y Sedes**: Gestión de base de datos de clientes y sus múltiples direcciones.
- **Órdenes de Servicio**: Ciclo de vida completo del servicio, desde la solicitud hasta la ejecución.
- **Personal Técnico**: Asignación de tareas y seguimiento.
- **Facturación y Reportes**: Control de costos y estados de servicio.

---

## Estructura del Proyecto

El proyecto está construido sobre **Next.js** (App Router). A continuación se detalla la organización de los directorios principales para facilitar la navegación por el código:

### `app/`
Contiene la lógica de enrutamiento y las vistas de la aplicación.
- **`(auth)`**: Rutas públicas relacionadas con la autenticación (Login, Recuperación de contraseña).
- **`(protected)`**: Rutas protegidas que requieren sesión activa. Contiene la lógica principal del negocio (Dashboard, Clientes, Órdenes).
- **`api/`**: Endpoints de la API para comunicación interna y manejo de datos asíncronos.

### `prisma/`
Capa de datos y modelado.
- **`schema.prisma`**: Define el esquema de la base de datos, relaciones entre tablas y tipos de datos. Aquí se configura la conexión a **PostgreSQL**.

### `components/`
Biblioteca de componentes de interfaz de usuario (UI).
- Se prioriza la reutilización de código.
- Contiene elementos como botones, formularios, tablas de datos y modales.
- Utiliza **Radix UI** y **Shadcn** para asegurar accesibilidad y consistencia en el diseño.

### `lib/`
Utilidades y configuraciones globales.
- Funciones auxiliares (helpers), configuración de clientes de base de datos y validaciones compartidas.

---

## Lógica de Negocio y Flujo de Trabajo

### Arquitectura Multi-Tenant
El sistema aísla los datos de cada empresa mediante un identificador único (`tenantId`). Cada consulta a la base de datos filtra estrictamente por este ID para asegurar la privacidad de los datos entre diferentes organizaciones.

### Roles y Permisos (RBAC)
El acceso a las funcionalidades está controlado por roles definidos en el esquema de base de datos:
- **ADMIN**: Acceso total a la configuración de la empresa y gestión de usuarios.
- **ASESOR**: Encargado de la gestión comercial, creación de clientes y agendamiento de órdenes.
- **TÉCNICO**: Personal de campo. Visualiza sus órdenes asignadas y reporta la ejecución del servicio.

### Ciclo de Vida de una Orden de Servicio
1.  **Creación**: Un Asesor registra una solicitud de servicio para un Cliente específico.
2.  **Programación**: Se asigna fecha, hora y un Técnico responsable.
3.  **Ejecución**: El Técnico realiza el servicio, registrando datos operativos (hora de llegada, insumos utilizados, observaciones).
4.  **Finalización**: La orden se marca como completada y queda disponible para facturación o histórico.

---

## Guía de Instalación

Sigue estos pasos para levantar el entorno de desarrollo local:

### 1. Prerrequisitos
- Node.js (versión LTS recomendada)
- npm o yarn

### 2. Instalación de Dependencias
```bash
npm install
```

### 3. Configuración de Base de Datos
Asegúrate de tener un archivo `.env` configurado con las credenciales de tu base de datos (PostgreSQL/Supabase). Luego, sincroniza el esquema de Prisma:
```bash
npx prisma generate
```

### 4. Ejecución
Inicia el servidor de desarrollo:
```bash
npm run dev
```
La aplicación estará disponible en `http://localhost:3000`.

---

## Stack Tecnológico

- **Framework**: Next.js 16
- **Base de Datos**: PostgreSQL (vía Supabase)
- **ORM**: Prisma
- **Estilos**: Tailwind CSS
- **Lenguaje**: TypeScript
