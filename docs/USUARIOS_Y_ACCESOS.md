# Usuarios y accesos

Ruta: **Equipo de Trabajo → Usuarios y accesos**.

- Buscar por nombre o usuario; filtrar activos y suspendidos.
- **Contraseña**: ingresar dos veces la nueva clave (mínimo 8 caracteres). Se
  guarda con bcrypt; no se muestra ni se incorpora a la auditoría.
- **Suspender**: requiere un motivo, conserva la persona y su historial.
- **Reactivar**: permite un nuevo inicio de sesión, sin recuperar tokens viejos.
- El cambio de contraseña no reactiva a un usuario suspendido.
- Para la cuenta propia se usa Perfil. No se permite autosuspensión ni dejar al
  sistema sin administrador activo.

La pantalla y sus acciones requieren administrador activo y aprobado. Operan
solo en el tenant actual. Un administrador no puede modificar superadministradores.
El actor y el objetivo se vuelven a comprobar dentro de la transacción. Toda
mutación se revierte si no puede guardarse su auditoría.

## Revocación

`Usuario.authVersion` aumenta al cambiar contraseña, suspender o reactivar. La
validación de cada token comprueba activo, aprobado, rol, tenant y versión en la
BD. Las 188 llamadas existentes se adaptaron a esperar esta comprobación. Los
tokens anteriores a la migración se aceptan solamente como versión cero para
cuentas sin cambios. No se cambió el secreto compartido ni se cerraron cuentas
ajenas a la operación.

El navegador consulta el estado al navegar, recuperar visibilidad y cada 30
segundos. Los datos que ya estaban visibles no pueden retirarse retroactivamente;
los nuevos accesos protegidos se rechazan al validar la cuenta suspendida.
El monitor de actividad ahora exige token y toma el usuario de ese token.

Aplicar **antes del despliegue** `docs/sql/2026-09-26-user-access.sql`. Es una
columna aditiva con valor inicial cero. Generar Prisma y desplegar el código.

No usar `SesionActividad.fechaFin` para revocar permisos: no es una lista de
sesiones autenticadas y modificarla destruiría evidencia histórica.

## Operación autorizada del 26/09/2026

Se suspendió la cuenta administrativa ID 149, username `EvelinMaria08`, con
auditoría 24116; se revocó su versión anterior. No se modificó la cuenta de la
psicóloga Evelin Correa ni los registros históricos de sesiones, citas o pagos.
El informe privado del 27/08 al 22/09 se conserva fuera de Git. Registra actividad
del navegador y horarios de agenda, no horas certificadas de presencia física.

Pruebas: `npx tsx --test tests/user-access.test.ts` y regresión de Psicología.
