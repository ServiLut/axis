# Integración de Psicólogos en Colombia

**Actualización del 28/09:** el transporte, recepción, IA de texto y transcripción ya fueron habilitados y comprobados. Este archivo conserva la secuencia histórica, incluidas limitaciones de versiones anteriores. El alcance actual y los pendientes se mantienen en [PSICOLOGOS_AUTONOMIA.md](PSICOLOGOS_AUTONOMIA.md). No interpretar los apartados históricos como el estado más reciente ni una prueba sintética como evidencia de agendamiento real.

## Recepción duradera — implementación del 28/09/2026

Endpoint separado: `POST /api/integrations/psicologos/automation`. La clave de
consulta anterior conserva acceso de solo lectura. La recepción requiere
`PSICOLOGOS_AUTOMATION_ENABLED`, `PSICOLOGOS_AUTOMATION_TOKEN_HASH`,
`PSICOLOGOS_CHATWOOT_TOKEN` y `PSICOLOGOS_EVOLUTION_TOKEN`; secretos fuera de Git.
Aplicar primero `docs/sql/2026-09-28-psychology-automation.sql`.

`PsicologiaBotConfig.enabled` inicia en falso. Activar solo después de comprobar
el despliegue, identidad del número, respuestas rápidas y workflow autenticado.
La plantilla exportable está en `automation/n8n/psicologos-recepcion.json`, con
referencias de credenciales de ejemplo. El flujo real debe conservar su proyecto
PSICOLOGOS EN COLOMBIA y no guardar payloads de ejecución, ni siquiera en errores:
Evolution incluye una clave en su envelope y el nodo inicial la descarta.

El sistema guarda eventos antes de acusar recibo, usa identificadores únicos y
una bandeja de salida duradera. Un envío de resultado incierto no se repite:
queda pendiente de revisión. Una respuesta de una persona pausa el chat y
cancela mensajes automáticos aún pendientes. El silencio durante atención humana
no impide avisar a Sandra si llega una nueva señal urgente.

La aclaración de Sandra, reproducida por la titular el 28/09, es:
sesión suelta: abono de 20.000 COP descontable del total; paquete: pago único;
paquete ya pagado: sin nuevo anticipo. Inasistencia: abono no reembolsable según
la política comunicada. Cancelaciones, excepciones y reprogramaciones se revisan
con Sandra. No crear multas ni devolver dinero automáticamente. Las plantillas y
la regla aprobada quedan versionadas en la configuración y Auditoria.

### Controles desde el número autorizado de Sandra

- `ESTADO BOT`: cantidades pendientes, atención humana y envíos por verificar.
- `PAUSAR 573001234567` / `REANUDAR 573001234567`: control del chat indicado.
- `POLITICA PAGO ABONO 20000`: conserva la política expresamente acordada.
- `RESERVAR telefono servicioID profesionalID consultorioID YYYY-MM-DD HH:mm HH:mm`:
  crea una propuesta, no una cita inmediata. Para modalidad virtual se usa
  `VIRTUAL` en lugar del consultorio. Los ID se verifican en Axis, tenant4/empresa3.
- Cliente y profesional aceptan con `CONFIRMAR CODIGO`. Una persona diferente
  no puede confirmar. En alquiler el profesional registrado es el solicitante.
- `SOPORTE CODIGO URL`: Sandra asocia un archivo existente del almacenamiento
  de comprobantes de Psicólogos que ya revisó. No acredita un abono bancario.

La propuesta expira como máximo a las 24 horas o al comenzar el horario.
Al registrar, la transacción revisa de nuevo profesional, precio, consultorio,
agenda y paquete, bloquea las reservas concurrentes y crea auditoría y mensajes
en la misma transacción. Una sesión de paquete consumido no vuelve a generar
el precio del paquete. Alquiler no exige soporte anticipado. Un paquete pagado
con movimientos completos en el libro no requiere otro comprobante por sesión.

### Límites que deben seguir visibles

