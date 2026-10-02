# María Ángel y Miguel Ángel

Directriz vigente: mensajes posteriores de la usuaria del 02/10/2026. María Ángel y Miguel Ángel deben analizar todos los chats y el programa de su propia empresa y pasar pruebas antes de funcionar de forma autónoma. La recepción limitada anterior queda suspendida: ambos runtimes tienen `BOT_ENABLED=false` y las cuatro fuentes de eventos están deshabilitadas. La vinculación de WhatsApp se conserva. No enviar respuestas a clientes, informes de jornada ni ejecutar escrituras de negocio durante esta fase. Psicólogos y Abogados conservan su operación independiente.

Plan y cobertura actual: `PLAN_APRENDIZAJE_VALIDACION_MARIA_MIGUEL_2026-10-02.md`, dentro del directorio histórico del chat; checkpoint actual `.tmp/service-bots-20261002/checkpoint.json`. Estos prevalecen sobre los controles anteriores de recepción habilitada.

## Estado comprobado

| Capacidad | Implementación | Prueba real en servidor |
|---|---|---|
| María Ángel: dos líneas de FUMIGACION | Runtime separado en Dokploy; respuestas deshabilitadas para análisis | HTTP autenticado, enabled=false y propietarios 4997/8721 OPEN comprobados a las 19:02Z |
| Miguel Ángel: dos líneas de S.TECNICO | Runtime separado en Dokploy; respuestas deshabilitadas para análisis | HTTP autenticado, enabled=false y propietarios 1941/9392 OPEN comprobados a las 19:02Z |
| Recepción, preguntas de servicio, lugar, síntomas y preferencia | Implementada; respuestas breves | Pendiente |
| Solicitud administrativa persistida antes del acuse | SQLite con cifrado autenticado | Pendiente |
| Atención humana y devolución expresa de Sandra | Implementadas | Un evento real de Fumigación preservó atención humana; devolución legítima pendiente |
| Preguntas internas a Diego/Sandra, sin grupos | Cola e identificación exacta | Pendiente |
| Respuestas citadas a preguntas entregadas | Aprendizaje del mismo caso con fuente y fecha | Pendiente |
| Memoria histórica por empresa | 38 observaciones de Fumigación y 39 de ST, conservadas como referencias | Importación remota y persistencia tras reinicio verificadas el 02/10/2026 |
| Preguntas anteriores pendientes | Una por empresa importada; no crean salidas | Importación remota y persistencia verificadas; ninguna respuesta nueva atribuida |
| Revisión de atención previa al primer mensaje | Consulta metadatos salientes anteriores al corte en las dos líneas propias | Protocolo, publicación y flag de producción verificados; siguiente cliente real pendiente |
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

Solo POST. Administración: `/status`, `/channel-health`, `/supervision`, `/knowledge`, `/import-pending-questions`, `/drain`. Ingesta: `/webhook`, `/event`, `/delivery`. Cada grupo usa su clave propia, mediante `Authorization: Bearer …`.

`/supervision` entrega metadatos de eventos con cursor por fila y límite de 100, estado de las salidas con ID exacto del proveedor y conteo de atención humana. No devuelve texto, archivos, claves ni el contenido del conocimiento. `remainingEvents` y `outboxCoverageComplete` indican la cobertura de la consulta; el listado limitado no se presenta como inventario íntegro. Guardar la evidencia privada por empresa y verificar las entregas exactas antes de repetir cualquier salida.

`/webhook` admite `messages.upsert` y `messages.update` de Evolution. Verifica nombre técnico y propietario real de la instancia. Los grupos y los LID sin teléfono verificado quedan sin respuesta. El webhook debe configurarse con el encabezado de autenticación; si el proveedor no lo soporta, hace falta un puente propio autenticado. No reemplazar ni borrar un webhook existente sin inspeccionar su destino y preservar los demás consumidores.

El worker corre cada diez segundos. Una salida pasa por READY → SENDING → ACCEPTED. Solo un evento de entrega exacto la convierte en DELIVERED/READ. Un resultado incierto queda detenido para verificación, incluso tras reiniciar. El eco se reconoce por ID exacto; el contenido igual por sí solo no acredita autoría.

Las salidas pendientes de más de diez minutos quedan en EXPIRED_REVIEW. Se evita enviar mensajes antiguos al recuperar una conexión. La solicitud y la pregunta permanecen guardadas para revisión; no se recrean ni se reenvían automáticamente.

## Aprendizaje y correcciones

La aclaración directa posterior de la usuaria del 02/10/2026 mantiene a María y Miguel en análisis y pruebas: pueden hacer preguntas necesarias exclusivamente a Sandra o Diego. Luisa y Jeison conservan su recepción productiva independiente. Los mensajes a clientes deben comunicar solo el resultado pertinente o un dato necesario; no anunciar consultas al equipo ni la transcripción o procesamiento de audios y archivos.

Las dudas nuevas sobre tipos de servicio, refuerzos, duración, intervalo y condiciones también deben consultarse. Primero revisar las respuestas guardadas, su ámbito y vigencia. Si una explicación necesaria sigue sin respuesta, verificar que la consulta se entregó y que no fue contestada por otro medio; preparar un seguimiento breve que identifique el dato faltante y explique por qué es importante para gestionar ese servicio. Registrar el seguimiento con una clave estable, sin repetir el mensaje original, sin reintentar entregas inciertas ni insistir por cada control. Una explicación estable no acredita disponibilidad actual, asignación de técnico, precio o pago de otro caso.

