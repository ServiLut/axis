# Plan de registro propio de servicios de Miguel Ángel

Fecha de diseño: 10/10/2026. **Estado: plan para revisión; registro Miguel no implementado, no configurado ni desplegado por este documento.** No acredita acceso al programa, identidad técnica, autorización de escritura, migración aplicada o un servicio guardado. Las etapas siguientes tienen condiciones de cierre separadas.

## 1. Base de código verificada y límites

Repositorios examinados:

- Runtime W: `C:/Users/ADMIN/.codex/worktrees/psicologia-registro-recaudos/axis`.
- Backend Tenaxis T: `C:/Users/ADMIN/Downloads/axis/.tmp/maria-program-tenaxis-20261008`.

Se leyó `T/AGENTS.md`: backend NestJS, PostgreSQL y Prisma dentro de la API; DTOs validados y aislamiento multitenant en cada operación. No se requiere un frontend ni otra tecnología para este contrato.

La referencia implementada de María está en `T/apps/api/src/integrations/maria-service-registration/`. Su controlador ofrece POST raíz, `/status`, `/receipt` y `/customer-status`; su servicio verifica actor, empresa, datos literales, cotización aceptada, duplicados y recibo. Utiliza transacción serializable y bloqueo por contacto; crea cliente/dirección cuando procede, orden, recibo y auditoría juntos. `OrdenServicio.creadoPorId` contiene la membership del asesor; el recibo contrasta ese creador.

Esa referencia aporta patrones técnicos. **No aporta a Miguel tenant, empresa, actor, token, catálogo, tarifa, aceptación o permisos.** No utilizar las constantes `MARIA_*`, rutas de María, tabla `maria_service_registrations` ni sus fuentes de precios para resolver valores pendientes de S.TECNICO. No cambiar el contrato de María para admitir otra empresa.

En W, `maria-program.mjs` limita `programEnabled` a `fumigacion`, valida su destino y actor propios, y requiere fuentes nativas textuales. El estado público distingue S.TECNICO sin atribuirle el registro María. La comprensión IA propia de Miguel es una capacidad distinta: sus slots/intenciones no acreditan una escritura de negocio.

## 2. Datos y decisiones que siguen pendientes

| Requisito | Evidencia disponible | Condición para cerrar |
|---|---|---|
| Tenant de producción de S.TECNICO | No verificado para este contrato. | Lectura propia autenticada de tenant activo y documento de alcance aprobado. No usar fixtures o UUIDs de María. |
| Empresa S.TECNICO | Nombre operativo en W; identificador y vínculo real al tenant pendientes. | Empresa activa, no eliminada, identidad y tenant concordantes en Tenaxis. |
| Actor exclusivo Miguel | No creado ni verificado. | Membership propia aprobada, activa, alcance exclusivo y atribución acordada; usuario sin login interactivo si se adopta ese diseño. |
| Catálogo real | No se verificaron IDs, nombres, actividad, cobertura o reglas de los servicios de S.TECNICO. | Lectura mínima del catálogo de la empresa, mapeo aprobado por servicio/equipo y versionado de su política. |
| Alcance de la oferta | Las palabras del cliente no prueban que se ofrezca reparación, pintura, transporte o visita. | Capacidad verificada del servicio concreto. La solicitud de pintura conserva revisión hasta su confirmación propia. |
| Precio y aceptación | No existe tabla de precios técnica aprobada verificada en esta auditoría. | Definir qué acepta el cliente: recepción de solicitud, visita/diagnóstico con costo, o reparación cotizada. Definir fuente, vigencia, impuestos y alcance del importe cuando aplique. |
| Registro sin cotización | El esquema permite `valorCotizado=null`; eso no autoriza esta operación. | Decidir si Miguel puede guardar una solicitud pendiente de cotización y cuál es el consentimiento literal necesario. Si se permite, conservar precio desconocido como null; cero no significa precio aceptado. |
| Líneas y continuidad | W define dos líneas propias de S.TECNICO; el alcance operativo debe revalidarse. | Instancia/propietario nativos, líneas autorizadas, cutoff y reglas para casos con fuentes de otra línea. No trasladar la excepción azul de María. |
| Credencial de registro | No aprovisionada en este trabajo. | Token exclusivo de este contrato, destino HTTPS verificado, operaciones acotadas, inicio/expiración y revocación. La clave OpenAI no es acceso a Tenaxis. |

No hay valores de tenant, empresa, actor o servicio propuestos como sustitutos. Estos pendientes impiden habilitar escrituras. La consulta TESA de disponibilidad/cotización sigue limitada al caso: una respuesta operacional no es un catálogo general ni acredita que una reparación esté realizada.

## 3. Contrato propuesto, pendiente de revisión

### Backend independiente

Ruta propuesta: `/integrations/miguel-service-registration`. Debe instalarse y verificarse en el backend real antes de configurar W. No se presupone que exista hoy.

