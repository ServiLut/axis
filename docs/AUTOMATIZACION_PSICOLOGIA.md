# Integración de Psicólogos en Colombia

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
