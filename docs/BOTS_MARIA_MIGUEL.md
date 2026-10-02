# María Ángel y Miguel Ángel

Autorización: mensajes directos de la usuaria del 02/10/2026 para construir los bots faltantes, supervisarlos, corregir fallos respaldados por evidencia y aprender de respuestas verificadas. Sustituye la fase anterior de preparación sin bots. La revisión histórica conserva su alcance de lectura.

## Estado comprobado

| Capacidad | Implementación | Prueba real en servidor |
|---|---|---|
| María Ángel: dos líneas de FUMIGACION | Runtime separado en Dokploy | HTTP autenticado y propietarios OPEN verificados; respuestas aún deshabilitadas |
| Miguel Ángel: dos líneas de S.TECNICO | Runtime separado en Dokploy | HTTP autenticado y propietarios OPEN verificados; respuestas aún deshabilitadas |
| Recepción, preguntas de servicio, lugar, síntomas y preferencia | Implementada; respuestas breves | Pendiente |
| Solicitud administrativa persistida antes del acuse | SQLite con cifrado autenticado | Pendiente |
| Atención humana y devolución expresa de Sandra | Implementadas | Pendiente |
| Preguntas internas a Diego/Sandra, sin grupos | Cola e identificación exacta | Pendiente |
| Respuestas citadas a preguntas entregadas | Aprendizaje del mismo caso con fuente y fecha | Pendiente |
| Memoria histórica por empresa | 38 observaciones de Fumigación y 39 de ST, conservadas como referencias | Importación remota y persistencia tras reinicio verificadas el 02/10/2026 |
| Preguntas anteriores pendientes | Una por empresa importada; no crean salidas | Importación remota y persistencia verificadas; ninguna respuesta nueva atribuida |
| Revisión de atención previa al primer mensaje | Consulta metadatos salientes anteriores al corte en las dos líneas propias | Protocolo de consulta verificado; guardia en pruebas aisladas, publicación pendiente |
| Audio, imágenes, documentos y video | Conservan revisión humana del original | Interpretación propia pendiente |
| IA para extracción literal de datos | Adaptador opcional por empresa | Credenciales y prueba propia pendientes |
| Programa, agenda y órdenes | Adaptador de lectura con comprobación de ámbito | Conexión propia pendiente |
| Reservas, pagos y autoría protegida en el programa | Requisitos conservados; escrituras no implementadas en esta entrega | Pendiente |

Las pruebas aisladas cubren identidad, cifrado, separación, idempotencia, dos líneas por caso, intervención humana, respuestas citadas, contexto, entregas inciertas y credenciales distintas de administración/webhook. No acreditan entrega ni atención real en WhatsApp.

## Ejecución

Dos procesos y dos volúmenes independientes, con el mismo código de `automation/service-bots`. Se ejecutan con Node 24. No leen tablas, claves, colas ni proyectos de Psicólogos o Abogados. El archivo Compose inicia únicamente estos dos servicios; no administra los bots existentes.

Variables por servicio:

| Variable | Valor o función |
|---|---|
| `BOT_COMPANY` | `fumigacion` o `servicio-tecnico` |
| `BOT_LINES_JSON` | Dos objetos con `instance`, `phone` y `apiKey`; claves existentes diferentes por instancia, nombres técnicos y propietarios comprobados |
| `BOT_DATABASE_PATH` | `/data/fumigacion/bot.sqlite` o `/data/servicio-tecnico/bot.sqlite` |
| `BOT_DATA_KEY` | Clave de cifrado propia de 32 bytes, en hexadecimal |
| `BOT_AUTH_TOKEN_HASH` | SHA256 de clave de administración exclusiva de este bot |
| `BOT_WEBHOOK_TOKEN_HASH` | SHA256 de otra clave exclusiva para eventos/entregas |
| `BOT_EVOLUTION_URL` | Servidor HTTPS comprobado; cada petición usa exclusivamente la clave de su instancia en `BOT_LINES_JSON`. Una clave global compartida se rechaza |
| `BOT_ENABLED`, `BOT_ACTIVATED_AT` | Habilitación y corte de activación, después de comprobaciones reales |
| `BOT_PRIOR_HISTORY_CHECK` | Debe ser `true` antes de activar. Antes de atender por primera vez consulta ambas líneas propias para preservar atención anterior sin atribuir sus mensajes a un bot |
| `BOT_UNDERSTANDING_URL`, `BOT_UNDERSTANDING_TOKEN` | Adaptador privado opcional; nunca el proyecto o clave de Psicólogos/Abogados |
| `BOT_PROGRAM_CONTEXT_URL`, `BOT_PROGRAM_READ_TOKEN`, `BOT_PROGRAM_COMPANY_ID` | Lectura del programa de esta empresa, cuando esté implementada y verificada |