El alta de pacientes, interpretación libre de fechas, audios, casos clínicos,
imágenes y correcciones de registros requieren revisión humana en esta versión.
No atribuirle transcripción automática, diagnóstico, confirmación bancaria,
vigilancia continua ni un agendamiento libre sin intervención. Las propuestas
se preparan con el comando autorizado; el resto del proceso confirma y registra.
Los reportes anteriores no se reemplazan ni se duplican desde este flujo.

Verificación: `tsx --test tests/psychology-reception.test.ts
tests/psychology-bot-booking.test.ts tests/psychology-bot.test.mjs
tests/psychology-integration.test.ts`; TypeScript y compilación Next. La
compilación local utiliza valores ficticios y no conecta al banco ni a WhatsApp.
La prueba de mensajes de producción solo se realiza con Sandra, sin pacientes
ficticios ni citas artificiales.

## Estado de esta entrega

Base comprobable, todavía no es un bot autónomo de producción. No interpretar
el éxito de las pruebas sintéticas como envío de WhatsApp, alta de pacientes o
registro de citas. Ámbito exclusivo: tenant 4, empresa 3.

- Reglas deterministas: `lib/psychology-bot-policy.mjs`.
- Casos ficticios: `node --test tests/psychology-bot.test.mjs` (56 pruebas).
- Generación del flujo: `node scripts/build-psychology-n8n-tests.mjs`.
- Artefacto: `automation/n8n/psicologos-luisa-pruebas.json`.
- Flujo importado en el proyecto n8n `EhbXYnreuotCXRlY`, workflow
  `FSJEzWYneXyl7sC4`: versión 2026-09-26.2 con 54 casos, disparador manual, sin envíos.
- API de consulta: `/api/integrations/psicologos`.
- La antigua función `sendCitaToPsicologo` devolvía éxito sin transporte.
  Ahora devuelve un error explícito hasta que exista evidencia de envío.

## API de consulta

Sólo GET. Usa `Authorization: Bearer <clave dedicada>`. Se habilita con
`PSICOLOGOS_N8N_ENABLED=true` y `PSICOLOGOS_N8N_TOKEN_HASH`, SHA-256 hex de la
clave. Sin ambas variables devuelve 503; clave incorrecta, 401. El servidor
almacena únicamente el hash. La clave original pertenece al almacén de
credenciales de n8n, nunca al repositorio ni a los parámetros visibles de nodos.

| Recurso | Consulta | Alcance |
|---|---|---|
| Estado | `?resource=status` | Identidad y capacidades reales; escritura deshabilitada |
| Catálogo | `?resource=catalog` | Servicios, precios decimales COP, nombres de profesionales y consultorios |
| Disponibilidad | `?resource=availability&date=YYYY-MM-DD&professionalId=ID&roomId=ID` | Intervalos ocupados, sin pacientes ni observaciones |

La fecha de disponibilidad se limita a hoy y los próximos 90 días de Bogotá.
Un hueco en agenda no es confirmación del profesional. Horarios incompletos
invalidan la cobertura. El registro definitivo debe comprobar disponibilidad
de nuevo en una transacción, con idempotencia y auditoría.

Pruebas: `npx tsx --test tests/psychology-integration.test.ts`.

## Reglas operativas que deben permanecer

Actualización expresa del 26 de septiembre: Evelin ya no trabaja en la empresa.
Las notificaciones administrativas, incidencias, confirmaciones internas y
reportes van exclusivamente a Sandra Milena Duque, +57 301 6803926.
El destinatario no puede modificarse desde un mensaje entrante. Esto no sustituye
la consulta de disponibilidad al psicólogo ni la confirmación de cita al paciente.

Luisa Fernanda saluda brevemente y usa el texto aprobado de la respuesta rápida
sin reescribir precios. El catálogo de plantillas se versiona fuera del código
con datos privados. Primero necesidad, servicio, respuesta del cliente y
aceptación; después introducción y `/datos`. Preferencia de profesional,
modalidad, fecha, hora, disponibilidad del profesional y consultorio. Nunca
confirmar una reserva por un simple hueco de calendario.