| Operación propuesta | Entrada y salida mínima | Límite |
|---|---|---|
| POST `/status` | Body vacío; identidad propia verificada, vigencia, versión/guardas, catálogo/política aplicable, capacidad de escritura y existencia de la tabla de recibos. | Read-only; no token ni datos de clientes. |
| POST `/catalog` | Consulta mínima acotada al servicio necesario; IDs reales activos, oferta y versión de política. | Read-only, solo S.TECNICO. No presupone un precio fijo. |
| POST raíz | Solicitud confirmada y fuentes; devuelve recibo persistido del mismo hash/caso. | Solo alta propia aprobada; ningún tenant/empresa/actor del body decide el alcance. |
| POST `/receipt` | Clave durable propia de caso/confirmación y hash. | Recupera el resultado tras timeout sin repetir un POST de escritura. |
| POST `/customer-status` | Teléfono canónico conocido. | Estado mínimo necesario para duplicados/continuidad; no resuelve LID ni expone identidad adicional. |

La configuración del servidor, ligada a la credencial autenticada, fija el tenant, la empresa y el actor aprobados. El body no puede cambiar esos valores. El patrón de autenticación técnica restringida debe someterse al mismo control de alcance del backend; no emitir un token general o credenciales del personal.

### Solicitud de alta

Campos previstos: versión de contrato, `caseId`, teléfono canónico, línea propia, fuente de confirmación, nombre y dirección literales, municipio, detalles de ubicación y servicio de catálogo real. Datos técnicos: equipo y falla reportados, con fuentes; no transformarlos en diagnóstico comprobado. La preferencia de día/franja permanece como preferencia.

La política revisada definirá un discriminante explícito para el tipo de registro. Si se exige cotización, incluir servicio y alcance, importe, política/fuente vigente, MID propio entregado, fecha y aceptación nativa inequívoca. Si se autoriza registrar una solicitud pendiente de cotización, su confirmación debe describir exactamente esa solicitud y no afirmar precio, reparación o agenda aceptados. Hasta decidirlo no existe una gramática Miguel aprobada que pueda implementarse copiando `mariaAcceptsQuotation`.

Cada dato persistido debe tener su fuente nativa completa: MID, línea, remitente, fecha, texto, `fromMe=false` y `forwarded=false`. Nombre y dirección se separan de etiquetas y envolturas conversacionales; no crear correos, actividad, tipo de inmueble o horarios ficticios. Una corrección exige una confirmación nueva del resumen propio entregado. Reutilizar datos anteriores solo si pertenecen al mismo caso/línea y siguen vigentes.

El backend debe validar otra vez catálogo, actor y empresa, literalidad, confirmación, tiempo, duplicados, cliente/dirección bloqueados y condiciones del servicio. Un precio o campo generado por IA no es fuente autorizada. Audio, imágenes y formularios binarios quedan fuera de esta primera versión; su futura incorporación exige contrato de derivación trazable y validación independiente.

### Escritura y autoría

Estado objetivo inicial, sujeto al contrato revisado: orden nueva pendiente de programación, `creadoPorId` de Miguel, sin técnico, fecha/hora confirmada, ejecución, pago, garantía o repuestos inferidos. El importe solo se guarda si el modo aprobado tiene una cotización verificada; la falta de importe no se rellena con una tarifa de María.

Crear de forma atómica la orden y un recibo exclusivo `MiguelServiceRegistration`, junto con cliente/dirección nuevos cuando proceda y auditoría atribuida a la membership Miguel. Recibo mínimo: tenant, empresa, actor/creador, caso, confirmación, hash canónico, orden y fecha; lectura posterior debe comprobar la orden actual y su creador. Un recibo de María o de otra empresa nunca satisface esta operación.

Índices durables: unicidad por tenant/empresa/caso, por tenant/empresa/confirmación y por orden. Misma clave con otro hash debe provocar revisión, no una segunda orden. Bloqueo por tenant/empresa/contacto y transacción serializable; documentar la coordinación con escritores humanos, sin prometer ausencia universal de carreras.

## 4. Archivos exactos previstos

Todos son **trabajo futuro**. Este plan no los crea ni modifica.

### Backend T

Directorio nuevo `apps/api/src/integrations/miguel-service-registration/`:

- `miguel-service-registration.config.ts`: alcance exclusivo, vigencia y validación de configuración; sin fallback María.
- `miguel-service-registration.dto.ts`: DTOs cerrados y discriminantes del contrato aprobado.
- `miguel-service-policy.ts`: servicio real, capacidad y reglas de confirmación/cotización propias, después de verificar el catálogo.
- `miguel-service-registration.service.ts`: autenticación, identidad, validación, transacción, escritura, recibo, auditoría y lecturas acotadas.
- `miguel-service-registration.controller.ts`, `miguel-service-registration.module.ts` y `miguel-service-registration.bootstrap.ts`: rutas y límites HTTP independientes.
- `miguel-service-registration.spec.ts`, `miguel-service-registration.postgres.spec.ts` y `miguel-service-registration.bootstrap.spec.ts`: contrato, aislamiento, atomicidad y validación HTTP.