Los secretos van en los archivos privados de entorno del servidor. No se incluyen en Git, respuestas, informes ni capturas. El volumen y las claves deben tener respaldo privado; perder la clave impide recuperar el contenido cifrado.

## API autenticada

Solo POST. Administración: `/status`, `/channel-health`, `/knowledge`, `/import-pending-questions`, `/drain`. Ingesta: `/webhook`, `/event`, `/delivery`. Cada grupo usa su clave propia, mediante `Authorization: Bearer …`.

`/webhook` admite `messages.upsert` y `messages.update` de Evolution. Verifica nombre técnico y propietario real de la instancia. Los grupos y los LID sin teléfono verificado quedan sin respuesta. El webhook debe configurarse con el encabezado de autenticación; si el proveedor no lo soporta, hace falta un puente propio autenticado. No reemplazar ni borrar un webhook existente sin inspeccionar su destino y preservar los demás consumidores.

El worker corre cada diez segundos. Una salida pasa por READY → SENDING → ACCEPTED. Solo un evento de entrega exacto la convierte en DELIVERED/READ. Un resultado incierto queda detenido para verificación, incluso tras reiniciar. El eco se reconoce por ID exacto; el contenido igual por sí solo no acredita autoría.

Las salidas pendientes de más de diez minutos quedan en EXPIRED_REVIEW. Se evita enviar mensajes antiguos al recuperar una conexión. La solicitud y la pregunta permanecen guardadas para revisión; no se recrean ni se reenvían automáticamente.

## Aprendizaje y correcciones

Diego: 573233350137. Sandra: 573016803926. Una respuesta nueva debe citar el ID exacto de una pregunta entregada al mismo remitente. Se conserva texto, caso, fuente y fecha. La ventana técnica de reutilización de datos operativos es de 30 minutos; no declara una tarifa o disponibilidad institucional. Cambiar condiciones produce un registro diferente. No se reenvía una consulta pendiente ni una entrega incierta.

Las observaciones históricas y los manuales se conservan como referencias. No crean políticas ni entrenan el modelo. El adaptador de IA solo extrae fragmentos literales; no decide precios, pagos, diagnósticos, disponibilidades, acuerdos ni escrituras. Las correcciones de código las realiza el supervisor con evidencia y pruebas.

Un mensaje del personal mantiene la atención humana. Sandra puede devolver un caso con una orden dirigida al bot, por ejemplo «Miguel Ángel, retoma chat de 57…». Un agradecimiento, un sí, el paso del tiempo o una mención en tercera persona no lo liberan. Una respuesta citada verificada permite aprender ese turno y conserva la toma humana general.

La revisión anterior al corte usa exclusivamente metadatos del programa de mensajería: número exacto, origen, ID y fecha. No supone autoría de los salientes antiguos ni amplía la cobertura de lectura histórica. Si encuentra una atención saliente previa, conserva el chat para revisión humana. Una devolución expresa posterior al corte se respeta. Si no puede verificar la consulta, el evento queda en `HISTORY_REVIEW` sin respuesta ni reintento automático. Una presencia dirigida claramente por Sandra recibe un acuse breve que conserva la toma humana.

## Publicación y verificaciones pendientes

Verificación del 02/10/2026: las cuatro líneas están OPEN y sus propietarios coinciden. Se creó la instancia propia `servicio-tecnico-a` para el 1941 después de la solicitud directa de QR de la usuaria. El 9392 se recuperó mediante su conexión propia; no se reinició el servidor compartido. María y Miguel están desplegados con claves y volúmenes independientes, HTTPS y autenticación comprobada; el estado continúa `enabled=false`. La memoria y las preguntas pendientes sobrevivieron a reinicios propios. Esto no acredita respuestas a clientes, agenda, aprendizaje nuevo ni autonomía completa.

Faltan las fuentes autenticadas de eventos y la publicación de la guardia de atención previa antes de habilitar recepción. La activación solo procesa eventos nuevos desde el corte. No recuperar mensajes antiguos para enviarlos a clientes. Verificar recepción, salida y entrega reales, tomando como fuente el registro persistido. Las conexiones de IA, programa, agenda, órdenes y pagos conservan sus pendientes específicos.

La cuenta autenticada del creador, la auditoría y la protección del crédito de cada servicio futuro siguen pendientes de integración con el programa. Esta entrega no crea usuarios sensibles, registra órdenes, acredita pagos, reserva técnicos ni cambia registros históricos. El dashboard de conciliación solicitado continúa después de la revisión histórica.