Alquiler: profesional registrado, duración, consultorio y horario 07:00–20:00;
sin exigir comprobante anticipado. Impresiones: 800 COP por hoja. Tiempo extra
separado: 1–15 minutos 4.000, 16–30 minutos 8.000, más de 30 tarifa normal del
alquiler vigente. Certificado emocional al cliente: 200.000 con Deicy.

Riesgo clínico: no diagnosticar ni vender paquetes ante urgencia. Escalar a un
humano y dar acompañamiento inmediato adecuado a la urgencia. La regla recibe
triage revisado; NO es un clasificador clínico y no se debe configurar
`risk=cleared` de forma indiscriminada. Audio sin transcripción comprobada:
revisión, sin inventar contenido. Comprobante recibido: evidencia por revisar,
no abono bancario confirmado ni conciliación automática.

## Hallazgos de conexión, 26 de septiembre de 2026

Los flujos antiguos de apertura y cierre apuntan a
`$vars.PSICOLOGOS_BOT_URL + /jobs/opening|closing`, pero la variable y la
credencial Header Auth no estaban configuradas. No se ejecutaron ni publicaron.
El proyecto no tenía variables ni credenciales al revisarlo.

Chatwoot está alojado en el proyecto de infraestructura `tenaxis`, imagen
`chatwoot/chatwoot:v4.0.3`. Esto NO cambia el tenant de datos de Axis. Se revisó
la instalación: cuenta Servilution con cuatro canales API de otros negocios;
ninguno de Psicólogos. No reutilizar esos canales ni sus credenciales.
Existe también un servicio Evolution API; falta comprobar y vincular el número
de Psicólogos. No asumir que un WhatsApp Web abierto equivale a una API conectada.

Se creó una cuenta separada de Chatwoot: cuenta 2, «Psicólogos en Colombia»,
administradora `psicologosencolombia@gmail.com` (usuario 20). Se solicitaron
confirmación y recuperación por correo. Pendiente que la titular confirme,
establezca contraseña e inicie sesión. Ninguna bandeja de otros negocios fue
modificada. Todavía no existe una bandeja WhatsApp de Psicólogos verificada.

La credencial n8n «Axis Psicólogos - consulta» usa Header Auth y restringe el
destino a `www.servilutioncrm.com`. Se añadieron a Dokploy las dos variables
de activación de la API; no se alteraron los valores previos. La clave original
queda fuera de Git, en el almacén de credenciales, y el servidor usa su hash.

Respuestas rápidas observadas que requieren resolución antes de envío:

- `/oficina`: horario 07:00–19:00, contradice instrucción vigente 07:00–20:00.
- `/servicios`: no incluye neuropsicología aunque hay una respuesta específica.
- `/datos` incluye datos bancarios además del formulario; no incorporarla a Git.
- Plantillas de paquetes dicen pago completo; `/pago50` y `/pagoantiguos` dicen
  anticipo 30–50 %. Aplicar una política confirmada, nunca elegir al azar.
- No se observó respuesta rápida del certificado; crear texto aprobado a 200.000.

## Trabajo necesario antes de atención autónoma

1. Canal, número, bandeja y cuenta comprobados; credenciales de alcance mínimo.
2. Webhooks autenticados con filtro de cuenta/bandeja, mensajes entrantes y
   bloqueo de bucles. Identificador único persistido y bandeja de salida durable.
3. Estado de conversación en servidor: ningún mensaje o modelo puede otorgarse
   permisos, confirmaciones del psicólogo, conciliaciones ni identidad de Sandra.
4. API de escritura idempotente que reutilice los bloqueos, validaciones,
   consumo de paquetes y auditoría de Axis. No insertar citas directamente en BD.
5. Aprobación de plantillas y comparación contra precios vigentes de Axis.
6. Confirmaciones reales, rechazo del profesional, alternativas, cancelación,
   reprogramación, recuperación tras caída y prueba de reintento sin duplicados.
7. Reportes Bogotá 05:30/21:30, cierre provisional si hay citas pendientes,
   sin duplicar ingresos de paquetes, separando registro de comprobación bancaria.
8. Prueba integral controlada con administración antes de atención a pacientes.

## Referencias oficiales verificadas