Cambios puntuales previstos en `apps/api/src/app.module.ts`, `apps/api/src/main.ts` y `apps/api/prisma/schema.prisma`. Migración candidata nueva bajo `apps/api/prisma/candidate-migrations/<marca-temporal-real>_miguel_service_registration/migration.sql`; asignar su nombre al implementarla, sin editar migraciones históricas. Revisar promoción y preflight con `apps/api/prisma/scripts/assert-production-migrations.js` y `frozen-migration-history.js` según el flujo vigente. La tabla/índices de María permanecen con su contrato.

### Runtime W

- Nuevo `automation/service-bots/miguel-program.mjs`: configuración/instalación propia, intake confirmado, hash durable, fuentes nativas, estados y reconciliación de recibo.
- Nuevo `automation/service-bots/miguel-service-policy.mjs`: representación mínima del catálogo/política técnica verificados; datos desconocidos no habilitan registro.
- Cambios puntuales en `config.mjs`, `server.mjs`, `engine.mjs` y `transport.mjs` para invocar únicamente el módulo propio cuando `company==='servicio-tecnico'`.
- Setup propuesto separado `/miguel-program-setup`, con persistencia cifrada, y variables propuestas `BOT_MIGUEL_PROGRAM_ENABLED`, `BOT_MIGUEL_PROGRAM_URL`, `BOT_MIGUEL_PROGRAM_TOKEN`, `BOT_MIGUEL_PROGRAM_ACTOR_ID`, `BOT_MIGUEL_PROGRAM_STARTS_AT_UTC`, `BOT_MIGUEL_PROGRAM_EXPIRES_AT_UTC`. Nombres todavía no implementados; IDs y URL deben venir del contrato verificado.
- Nuevos `tests/miguel-program.test.mjs` y `tests/miguel-program-drain-order.test.mjs`.

El setup debe verificar `/status`, identidad, actor, catálogo/política, guardas y ventana temporal antes de habilitar el módulo. Reservar el intento cifrado antes del POST. Estados previstos `PENDING/SENDING/UNCERTAIN/SAVED/REVIEW`; timeout o caída tras intento lleva a consulta de recibo, nunca a escritura repetida automática.

Procesar primero los turnos pendientes del cliente; revalidar atención humana, fuentes, aceptación/confirmación, caso y línea antes de escribir y antes de confirmar al cliente. Conservar intervención humana, conflictos LID, cancelaciones, cambio de alcance, posservicio, pagos y capacidades no verificadas en revisión. Un caso nuevo debe ser una solicitud expresa, no una aclaración que mencione otro equipo.

La confirmación pública se prepara únicamente tras recibo propio verificado. Si el personal tomó el chat, conservar recibo y autoría y suprimir la salida automática. La capacidad de registrar no incluye programar, cobrar, ejecutar ni liberar holds.

## 5. Etapas y evidencia de cierre

| Etapa | Estado actual | Evidencia requerida para cerrarla |
|---|---|---|
| Diseño | Este documento, pendiente de revisión del root y decisiones de alcance. | Contrato y pendientes de sección 2 resueltos con evidencia propia. |
| Identidad y catálogo | Pendientes. No actor/token creados. | Lectura de tenant/empresa/catálogo y aprobación concreta de actor/operaciones/confirmación. |
| Backend | No implementado por este trabajo. | DTOs/servicio/recibo/migración revisados; pruebas aisladas y build; diff independiente del contrato María. |
| Runtime | No implementado por este trabajo. | Guards propias, estados y pruebas; ningún secreto en Git; regresiones de María intactas. |
| Publicación y configuración | No realizadas. | Autorización vigente para el paso, revisión del material; commit/hash instalado por aplicación y API propia con identidad/guardas verificadas sin secretos. |
| Primer registro legítimo | Pendiente. | Solicitud real posterior al corte, confirmación válida, orden/recibo/auditoría y creador Miguel; confirmación pública entregada cuando proceda. No fabricar cliente, replay o alta de prueba en producción. |

Pruebas mínimas futuras: alcance incorrecto o expirado, actor ajeno/inactivo, catálogo no vigente, precio/fuente no aprobados, literalidad de nombre/dirección, confirmación ausente o negada, resumen corregido, otra línea/caso, intervención humana entre pasos, LID sin PN, nuevos turnos antes de escritura, duplicados/carreras/rollback, timeout después de commit y reconciliación sin doble POST, recibo/creador discordantes y separación completa de FUMIGACION.

No se ejecutan esas pruebas con este plan. Las pruebas aisladas futuras no acreditarán la primera escritura real. El resultado esperado es una capacidad de registro acotada y trazable; no se declara autonomía completa.

## 6. Revisión y commit

Este cambio contiene solo `docs/MIGUEL_REGISTRO_SERVICIOS_PLAN.md`. Root debe revisar el documento antes de su commit. No incluir configuraciones privadas, tokens, valores de claves, paquetes de evidencia con clientes ni archivos de trabajo ajenos. La implementación futura requerirá commits separados en W y T y verificación independiente de sus despliegues; este documento no registra aprobación o publicación.