Diego: 573233350137. Sandra: 573016803926. Diego define ruta, disponibilidad actual, horario posible y técnico de cada servicio. Antes de cualquier consulta, revisar el historial pertinente y el registro propio de preguntas y respuestas. Reutilizar explicaciones claras, verificadas, aplicables y vigentes; preguntar solo un dato faltante con contexto suficiente, en lenguaje cotidiano, breve, amable y empático. No repetir consultas pendientes ni reenviar entregas inciertas.

Una respuesta nueva debe relacionarse con la pregunta entregada al remitente exacto, mediante cita o antecedente realmente comprobado. El recorrido de servidor implementado requiere citar el ID exacto; todavía no acredita respuestas nuevas aprendidas. Se conserva texto, caso, fuente, fecha, alcance, excepciones y vigencia. La ventana técnica actual de datos operativos es de 30 minutos; no equivale a olvidar una explicación estable ni declara una tarifa o disponibilidad institucional. La reutilización duradera por alcance y el recorrido completo en el programa siguen pendientes de validación. Cambiar condiciones produce un registro diferente.

Las observaciones históricas y los manuales se conservan como referencias. No crean políticas ni entrenan el modelo. El adaptador de IA solo extrae fragmentos literales; no decide precios, pagos, diagnósticos, disponibilidades, acuerdos ni escrituras. Las correcciones de código las realiza el supervisor con evidencia y pruebas.

Un mensaje del personal mantiene la atención humana. Sandra puede devolver un caso con una orden dirigida al bot, por ejemplo «Miguel Ángel, retoma chat de 57…». Un agradecimiento, un sí, el paso del tiempo o una mención en tercera persona no lo liberan. Una respuesta citada verificada permite aprender ese turno y conserva la toma humana general.

La revisión anterior al corte usa exclusivamente metadatos del programa de mensajería: número exacto, origen, ID y fecha. No supone autoría de los salientes antiguos ni amplía la cobertura de lectura histórica. Si encuentra una atención saliente previa, conserva el chat para revisión humana. Una devolución expresa posterior al corte se respeta. Si no puede verificar la consulta, el evento queda en `HISTORY_REVIEW` sin respuesta ni reintento automático. Una presencia dirigida claramente por Sandra recibe un acuse breve que conserva la toma humana.

## Publicación y verificaciones pendientes

Estado vigente, 02/10/2026 19:02Z: ambos runtimes enabled=false, sus cuatro fuentes deshabilitadas y cero salidas. Fumigación conserva doce metadatos de la breve recepción anterior (siete HISTORY_REVIEW, cinco STAFF_TAKEOVER), cuatro chats en atención humana. ST conserva cero eventos. No se respondió a clientes ni se recibieron nuevas respuestas internas verificadas. IA y programa propios no conectados; sesiones del programa piden login. Las cuatro líneas están OPEN con propietarios coincidentes. La vinculación de 8721 y la recuperación de 9392 están resueltas; no hay QR pendiente. No reactivar por una instrucción o herramienta anterior.

La autonomía futura requiere verificar el recorrido WhatsApp → programa → confirmación de Diego → información pertinente al técnico → ejecución → pago real → seguimiento. Los informes de inicio y cierre están pedidos para esa fase futura; todavía no hay horario de jornada verificado ni autorización para enviarlos durante análisis. El recaudo esperado debe distinguir saldos pendientes de importes nominales, anticipos y servicios cancelados. Guardar una explicación o pasar pruebas técnicas no acredita autonomía completa o perfección.

### Antecedente de recepción limitada, suspendido

Verificación del 02/10/2026: las cuatro líneas estuvieron OPEN con sus propietarios coincidentes a las 18:21Z. Se creó la instancia propia `servicio-tecnico-a` para el 1941 después de la solicitud directa de QR de la usuaria. El 9392 se recuperó mediante su conexión propia; no se reinició el servidor compartido. María y Miguel están desplegados con claves y volúmenes independientes, HTTPS, autenticación y guardia comprobados; el estado fue verificado `enabled=true` a las 18:25Z. La memoria y las preguntas pendientes sobrevivieron a reinicios propios. Esto no acredita respuestas a clientes, agenda, aprendizaje nuevo ni autonomía completa.

Las cuatro fuentes de Evolution quedaron configuradas con autenticación por empresa y solo `MESSAGES_UPSERT`/`MESSAGES_UPDATE`, sin base64 ni rutas por evento. Lectura posterior verificó cada destino y encabezado. Un evento real de Fumigación llegó al servidor y quedó `STAFF_TAKEOVER`, sin salidas del bot. A las 18:24Z la línea 8721 pasó a `close`; reinicio propio no recuperó la conexión y se mostró un QR nuevo. Mientras no pueda comprobar ambas líneas, la guardia conserva los clientes nuevos para revisión. 1941 y 9392 siguen OPEN en la comprobación de las 18:25Z.

La activación solo procesa eventos nuevos desde el corte. No recuperar mensajes antiguos para enviarlos a clientes. Verificar recepción, salida y entrega reales, tomando como fuente el registro persistido. Las conexiones de IA, programa, agenda, órdenes y pagos conservan sus pendientes específicos. La recepción actual utiliza reglas acotadas de recolección de datos y revisión humana; no declara una conversación completa con IA ni autonomía administrativa integral.

La cuenta autenticada del creador, la auditoría y la protección del crédito de cada servicio futuro siguen pendientes de integración con el programa. Esta entrega no crea usuarios sensibles, registra órdenes, acredita pagos, reserva técnicos ni cambia registros históricos. El dashboard de conciliación solicitado continúa después de la revisión histórica.