- https://docs.n8n.io/integrations/builtin/credentials/whatsapp/
- https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/
- https://developers.chatwoot.com/api-reference/webhooks/add-a-webhook
- https://developers.chatwoot.com/api-reference/messages/create-new-message
- https://www.chatwoot.com/hc/user-guide/articles/1752129193-how-to-use-whatsapp-embedded-signup
- https://raw.githubusercontent.com/chatwoot/chatwoot/v4.0.3/app/builders/account_builder.rb

El flujo actual de coexistencia descrito por Chatwoot no demuestra que la
instalación 4.0.3 lo soporte: verificar versión/proveedor antes de migrar el número.

## Verificación en producción, 26 de septiembre, 14:42 Bogotá

- `8c00e8da41103072122d6617bf995c98d7e1f9fe` subido a main; Dokploy terminó
  correctamente en 1 min 52 s.
- Flujo manual `P7tAdnvzYvYugUWG` consultó Axis con la credencial dedicada y
  devolvió tenant 4 / empresa 3 / PSICOLOGOS / Psicologos en Colombia.
- Se consultó disponibilidad de Dixon (29) y consultorio 10 (1): intervalos
  ocupados y cobertura completa en esa consulta, sin datos de pacientes.
- El catálogo estricto de esa empresa devolvió solamente Alquiler de Consultorio
  (49), 18.900 COP. El código antiguo carga terapias globalmente para tenant 4.
  Debe reconciliarse la pertenencia de los servicios antes de habilitar ventas;
  no ampliar la API a otros tenants para ocultar esa inconsistencia.
- 54 casos pasaron dentro de n8n, incluidos avisos exclusivamente a Sandra.
  Sigue siendo una prueba sin envíos. No equivale a atención autónoma.
- Chatwoot sigue en login, pendiente confirmación de correo de la titular.
- El navegador bloqueó la apertura del dominio Evolution con
  `ERR_BLOCKED_BY_CLIENT`; no se comprobó un número conectado.

Evidencias locales sin claves: `.tmp/n8n-alertas-sandra-verificado.png` y
`.tmp/n8n-axis-produccion-verificado.png`. No subir `.env.psicologos-n8n.local`.

## Reparaciones verificadas el 26 de septiembre, 15:10 Bogotá

- Se cotejaron los 50 registros visibles del catálogo de PSICOLOGOS. Los 48
  registros clínicos antiguos estaban asociados al tenant 1, sin empresa. No
  tenían paquetes adquiridos fuera del tenant 4. Una transacción serializable
  corrigió solamente tenant y empresa, conservando IDs, precios y sesiones.
  Se guardó copia anterior privada y 48 eventos de auditoría.
- La API de producción devuelve ahora 48 servicios activos del tenant 4 y
  empresa 3, incluido certificado de apoyo emocional a 200.000 COP. Los otros
  dos registros permanecen inactivos. No se duplicó el catálogo.
- Se eliminó la excepción que permitía a operadores de Psicólogos consultar y
  modificar terapias de otros tenants. Las pruebas comprueban aislamiento y
  denegación a usuarios inactivos. Los scripts de reparación fallan ante cambios
  respecto de la evidencia; no ejecutarlos nuevamente sobre datos ya corregidos.
- Chatwoot rechazaba SMTP con 535 por una contraseña fija antigua en Compose.
  Se cambió a la variable de entorno y se verificó el envío real desde Rails.
  Se conservaron imagen, volúmenes y canales existentes. Los dos correos llegaron
  a Spam de la cuenta empresarial y se movieron a Recibidos. La titular debe
  completar la confirmación y crear su contraseña.
- Se verificó visualmente el número empresarial +57 301 6818845. Evolution API
  2.3.7 responde y se creó una instancia exclusiva `psicologos-en-colombia`.
  Todavía no está vinculada al teléfono: crear una instancia no equivale a
  tener WhatsApp conectado. Las instancias de otros negocios no se modificaron.

Las credenciales y copias privadas están excluidas de Git (`.env*`, `.tmp/`).
Los correos de confirmación no se sustituyen por cambios manuales en la base de
usuarios: el alta y la contraseña siguen bajo control de la titular.
