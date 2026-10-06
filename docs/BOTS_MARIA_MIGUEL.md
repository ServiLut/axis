# María Ángel y Miguel Ángel

## Seguimiento con signos de pregunta — 05/10/2026, control 21:00 Bogotá

`pendingFollowupGuard=punctuation-only-own-pending-case-without-repeat-v1` conserva las preguntas pendientes del mismo cliente, caso y línea de María cuando el nuevo texto contiene únicamente signos de pregunta. No interpreta ese mensaje como una pregunta concreta nueva, no crea otra consulta interna ni otro acuse. Las consultas anteriores conservan su destinatario, fuente y entrega; no se redistribuyen ni se borran.

La fuente nativa `3AF628B7C01F4AAED15F` contenía solamente «?» y produjo una consulta adicional a Sandra mientras continuaba pendiente la pregunta de inmueble enviada a Diego y Hilary. El caso fue reproducido en almacenamiento aislado y la corrección pasó 227 comprobaciones. Las solicitudes con palabras, pagos, reprogramaciones y excepciones mantienen su revisión correspondiente. La atención humana conserva prioridad. El cambio está limitado a María; publicación, instalación y siguiente turno legítimo se verifican por separado en el checkpoint del control.

## Preguntas de estado y cantidad — 03/10/2026

`chiefStatusGuard=exact-directed-status-and-active-mode-v2` responde preguntas dirigidas de los remitentes internos autorizados sobre atención y cantidad de chats usando la configuración actual y la cola propia. Reconoce «María Ángel, ¿estás activa?» y el nombre corto únicamente en una pregunta completa de estado. Una mención en tercera persona, un reenvío o el nombre corto seguido de una orden no confieren autoridad. La presencia bajo pausa dice expresamente que no atiende clientes. El conteo excluye mensajes del personal, salidas internas, salidas suprimidas y entregas sin comprobar; cuenta contactos únicos en ambas líneas y distingue sus subtotales. «Hoy» usa la medianoche de Bogotá; una pregunta sin fecha describe solo los registros propios disponibles, sin atribuir servicios creados o finalizados. No libera chats ni ejecuta órdenes.

`quotationQuestionGuard=scoped-price-followup-and-existing-question-v1` dirige una pregunta nueva de precio a la ruta operativa propia. Si el mismo contacto y caso ya tienen una cotización o consulta de disponibilidad y precio pendiente, conserva esa consulta y sus destinatarios, sin otra salida o acuse. Conserva también una pregunta de precio histórica enviada a Sandra; no la redistribuye por la corrección. Pagos, quejas, documentos y seguridad mantienen su revisión correspondiente. Fuente de la corrección: pregunta directa de Sandra `3EB0D83DD7CC27E2ED78B7` y continuación técnica `ACF29B81C47BA1DEEAF64728DAAC27E7`, contrastadas con sus fuentes nativas el 05/10/2026. Pruebas aisladas no acreditan el siguiente recorrido legítimo en producción.

Una cita del proveedor puede estar separada de `messageContextInfo`. Se conserva su ID exacto aunque ese otro campo exista sin cita; citas contradictorias no confieren autoridad y cualquier marca de reenvío se conserva. Solo una salida propia interna, del mismo destinatario/línea y con entrega comprobada autoriza el turno citado. No reconstruir antecedentes por captura ni recuperar respuestas históricas ya entregadas.

## Preguntas frecuentes — 03/10/2026

La usuaria pidió directamente consultar a Hilary573043332213 por respuestas completas sobre duración, productos, precauciones, preparación, limpieza, refuerzos, garantías y otras preguntas comunes. Esta autorización corresponde a FUMIGACION y no libera chats ni reactiva clientes. La nueva consulta se deduplica aparte de la cotización pendiente del apartamento de66m²; leer el registro de preguntas antes de repetir o consultar otro dato. Su entrega nativa está comprobada, pero aún no hay una respuesta verificada.

`commonAnswerGuard=approved-source-context-and-complete-topics-v1` selecciona textos revisados por tema, plaga, inmueble y caso. Solo `approved_customer_answers` se puede ejecutar; `reference`, documentos históricos y mensajes del personal continúan como referencias. El importador autenticado contrasta el ID y texto originales entrantes, remitente exacto, línea propia, fecha y pregunta propia entregada. Una respuesta citada acredita su antecedente; si no hay cita, se exige revisión documentada del antecedente, nunca proximidad temporal por sí sola. La autorización directa y la revisión de alcance se conservan cifradas junto a la fuente.

Cada texto tiene fecha de revisión y condiciones explícitas. Si falta una respuesta para alguna pregunta identificada, hay conflicto, otra plaga/inmueble, una condición anterior sin relación comprobada, precio u horario adicional no verificado, no se sustituye por una respuesta parcial. Se consulta el dato faltante del mismo caso una sola vez. Una repetición mientras sigue pendiente no envía otro acuse genérico. Si existe un texto aplicable pero falta conocer la plaga o el inmueble, se pregunta ese dato y se conserva la pregunta original para contestarla después. Los datos de cotización, la atención humana y la autoría previa permanecen.

La duración de visita se distingue de duración del efecto o garantía. Las indicaciones de seguridad necesitan producto realmente confirmado y etiqueta/ficha leída con ID y hash; no se promete que un producto sea inofensivo o que no exista riesgo. Síntomas, exposición, embarazo y excepciones continúan en revisión personal. Antes de enviar se comprueba otra vez que el texto siga aplicable y vigente, además de las guardias de atención humana y canal.

Este mecanismo no crea tarifas, garantías, instrucciones químicas ni entrenamiento del modelo. Cero respuestas de Hilary importadas al corte; los ejemplos de pruebas son ficticios y aislados. Ambos bots siguen pausados para clientes. La cotización, conexión del programa y recorrido legítimo completo conservan sus pendientes.

## Control vigente — 03/10/2026: pausa y cortesía de clientes

Ambos runtimes conservan `BOT_ENABLED=false` y `BOT_CHIEF_ONLY=true`. La pausa de María por la queja prevalece sobre su activación anterior. La cotización, elección de respuesta aprobada, respuesta verificada de Hilary y recorrido posterior siguen pendientes. No reactivar por pruebas aisladas ni recuperar las respuestas históricas.

La fuente propia `AC6C0A99896FB3335DC21B6EFEDED67C`, un agradecimiento por la fumigación, recibió indebidamente otra pregunta de recepción; su respuesta histórica `3EB0A624D6D760B46EF5EE` fue entregada y no debe reenviarse. La corrección distingue agradecimientos sin nueva solicitud, pregunta, duda, pago o problema de seguridad. Conserva los datos, preguntas y atención del caso; responde brevemente sin iniciar una cotización ni reclamar autoría del servicio por esa cortesía. Una nueva solicitud o excepción en el mismo mensaje conserva su trámite. La API declara `customerCourtesyGuard=gratitude-only-without-intake-or-ownership-v1`; las pruebas aisladas no acreditan la próxima cortesía legítima en producción.

Directriz vigente: mensaje directo de la usuaria del 03/10/2026. Autoriza poner a María Ángel, de control de plagas, a responder y tomar servicios, con vigilancia estricta de sus respuestas y desarrollo del recorrido completo. Esta autorización sustituye para FUMIGACION la prohibición de atención a clientes del 02/10; no demuestra activación ni funcionamiento integral. La implementación disponible recibe solicitudes y guarda datos y dudas para revisión, con historial de ambas líneas, deduplicación y toma humana. El adaptador permanente del programa, la IA propia, la creación de servicios, agenda, pagos y demás guardados reales siguen pendientes; no anunciar confirmaciones o ingresos sin fuente vigente y persistencia comprobada. Revalidar el estado del servidor en el checkpoint más reciente.

Miguel Ángel/S.TECNICO conserva la fase de análisis y pruebas: `BOT_ENABLED=false`, `BOT_CHIEF_ONLY=true`, sin atención a clientes ni escrituras de negocio. En ambas empresas Sandra y Diego se verifican por número exacto; los grupos generales quedan fuera. Psicólogos y Abogados conservan sus permisos, conexiones, supervisiones e informes independientes. No confundir la nueva autorización de María Ángel con permiso para comprar créditos o reutilizar claves de otras empresas.

Plan y cobertura actual: `PLAN_APRENDIZAJE_VALIDACION_MARIA_MIGUEL_2026-10-02.md`, dentro del directorio histórico del chat; checkpoint actual `.tmp/service-bots-20261002/checkpoint.json`. Estos prevalecen sobre los controles anteriores de recepción habilitada.

## Estado comprobado

| Capacidad | Implementación | Prueba real en servidor |
|---|---|---|
| María Ángel: dos líneas de FUMIGACION | Recepción de solicitudes nuevas habilitada con revisión humana | Dokploy DONE, HTTP autenticado enabled=true y propietarios 4997/8721 OPEN comprobados el 03/10 a las 14:25Z; siguiente solicitud legítima pendiente |
| Miguel Ángel: dos líneas de S.TECNICO | Runtime separado en Dokploy; respuestas a clientes deshabilitadas para análisis | HTTP autenticado enabled=false y propietarios 1941/9392 OPEN comprobados el 03/10 a las 14:25Z |
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

Solo POST. Administración: `/status`, `/channel-health`, `/supervision`, `/review-events`, `/knowledge`, `/import-pending-questions`, `/drain`. Ingesta: `/webhook`, `/event`, `/delivery`. Cada grupo usa su clave propia, mediante `Authorization: Bearer …`.

`/supervision` entrega metadatos de eventos con cursor por fila y límite de 100, estado de las salidas con ID exacto del proveedor y conteo de atención humana. No devuelve texto, archivos, claves ni el contenido del conocimiento. `remainingEvents` y `outboxCoverageComplete` indican la cobertura de la consulta; el listado limitado no se presenta como inventario íntegro. Guardar la evidencia privada por empresa y verificar las entregas exactas antes de repetir cualquier salida.

`/webhook` admite `messages.upsert` y `messages.update` de Evolution. Verifica nombre técnico y propietario real de la instancia. Los grupos y los LID sin teléfono verificado quedan sin respuesta. El webhook debe configurarse con el encabezado de autenticación; si el proveedor no lo soporta, hace falta un puente propio autenticado. No reemplazar ni borrar un webhook existente sin inspeccionar su destino y preservar los demás consumidores.

El worker corre cada diez segundos. Una salida pasa por READY → SENDING → ACCEPTED. Solo un evento de entrega exacto la convierte en DELIVERED/READ. Un resultado incierto queda detenido para verificación, incluso tras reiniciar. El eco se reconoce por ID exacto; el contenido igual por sí solo no acredita autoría.

Las salidas pendientes de más de diez minutos quedan en EXPIRED_REVIEW. Se evita enviar mensajes antiguos al recuperar una conexión. La solicitud y la pregunta permanecen guardadas para revisión; no se recrean ni se reenvían automáticamente.

## Aprendizaje y correcciones

Una pregunta de capacidades o presencia dirigida al nombre del bot recibe una respuesta breve y veraz incluso bajo atención humana, sin liberar globalmente el chat. Una cita exacta de una salida propia entregada también puede acreditar ese turno. La alternativa de teléfono suministrada por el proveedor autenticado permite resolver un LID solo de Sandra o Diego; un nombre visible, un LID sin alternativa o un grupo no confiere autoridad. Las órdenes que exceden aprendizaje quedan cifradas para revisión, sin ejecutar cambios ni campañas. La recuperación administrativa de un mensaje interno exige comparación con su fuente nativa (ID, teléfono, línea, fecha, texto, tipo y cita), mantiene deduplicación y no recupera mensajes de clientes.

La aclaración de análisis del 02/10/2026 sigue aplicando a Miguel Ángel. Para María Ángel la autorización directa del 03/10 permite recepción de solicitudes nuevas con los límites implementados y comprobados. Las consultas operativas necesarias se dirigen exclusivamente a Sandra o Diego. Luisa y Jeison conservan su recepción productiva independiente. Los mensajes a clientes deben comunicar solo el resultado pertinente o un dato necesario; no anunciar consultas al equipo ni la transcripción o procesamiento de audios y archivos.

Las dudas nuevas sobre tipos de servicio, refuerzos, duración, intervalo y condiciones también deben consultarse. Primero revisar las respuestas guardadas, su ámbito y vigencia. Si una explicación necesaria sigue sin respuesta, verificar que la consulta se entregó y que no fue contestada por otro medio; preparar un seguimiento breve que identifique el dato faltante y explique por qué es importante para gestionar ese servicio. Registrar el seguimiento con una clave estable, sin repetir el mensaje original, sin reintentar entregas inciertas ni insistir por cada control. Una explicación estable no acredita disponibilidad actual, asignación de técnico, precio o pago de otro caso.

Diego: 573233350137. Sandra: 573016803926. Diego define ruta, disponibilidad actual, horario posible y técnico de cada servicio. Antes de cualquier consulta, revisar el historial pertinente y el registro propio de preguntas y respuestas. Reutilizar explicaciones claras, verificadas, aplicables y vigentes; preguntar solo un dato faltante con contexto suficiente, en lenguaje cotidiano, breve, amable y empático. No repetir consultas pendientes ni reenviar entregas inciertas.

Una respuesta nueva debe relacionarse con la pregunta entregada al remitente exacto, mediante cita o antecedente realmente comprobado. El recorrido de servidor implementado requiere citar el ID exacto; todavía no acredita respuestas nuevas aprendidas. Se conserva texto, caso, fuente, fecha, alcance, excepciones y vigencia. La ventana técnica actual de datos operativos es de 30 minutos; no equivale a olvidar una explicación estable ni declara una tarifa o disponibilidad institucional. La reutilización duradera por alcance y el recorrido completo en el programa siguen pendientes de validación. Cambiar condiciones produce un registro diferente.

Las observaciones históricas y los manuales se conservan como referencias. No crean políticas ni entrenan el modelo. El adaptador de IA solo extrae fragmentos literales; no decide precios, pagos, diagnósticos, disponibilidades, acuerdos ni escrituras. Las correcciones de código las realiza el supervisor con evidencia y pruebas.

Un mensaje del personal mantiene la atención humana. Sandra puede devolver un caso con una orden dirigida al bot, por ejemplo «Miguel Ángel, retoma chat de 57…». Un agradecimiento, un sí, el paso del tiempo o una mención en tercera persona no lo liberan. Una respuesta citada verificada permite aprender ese turno y conserva la toma humana general.

La revisión anterior al corte usa exclusivamente metadatos del programa de mensajería: número exacto, origen, ID y fecha. No supone autoría de los salientes antiguos ni amplía la cobertura de lectura histórica. Si encuentra una atención saliente previa, conserva el chat para revisión humana. Una devolución expresa posterior al corte se respeta. Si no puede verificar la consulta, el evento queda en `HISTORY_REVIEW` sin respuesta ni reintento automático. Una presencia dirigida claramente por Sandra recibe un acuse breve que conserva la toma humana.

## Publicación y verificaciones pendientes

Antecedente verificado a 19:02Z, sustituido por el control de comunicación interna de 21:31Z: ambos runtimes enabled=false, sus cuatro fuentes deshabilitadas y cero salidas. Fumigación conserva doce metadatos de la breve recepción anterior (siete HISTORY_REVIEW, cinco STAFF_TAKEOVER), cuatro chats en atención humana. ST conserva cero eventos. No se respondió a clientes ni se recibieron nuevas respuestas internas verificadas. IA y programa propios no conectados; sesiones del programa piden login. Las cuatro líneas están OPEN con propietarios coincidentes. La vinculación de 8721 y la recuperación de 9392 están resueltas; no hay QR pendiente. No reactivar por una instrucción o herramienta anterior.

La autonomía futura requiere verificar el recorrido WhatsApp → programa → confirmación de Diego → información pertinente al técnico → ejecución → pago real → seguimiento. Los informes de inicio y cierre están pedidos para esa fase futura; todavía no hay horario de jornada verificado ni autorización para enviarlos durante análisis. El recaudo esperado debe distinguir saldos pendientes de importes nominales, anticipos y servicios cancelados. Guardar una explicación o pasar pruebas técnicas no acredita autonomía completa o perfección.

### Antecedente de recepción limitada, suspendido

Verificación del 02/10/2026: las cuatro líneas estuvieron OPEN con sus propietarios coincidentes a las 18:21Z. Se creó la instancia propia `servicio-tecnico-a` para el 1941 después de la solicitud directa de QR de la usuaria. El 9392 se recuperó mediante su conexión propia; no se reinició el servidor compartido. María y Miguel están desplegados con claves y volúmenes independientes, HTTPS, autenticación y guardia comprobados; el estado fue verificado `enabled=true` a las 18:25Z. La memoria y las preguntas pendientes sobrevivieron a reinicios propios. Esto no acredita respuestas a clientes, agenda, aprendizaje nuevo ni autonomía completa.

Las cuatro fuentes de Evolution quedaron configuradas con autenticación por empresa y solo `MESSAGES_UPSERT`/`MESSAGES_UPDATE`, sin base64 ni rutas por evento. Lectura posterior verificó cada destino y encabezado. Un evento real de Fumigación llegó al servidor y quedó `STAFF_TAKEOVER`, sin salidas del bot. A las 18:24Z la línea 8721 pasó a `close`; reinicio propio no recuperó la conexión y se mostró un QR nuevo. Mientras no pueda comprobar ambas líneas, la guardia conserva los clientes nuevos para revisión. 1941 y 9392 siguen OPEN en la comprobación de las 18:25Z.

La activación solo procesa eventos nuevos desde el corte. No recuperar mensajes antiguos para enviarlos a clientes. Verificar recepción, salida y entrega reales, tomando como fuente el registro persistido. Las conexiones de IA, programa, agenda, órdenes y pagos conservan sus pendientes específicos. La recepción actual utiliza reglas acotadas de recolección de datos y revisión humana; no declara una conversación completa con IA ni autonomía administrativa integral.

La cuenta autenticada del creador, la auditoría y la protección del crédito de cada servicio futuro siguen pendientes de integración con el programa. Esta entrega no crea usuarios sensibles, registra órdenes, acredita pagos, reserva técnicos ni cambia registros históricos. El dashboard de conciliación solicitado continúa después de la revisión histórica.

## Antecedente de comunicación interna — 02/10/2026 22:19Z

Publicación b98aab66b4383bbe2a2d54bc78338bbd46e55a85, 47 pruebas aprobadas y dos despliegues propios DONE. BOT_ENABLED=false y BOT_CHIEF_ONLY=true. Las cuatro fuentes propias están habilitadas para procesar únicamente mensajes internos de Sandra/Diego con identidad verificada; guardia verified-internal-per-line-v2. Las cuatro respuestas de capacidades a Sandra tienen entrega comprobada. Se conservan atención humana y deduplicación; no hay atención a clientes ni escrituras de negocio. IA propia y adaptador permanente del programa continúan sin conexión; el supervisor sí pudo consultar el programa por empresa en Chrome.

La usuaria autorizó los informes iniciales y una revisión diaria a las 13:00 America/Bogota: ver REVISION_SERVICIOS_13H.md. Dos informes parciales fueron DELIVERED a Sandra el 02/10 a las 22:14Z. El aviso ST de lavavajillas pendiente de concretar está visible en GRUPO SERVICIOS TESA con MID 3EB06C8407F4DA6C468DF6; recepción de miembros sin comprobar. Esta es una excepción de aviso de gestión, no habilita conversaciones genéricas con grupos. No repetir.

Leer BOTS_CLARIDAD_PRIVACIDAD_2026-10-02.md en visualizaciones y .tmp/bot-tone-20261002/checkpoint-private.json antes de continuar; preservar registros históricos y pendientes reales.

## Control vigente — 03/10/2026 14:25Z

La usuaria autorizó directamente la recepción y respuestas de María Ángel, con vigilancia estricta, y pidió verificar Psicólogos y Abogados. Solo FUMIGACION fue activada. Configuración visible guardada en Dokploy: BOT_ENABLED=true, BOT_CHIEF_ONLY=true, BOT_PRIOR_HISTORY_CHECK=true y corte de eventos nuevos 2026-10-03T14:23:58.495Z. Despliegue propio DONE con commit 9058fe1713fd55ab782fba2969944e4b83071e35; 48 pruebas aisladas aprobadas. API autenticada posterior verificó customerResponsesEnabled=true, customerIntakeEnabled=true, businessWritesEnabled=false y capabilityDisclosure=runtime-mode-and-implemented-intake-v1. Ambas líneas propias OPEN; las cuatro fuentes autenticadas fueron verificadas a14:29Z. Cuatro chats de Fumigación conservan atención humana. No hubo nuevas solicitudes ni salidas de clientes en la comprobación, por lo que la primera atención legítima sigue pendiente.

Miguel Ángel continúa enabled=false con conversación interna habilitada. No hubo cambios en sus variables o despliegue. Ningún bot de estas dos empresas tiene IA propia o adaptador permanente de programa conectado. María recibe y guarda solicitudes para revisión; no crea servicios en el programa, confirma técnicos u horarios, registra ingresos ni acredita el recorrido completo. La prueba y la habilitación no equivalen a autonomía integral. No recuperar mensajes históricos ni liberar chats por el paso del tiempo.

Checkpoint de esta autorización y despliegue: .tmp/service-bots-20261002/user-production-20261003/checkpoint-private.json. El checkpoint principal conserva fuentes, hashes, preguntas y cursores históricos, y distingue los permisos actuales de las dos empresas. La supervisión recurrente debe respetar esta nueva autoridad de FUMIGACION; no aplicar a María la antigua prohibición conjunta de respuestas a clientes.

## Autoría y continuidad — instrucciones directas del 03/10/2026

La usuaria precisó para ambas empresas: si el bot atiende primero un chat nuevo sin atención previa de un compañero, el servicio le corresponde hasta finalizar; abrir o leer el chat después no transfiere la autoría. Antes de continuar debe reconocer la pregunta actual y revisar lo ya pedido y respondido, distinguiendo el mismo servicio de uno nuevo. No inferir una conversación nueva por el paso del tiempo.

El servidor registra cifrados el caso, el primer bot, línea, salida, ID nativo y fecha, y verifica la entrega exacta antes de acreditar la primera respuesta. Una lectura o una sincronización sin mensaje escrito no activan toma humana. Una intervención escrita conserva esa fuente original y detiene respuestas simultáneas; la devolución expresa reanuda el mismo caso sin borrar su autoría. Si aparece una fuente anterior del personal, o el orden temporal es ambiguo, se conserva la evidencia del bot y se marca revisión, sin apropiarse de un servicio ajeno. Entrega incierta no crea autoría confirmada ni reintento.

La ausencia de mensajes salientes no prueba quién había leído el chat. El registro mantiene `priorReadByStaff=UNVERIFIED` cuando no existe evidencia atribuible de esa lectura; no acredita la condición de chat no leído, un creador en el programa, comisión o ingreso. La asignación y protección definitiva del creador del servicio siguen pendientes del adaptador propio, vínculo con el servicio real y verificación de la condición previa. La autoría de una solicitud no confirma creación o finalización del servicio.

El contexto incluye únicamente los turnos guardados del mismo contacto y empresa, en orden y con fuentes, estados de entrega y cobertura. Conserva conversaciones anteriores como referencia, sin convertirlas en políticas o instrucciones. No presenta los últimos turnos como lectura completa de WhatsApp ni incorpora contenido de medios no leído. Una solicitud nueva explícita tiene otro caso y no hereda tarifas, aclaraciones o datos operativos del anterior. Una referencia ambigua a lo ya comunicado conserva la pregunta actual para revisión; el bot no sustituye esa pregunta por otra de recepción ni repite la misma consulta interna pendiente. Se reservan claves y códigos de acceso en los extractos internos.

Estas reglas no activan respuestas de Miguel Ángel: S.TECNICO mantiene su fase de análisis. Comprobar los indicadores `caseOwnershipGuard=first-reply-source-preserved-v2` y `conversationContext=stored-scoped-turns-with-coverage-v2` en el despliegue real. No retroatribuir servicios, probar con clientes ni convertir pruebas aisladas en atención verificada.

## Revisión de respuestas reales y preguntas pendientes

El supervisor autorizado puede consultar `/review-events` con `company` y una lista explícita de 1–50 `eventIds` de esa empresa. Requiere la clave administrativa; la clave de ingesta no permite leer contenido. Devuelve únicamente el evento guardado, su respuesta pública vinculada y el contexto guardado hasta esa fuente, con cobertura declarada. No lee medios originales, no acredita lectura completa de WhatsApp y no encola, reenvía, libera chats ni modifica registros. Conservar la evidencia cifrada y mostrar solo el mínimo necesario, sin claves ni datos de otros clientes.

Las consultas por un mismo dato de recepción faltante se deduplican por caso y campo. También se reconocen las preguntas ya entregadas por la versión anterior: no se crea una tercera consulta al actualizar. Se usa lenguaje cotidiano, por ejemplo «tipo de inmueble», y se conserva el mensaje actual con los datos del caso. Una reiteración mientras esa aclaración está pendiente no genera otro acuse genérico al cliente. Una pregunta concreta de la persona no se reemplaza por la siguiente pregunta del formulario ni una alternativa interrogativa se guarda como dato confirmado.

Una continuación posterior a la actualización conserva como primera fuente una respuesta previa de ese mismo caso cuyo ID exacto y entrega consten en la cola. Si su orden temporal no fue comprobado, permanece en revisión, sin inventar fecha de envío o condición de chat no leído y sin otorgar crédito de creador en el programa.

Los mensajes rápidos de un mismo caso se leen como una secuencia: solo se responde al vigente, pero se conservan los datos literales anteriores sin respuestas duplicadas. Por ejemplo, «Casa 2 niveles» seguido de «Sabaneta» conserva inmueble y municipio con sus fuentes. No incorpora preguntas, citas reenviadas, medios sin lectura, mensajes futuros, otro contacto o el caso anterior como respuestas confirmadas. Una pregunta seguida de datos conserva la pregunta original y su fuente. Los saludos compuestos presentan al bot una sola vez; una petición dirigida a otra persona no se transforma automáticamente en recepción de un servicio.

## Incidente de atención — 03/10/2026

La usuaria informó atención incompleta e intervención después del personal. María Ángel se pausó: enabled=false confirmado a15:37:53Z, chiefOnly=true y corte original preservado. No reactivar por la autorización general anterior. Las capturas y fuentes guardadas de los contactos terminados2625 y6266 muestran que el bot inició la atención y luego la asesora completó datos, cotización o disponibilidad; estos dos ejemplos no prueban una respuesta posterior del bot a la asesora. No generalizar esa conclusión a otros casos.

La consulta histórica y la comprobación anterior a cada envío incluyen ambas líneas propias y los números alternativos explícitos del proveedor: los mensajes del personal podían constar bajo LID mientras las respuestas propias tenían el número telefónico principal. Se verificó esta diferencia por IDs exactos en fuentes reales. La comprobación actual distingue salidas propias por MID, teléfono y línea; cualquier otra salida escrita o medio mantiene atención para revisión y bloquea el envío. Una lectura o sincronización sin contenido no cuenta como intervención. Una consulta parcial o inaccesible queda en ATTENTION_REVIEW sin intento de entrega ni reintento. La verificación puntual y los webhooks no prometen una supervisión continua ni un margen de carrera imposible.

Se conservan varias plagas, área, habitaciones y ubicación literal cuando constan en mensajes propios del caso. Un barrio no se convierte automáticamente en municipio ni el importe de una cotización de la asesora en tarifa general. Falta completar la pauta de recolección de datos, elección de respuesta aprobada, cotización vigente, agenda y guardado en el programa antes de acreditar el recorrido integral.

La recepción inicial de FUMIGACION solicita juntos los datos básicos de cotización que muestran las capturas aportadas por la usuaria: plaga, tipo de inmueble, habitaciones o metros cuadrados, y municipio/barrio/vereda. Solo incluye lo aún faltante. Si la persona hace una pregunta concreta, esa pregunta tiene prioridad. Las respuestas en varios renglones conservan sus datos literales y la siguiente pregunta no repite lo ya aportado. No se infiere el inmueble a partir de las habitaciones ni el municipio a partir de un barrio.

Con esos datos completos se crea una única consulta de cotización verificada a Sandra antes de pedir disponibilidad; el cliente recibe un acuse breve de cotización pendiente. No se extraen tarifas generales, productos, garantías o certificaciones del texto de la asesora. La consulta puntual a Hilary fue autorizada directamente por la usuaria para apoyo temporal de FUMIGACION mientras Diego está ausente, quedó en cola local cifrada y tiene entrega nativa comprobada; la ruta permanente del servidor para Hilary aún no está implementada. Su número no le concede autoridad de Sandra ni aplica a S.TECNICO. La elección automática de la respuesta aprobada, la cotización definitiva y el recorrido del programa permanecen pendientes. Ambos runtimes continúan con clientes deshabilitados.

La usuaria autorizó a Hilary, exclusivamente573043332213, como apoyo temporal de FUMIGACION durante la ausencia actual de Diego. La consulta puntual se registra en .tmp/service-bots-20261002/user-production-20261003/fumigacion/hilary-consultations.sqlite, cifrada y deduplicada, y en los registros propios de preguntas. No concede autoridad de Sandra, reglas generales, acceso a otras empresas ni órdenes de negocio. Una salida ACCEPTED no acredita entrega; no reenviar ante incertidumbre. Su respuesta necesita fuente exacta y alcance verificados antes de aplicarse. La ruta permanente de Hilary en el servidor no queda implementada por este envío puntual.
# Instrucción directa del 03/10/2026: recepción activa y confirmaciones con Sandra

La usuaria pidió mantener la atención de María Ángel y activar a Miguel Ángel. Esta instrucción sustituye la pausa previa de recepción. Las confirmaciones nuevas de cotización, horario, técnico y excepciones se consultan exclusivamente con Sandra (`573016803926`); Hilary ya no es el destino temporal de confirmaciones y Diego no recibe consultas operativas nuevas. Las consultas anteriores se conservan con su fuente y estado, sin repetirlas por cambiar el destino.

La activación conserva el corte original de cada empresa, la protección de historial propio, los holds humanos, la autoría de primera respuesta y el control nativo antes de cada envío. No habilita campañas ni escrituras de negocio, ni demuestra conexión de IA o programa, cotizaciones completas o finalización real de servicios. No se reproducen eventos de la pausa.

La solicitud directa de un Excel para Sandra con dudas de las cuatro empresas autoriza un único archivo separado por hojas, dirigido a ella. `/notify-chief-document` requiere autenticación administrativa propia, línea propia, archivo XLSX con hash y límite de tamaño, clave estable y destinataria fija Sandra. Se cifra en la cola persistida; se registra el MID nativo y se verifica entrega exacta. Una entrega incierta no se reintenta. `/review-questions` permite lectura administrativa paginada de pendientes propios, sin modificar su estado. El contenido del Excel no se importa como conocimiento de otra empresa.

## Corrección de continuidad de recepción — control 03/10/2026 21:14Z

La recepción activa de ambas empresas conserva prioridad sobre las pausas históricas descritas arriba. Se verificaron fallos nuevos de FUMIGACION con fuentes propias: una respuesta de tamaño perdió el dato, una finca y varias plagas no se conservaron, un dato adicional produjo otra consulta de cotización pendiente y una pregunta por la llegada de un servicio se trató como recepción nueva. No se reproducen esos mensajes en producción.

`intakeContinuationGuard=literal-fields-context-size-and-single-pending-quote-v1` conserva finca/casa finca y las plagas expresamente nombradas, sin atribuirles productos o tratamientos. Una respuesta como «52 metros» a la pregunta propia por tamaño conserva ese texto con fuente; no lo convierte en metros cuadrados ni en tarifa. Fuera de ese antecedente, o si describe una medida lineal, no se guarda como área. Un dato adicional actualiza el contexto sin crear otra consulta ni otro acuse mientras la cotización del mismo caso siga pendiente; cambiar destinatario tampoco repite esa pregunta. Otros contactos, casos y temas mantienen registros separados.

`serviceFollowupGuard=existing-service-arrival-before-intake-v1` reconoce preguntas sobre llegada incluso sin signos de interrogación. Conserva el caso y solicita a Sandra el estado y una respuesta comprobada antes de anunciar una hora. Pagos y excepciones de seguridad mantienen prioridad de revisión personal. No crea, confirma ni modifica servicios en el programa. La atención humana sigue bloqueando las respuestas y no se libera por esta corrección.

`intakeLiteralFieldsGuard=plural-property-and-room-synonyms-v1` reconoce tipos de inmueble en plural. En FUMIGACION, «3 piezas» se conserva literalmente como habitaciones cuando el mismo texto identifica el inmueble; piezas de repuesto o de un motor no se convierten en tamaño. Los datos aportados en varios renglones mantienen sus fuentes y evitan repetir inmueble o habitaciones. Una ubicación indicada como barrio permanece literal, sin atribuirle un municipio. La cotización conserva una sola consulta pendiente del caso, su revisión personal y los holds. Esta corrección no modifica ni recupera los mensajes anteriores.

La cortesía legítima posterior fue observada con una respuesta breve READ sin reiniciar la recepción. La revisión guardada distingue metadatos, textos efectivamente leídos y medios originales pendientes. Las respuestas frecuentes aprobadas, los productos con etiqueta/ficha original y el recorrido guardado en el programa siguen pendientes; estas correcciones no acreditan autonomía completa. Verificar ambos indicadores en las API propias tras el despliegue y guardar la siguiente respuesta legítima sin pruebas enviadas a clientes.

## Solicitud del contacto del técnico — control 03/10/2026 22:14Z

Una fuente propia de FUMIGACION solicitó el número del técnico, sin signos de interrogación. El runtime preparó recepción de cotización; la guardia de atención humana suprimió esa salida y no hubo entrega. `requestedContactGuard=explicit-technician-contact-before-intake-v1` reconoce ahora una petición expresa de número/teléfono/contacto del técnico, conserva datos y preguntas previas y guarda una consulta del mismo caso a Sandra sobre el contacto autorizado y el dato que puede compartirse. No presume teléfono, asignación, permiso para divulgar datos, horario o contratación. La petición repetida conserva una única consulta pendiente y no genera otro acuse. Solicitudes nuevas de servicio mantienen su recepción; pagos y situaciones personales o de seguridad mantienen revisión prioritaria. Ninguna corrección libera un chat humano ni reproduce el evento anterior.

La primera pregunta legítima recibida por Miguel Ángel tras activarse tuvo respuesta propia READ comprobada por ID nativo y consulta del caso DELIVERED a Sandra. Era una duda sobre compra de equipos dañados para repuestos: no se confirmó compra ni se creó un servicio. Esa recepción verificada no acredita una cotización, una reparación o un guardado completo en el programa. Ambos bots permanecen activos con las confirmaciones nuevas dirigidas a Sandra.

## Lugar comercial literal — control 04/10/2026 18:53Z

Una continuación propia aportó un café y Santa Fe de Antioquia, pero el parser conservó sólo la plaga y produjo una consulta por el tipo de inmueble ya indicado. Fuente, tres respuestas y pregunta a Sandra fueron cotejadas con sus IDs nativos exactos; las salidas entregadas no se reproducen. La pregunta existente sigue pendiente de revisión, sin marcarla como contestada por una corrección de código.

`intakeLiteralFieldsGuard=literal-business-place-and-room-synonyms-v2` reconoce en FUMIGACION una descripción locativa explícita como «Es en café…», el sustantivo cafetería y el municipio completo Santa Fe/Santafé de Antioquia. Conserva la plaga y las fuentes del mismo caso; pregunta por habitaciones o metros cuadrados si aún faltan. Un color, una bebida o el nombre Santa Fe de otro municipio no confirman esos campos. Café no se transforma en restaurante, tarifa, producto, horario o disponibilidad.

La corrección se aplica a turnos nuevos. Las pruebas aisladas cubren la secuencia, el dato de tamaño posterior, una sola consulta de cotización a Sandra, la separación de S.TECNICO y la atención humana. No recuperan ni envían mensajes de prueba, resuelven la pregunta histórica o acreditan el guardado de un servicio. La próxima continuación legítima posterior al despliegue conserva su verificación pendiente.

## Pago solicitado, cotización previa y revisita — control 04/10/2026 21:56Z

Las fuentes propias verificadas mostraron tres preguntas sustituidas por recepción: cuánto enviar, una cotización que el cliente dice haber recibido y la reaparición de chinches después de una fumigación anterior. También una pregunta de horario sin signos fue tratada como dato de formulario. Se conservan las respuestas históricas y las consultas ya pendientes, sin reproducirlas ni marcarlas como resueltas por el cambio de código.

`paymentInquiryGuard=amount-before-intake-and-no-receipt-v1` distingue la pregunta sobre importe o medio de pago de un pago informado. Guarda una única consulta del caso a Sandra y no anuncia un ingreso, importe o cuenta sin verificación. `existingQuotationGuard=verified-prior-quote-before-intake-v1` conserva la afirmación de cotización previa como antecedente por contrastar, sin confirmar precio, aceptación o reserva. Ambas guardias se aplican por separado en las dos empresas.

En FUMIGACION, `postServiceGuard=reported-recurrence-before-intake-v1` reconoce la reaparición relatada después de una fumigación y consulta el antecedente y las condiciones de revisita del caso; no abre una cotización nueva automáticamente ni presume garantía. Las preguntas concretas de horario tienen prioridad aunque no lleven signos. Cada consulta conserva fuente y caso, deduplica reiteraciones y mantiene la atención humana. Pagos informados y situaciones personales o de seguridad mantienen su revisión prioritaria.

Estas correcciones no confirman una cotización, revisita, horario, técnico, pago o guardado de negocio. Las recepciones permanecen activas por la instrucción vigente y las confirmaciones nuevas se dirigen exclusivamente a Sandra. La siguiente atención legítima con estas guardias debe verificarse en producción.

## Tamaño escrito y saludo de continuación — control 05/10/2026 00:50Z

Dos secuencias propias verificadas por mensaje nativo mostraron que «Tiene dos habitaciones» y Sopetrán no se conservaron como datos ya escritos, y que «Buenas noches» después de la recepción produjo una consulta innecesaria por la plaga. Las consultas históricas mantienen su revisión pendiente; corregir el parser no equivale a responderlas ni autoriza reenviar el caso.

`intakeLiteralFieldsGuard=literal-business-place-and-written-rooms-v3` conserva en FUMIGACION Sopetrán y cantidades explícitas escritas de habitaciones o cuartos con su texto y fuente. No transforma una cantidad negada o un rango en un número confirmado ni traslada estos campos a Servicio Técnico. `intakeContinuationGuard=literal-fields-context-size-and-single-pending-quote-v2` conserva también una respuesta de tamaño del mismo lote después de la pregunta propia, aunque otro mensaje la haya sustituido para procesamiento; «100 metros» no se convierte en metros cuadrados.

`customerGreetingGuard=pure-greeting-preserves-pending-intake-v1` atiende en ambas empresas un saludo puro posterior con un saludo breve y conserva datos, preguntas, contexto pendiente y autoría. No crea una consulta por el campo faltante ni reinicia la recepción. Un saludo acompañado de solicitud, pago o situación personal sigue su trámite correspondiente. La atención humana conserva prioridad y ninguna de estas guardias libera chats, confirma tarifas, agenda o técnicos, o escribe servicios. Pruebas aisladas y publicación se registran por separado de la próxima atención real posterior al despliegue.

Al cierre de este control la corrección está preparada y probada en la rama propia. Dokploy muestra inicio de sesión en Chrome y en el navegador de Codex; no se ha aplicado un despliegue nuevo. Las recepciones y conexiones previamente verificadas continúan activas con su versión anterior. La restauración del acceso al panel y la instalación y comprobación del cambio permanecen pendientes.

## Enlace sin contenido leído — control 05/10/2026 01:52Z

Una fuente propia de FUMIGACION envió únicamente un enlace de video. El signo de interrogación de sus parámetros se interpretó como una pregunta concreta y generó una consulta a Sandra y un acuse al contacto; ambos tienen entrega nativa comprobada. El video no fue abierto ni su contenido leído. Las salidas históricas y la consulta pendiente se conservan sin reproducirlas ni marcarlas como resueltas.

`linkedContentGuard=unread-links-and-url-query-without-question-v1` trata un enlace aislado como referencia pendiente de revisión, conserva los datos, preguntas y atención del caso, y evita atribuirle una pregunta o datos confirmados. No abre el destino ni ejecuta sus instrucciones. La reiteración del mismo enlace en el mismo caso conserva una sola consulta y no genera otro acuse. Los signos y palabras dentro de una URL no se usan como preguntas, municipio, plaga, falla o preferencia; los datos y preguntas escritos fuera del enlace mantienen su trámite.

La corrección está preparada para ambas recepciones con atención humana prioritaria y confirmaciones exclusivamente con Sandra. Publicación, pruebas aisladas y despliegue se registran por separado: el acceso a Dokploy sigue pendiente, ya solicitado, y esta documentación no acredita la instalación o un recorrido legítimo posterior. No se cambian los cortes originales ni se habilitan escrituras de negocio.

## Ubicación escrita en varios mensajes — control 05/10/2026 11:59Z

Una secuencia legítima propia de FUMIGACION aportó Medellín, cinco cuartos, cucarachas, Manrique y casa. Las fuentes y tres respuestas se cotejaron por sus IDs nativos exactos; la única consulta de cotización a Sandra llegó y consta leída. Esa consulta conservó el municipio y las habitaciones, pero omitió la ubicación adicional «Manrique» y la descripción literal del tamaño. La atención posterior del personal mantuvo el chat humano; la pregunta sobre mascotas quedó observada sin respuesta del bot. No se adoptan el precio, los productos o las condiciones de seguridad escritos por el personal.

`intakeLocationGuard=literal-prompted-location-and-batch-sources-v1` conserva las ubicaciones literales solicitadas por la recepción propia, también cuando otro mensaje del mismo lote las sustituye para procesamiento. Mantiene el texto, las fuentes y sus fechas dentro del mismo caso; un barrio aislado no confirma un municipio. La consulta incluye la ubicación adicional sin repetir una cotización ya pendiente. Un caso nuevo, otra empresa o contacto, un mensaje futuro, un reenvío, un medio no leído o una intervención humana no aportan esos datos.

El fallo fue reproducido y la corrección pasó 77 comprobaciones enfocadas de recepción, contexto, deduplicación y atención humana. El cambio queda preparado en la rama propia: Dokploy sigue mostrando inicio de sesión y el acceso ya fue solicitado. La API actual conserva la versión anterior; estas pruebas no acreditan instalación ni atención posterior corregida. No se reproduce la secuencia, se reenvía la consulta o se modifica una cotización, agenda, pago o registro de negocio.

## Revisita recomendada tras un servicio — control 05/10/2026 13:00Z

Una entrada legítima propia de FUMIGACION relató una visita anterior, una recomendación de retorno y preferencias de fecha, hora y técnico, y pidió el precio. El texto de respuesta guardado reinició la cotización solicitando inmueble, tamaño y ubicación. La entrada se cotejó con su cuerpo nativo exacto; la salida tiene acuses nativos de entrega y lectura, además de una actualización EDITED y cuerpo nativo vacío. Se conserva esta limitación: el texto guardado no acredita el contenido actual de la salida editada ni permite concluir por su timestamp actualizado que hubo una respuesta después del personal.

`postServiceGuard=reported-recurrence-and-planned-revisit-before-intake-v2` conserva el relato de una fumigación previa y una petición explícita de otra visita como seguimiento pendiente de revisión, antes de reiniciar recepción o seleccionar una respuesta común. La recomendación relatada no confirma un servicio guardado, garantía, agenda, técnico ni precio. Una sola consulta del mismo caso a Sandra debe contrastar el antecedente, la disponibilidad, el técnico y el precio; el mensaje externo comunica únicamente que la solicitud sigue pendiente de confirmación. Las preferencias quedan como texto de la persona, con su fuente, sin transformarlas en reserva o datos de una cotización nueva.

Se mantienen la prioridad de situaciones personales, pagos y excepciones, la separación de empresas, las preguntas pendientes y la atención humana hasta devolución expresa. Un reenvío no se registra como relato directo; una visita negada o atribuida a un tercero no establece el antecedente. Seis pruebas nuevas reprodujeron el fallo y verificaron estas restricciones; el conjunto enfocado pasó 90 comprobaciones. Pruebas aisladas y publicación selectiva no acreditan despliegue: Dokploy sigue en inicio de sesión, acceso ya solicitado, y la API conserva la guardia anterior. Próxima instalación y seguimiento legítimo corregido pendientes; sin reenvíos, mensajes de prueba o escrituras de negocio.

## Corrección solicitada directamente — 05/10/2026: precios, contexto y prioridad del asesor

La usuaria informó que María pregunta por todas las cotizaciones, repite datos ya aportados e interfiere con los asesores. Autorizó usar precios de cotizaciones históricas para servicios comunes y conservar consulta particular para edificios, unidades y trabajos especiales. Las cuatro capturas aportadas bastan para reproducir el fallo general; no se solicitan números adicionales de clientes. Los mensajes del asesor en las capturas son evidencia del problema y del alcance de un caso, sin conferirle autoridad institucional ni convertir sus afirmaciones químicas o garantías en reglas.

Esta instrucción sustituye la consulta obligatoria de **toda** cotización descrita en las secciones históricas. El catálogo preparado usa solamente precios y condiciones revisados de fuentes nativas propias. Una vivienda con cinco cuartos pequeños y cucarachas en Manrique tiene referencia de $155.000; una casa en Bello, primer piso, tres habitaciones y patio con ratas, $130.000; un local de veinte metros cuadrados en Los Colores con cucarachas, $80.000; y un apartamento pequeño de dos habitaciones en Bello con cucarachas, $109.000. Estos ejemplos no definen una tabla universal ni intervalos inventados. La tabla antigua de referencia tiene otros importes y no se activa por antigüedad o aparición en un documento.

`priceCatalogGuard=exact-reviewed-native-price-and-special-property-review-v1` exige autorización directa, revisión, línea propia, IDs originales, fechas y hashes del precio y sus datos de contexto. Comprueba nativamente el precio, el mismo contacto y que las condiciones realmente aparezcan en sus mensajes antes de importar y antes de enviar. La selección conserva plagas, inmueble, municipio, ubicación, área o habitaciones, calificadores de tamaño, pisos, patio y alcance especificados. Una medida o cantidad adicional, un precio contradictorio, un dato faltante o una fuente modificada mantienen revisión. No importa cuerpos completos, productos, certificaciones, garantías, descuentos o refuerzos como políticas; conserva cifrada la evidencia y permite retirar una entrada sin reutilizarla.

`intakeContinuationGuard=literal-questions-and-first-batch-without-reasking-v3` conserva datos literales aunque acompañen una pregunta de precio y lee los mensajes rápidos del primer lote del mismo caso. Una pregunta hipotética o una alternativa no se registra como hecho. La siguiente respuesta pide sólo el dato que falta. Para chinches se pregunta por colchones y muebles afectados, sin sustituirlos por habitaciones; todavía no hay una tarifa de chinches importada. Edificios, varias propiedades y zonas comunes conservan cotización propia.

Una cotización entregada y vigente admite una aceptación natural dentro de ese único caso; continúa preguntando preferencia de fecha/franja y solicita disponibilidad y técnico a Sandra. No anuncia reserva, ingreso, creación de servicio ni ejecución de tratamiento. Sin prueba de entrega no toma una afirmación genérica como aceptación verificada. Una derivación a revisión comunica brevemente que una asesora continuará, guarda los datos siguientes sin otro acuse y no reinicia la recepción. No libera una toma humana; una solicitud nueva explícita tiene contexto independiente.

`liveAttentionGuard=staff-ingestion-freeze-and-own-native-before-send-v2` bloquea respuestas preparadas al recibir un mensaje saliente autenticado del personal, antes del próximo ciclo de trabajo, preservando la primera autoría. Distingue los ecos por ID exacto y el breve envío aún sin ID devuelto; mantiene la consulta de ambas líneas y direcciones telefónicas alternativas antes de enviar. Una edición saliente con cuerpo ausente se conserva para revisión, mientras un acuse de lectura o entrega solo no acredita intervención. Revalida la toma humana después de consultar las fuentes de un precio. La comprobación no garantiza la ausencia de carreras en el proveedor ni atribuye a una asesora un mensaje de autor desconocido.

Estado de este control: **código y catálogo preparados, pruebas aisladas aprobadas; instalación e importación en servidor pendientes**. Dokploy continúa en inicio de sesión y el acceso ya fue solicitado; no reiterarlo, enviar claves al chat ni presentar esta documentación como despliegue. Las recepciones activas y sus holds se conservan. El módulo de María continúa sin adaptador propio de programa y con escrituras de negocio deshabilitadas; la queja sobre servicios creados o corregidos requiere auditorías de esos registros antes de atribuirlos al bot. No se declara atención completa ni lectura completa de cinco meses: listado, extracción de mensajes, lectura de textos y originales de medios siguen teniendo cobertura parcial. Evidencia y catálogo: `.tmp/service-bots-20261002/user-complaint-20261005-prices-human/`; leer su checkpoint y el último control antes de reanudar. Las confirmaciones nuevas siguen exclusivamente con Sandra, sin repetir el Excel de preguntas ni las consultas ya pendientes.

### Instalación comprobada — 05/10/2026 15:18Z

El estado de preparación anterior quedó superado durante esta sesión. El panel volvió a estar autenticado y se desplegó **solamente mariangel-production** desde la rama propia: Dokploy DONE para `6e8ffb5d473febfb570c344dad851ec3d51d722f`. La API propia confirmó las tres guardias nuevas, recepción activa y ambos propietarios OPEN; la importación autenticada verificó catorce fuentes nativas y guardó cuatro entradas de precio cifradas, hash `a830b54cb7c29e0a992ec3b77166cc386b88f2b7300cafcd50eab1e0edbffef9`. No reimportar otro catálogo por un acuse incierto ni repetir una conversación histórica. El conjunto aislado pasó 171 pruebas distintas y los cuatro contextos reales de las tarifas produjeron su precio esperado en almacenamiento temporal, sin mensajes externos.

Al corte 15:18:17Z: sin cola READY/SENDING/UNCERTAIN y 87 chats humanos conservados, frente a 86 antes del despliegue; una nueva toma humana se conserva, sin liberaciones. Programa e IA propios siguen sin adaptador configurado y las escrituras de negocio siguen deshabilitadas. La UI del programa principal muestra inicio de sesión, por lo que no se leyeron auditorías actuales de servicios. La siguiente cotización legítima posterior a la importación, su entrega y continuación permanecen pendientes; instalación y pruebas aisladas no acreditan ese recorrido. Las otras recepciones no fueron desplegadas en este control. Leer el checkpoint de la queja y preservar sus huecos de cobertura y pendientes.

 ## Diego e Hilary disponibles — autorización directa del 05/10/2026

La usuaria confirmó «diego y hilary lo manejan, puedes escribirle a ambos» después de precisar el reparto: Diego para ruta, horario, disponibilidad, técnico y cotizaciones operativas de FUMIGACION/S.TECNICO; Hilary como apoyo solamente de FUMIGACION. Sustituye el destino único Sandra de las secciones anteriores en estos ámbitos. Sandra conserva dirección general, devolución expresa de chats, documentos y revisión de pagos, situaciones de seguridad, excepciones y políticas sin autorización comprobada.

`BOT_OPERATIONAL_ROUTING=diego-hilary-20261005` activa la ruta propia en cada servicio. `operatorRoutingGuard=scoped-new-question-fanout-and-exact-line-answer-v1` conserva una pregunta por caso y crea dos entregas independientes a Diego `573233350137` y Hilary `573043332213` en FUMIGACION; S.TECNICO usa solamente Diego. Cada entrega tiene ID y estado propio. Una pregunta ya pendiente mantiene destinatario, antecedente y salida originales: cambiar la ruta o aportar nuevos detalles no la redistribuye. No vuelve a enviar el Excel ni las consultas históricas.

Una respuesta entra como aclaración del mismo caso sólo con remitente exacto, cita de su propia salida DELIVERED/READ y línea propia exacta, sin reenvío. Otra respuesta conserva la primera fuente y ambas explicaciones cifradas para revisión, sin sustituir automáticamente precio, horario o técnico. Una confirmación o aprendizaje no crea un servicio, libera atención humana ni autoriza divulgar un contacto. Hilary no tiene autoridad en S.TECNICO; ninguno de los operadores recibe autoridad general de Sandra ni puede devolver chats al bot. El catálogo de cuatro precios conserva sus fuentes y alcance.

Pruebas aisladas de rutas, deduplicación, remitentes, citas, empresas y holds se guardan en `.tmp/service-bots-20261002/operator-routing-20261005/`. La siguiente consulta legítima nueva y su entrega/respuesta verificadas siguen siendo necesarias para acreditar el recorrido de producción. Consultar allí el checkpoint de instalación antes de afirmar que la variable está activa en ambos servidores.

## Documentos de un servicio anterior — corrección 05/10/2026 19:31Z

Una solicitud explícita de documentos posterior a una fumigación fue tratada como recepción de un servicio nuevo y recibió una pregunta de inmueble. La fuente y la respuesta están contrastadas con sus ID nativos y estado READ; no se recuperan ni se reenvían. Evidencia privada en `.tmp/service-bots-20261002/supervision-20261005-1931/`.

`serviceDocumentsGuard=reported-past-service-documents-before-intake-v1` reconoce documentos/soportes y una prestación anterior relatada. Conserva los datos previos y la solicitud de la misma secuencia, incluso cuando una lista de documentos llega enseguida. Guarda la revisión antes del acuse breve, sin preguntar plaga, inmueble, tamaño o ubicación como nueva cotización. El relato no prueba registro, ejecución, permisos, fichas, certificaciones ni autorización de entrega. No emite documentos ni transmite datos del personal.

La consulta administrativa de soportes va sólo a Sandra. Diego/Hilary conservan la ruta operativa autorizada, sus preguntas pendientes y entregas originales. Los detalles y repeticiones permanecen en la misma revisión sin otros acuses; una toma humana sigue prevaleciendo y una nueva solicitud explícita conserva su caso independiente. Seguridad y pagos mantienen sus controles anteriores. El guardia compartido admite documentos de un servicio técnico relatado sin trasladar precios o conocimientos de Fumigación.

Código y pruebas aisladas no acreditan instalación o el siguiente recorrido legítimo: verificar el checkpoint de este control y las API propias antes de afirmar producción. Programa, documentos de negocio, audios, historia y guardados reales conservan sus pendientes.

## Precios aportados y autorización directa — 05/10/2026

La usuaria aportó dos tablas, una aclaración escrita y un audio, y después ordenó: «dile los precios a mariangel y ponlo a recibir servicios y cotizarlos». Autoriza incorporar esos precios exclusivamente a María/FUMIGACION y mantener la recepción. La autoridad es esta orden directa; el material adjunto es la fuente de las cifras. Sus textos sobre productos, inocuidad, garantías o tratamientos no se convierten en política por esta aprobación de precios.

| Habitaciones | m² | Cucarachas COP | Roedores COP |
|---|---|---|---|
| 1 | 30–40 | 99.000 | 129.000 |
| 2 | 41–50 | 129.000 | 129.000 |
| 3 | 51–75 | 149.000 | 149.000 |
| 4 | 76–100 | 169.000 | 169.000 |
| 5 | 101–150 | 189.000 | 189.000 |
| 6 | 151–200 | 209.000 | 209.000 |

Se cotiza la columna **Valor de fumigación**; el mínimo es referencia interna y no se aplica como descuento automático. Comején suma50.000 a la fila correspondiente de cucarachas. La corrección directa posterior del 05/10 reemplaza70.000 por **99.000 por colchón confirmado**;100.000 continúa como propuesta histórica y no se activa. Desde6colchones o con bases/otros muebles mencionados, el alcance y un eventual descuento necesitan cotización operativa. Avispas requiere inspección por tamaño y altura del panal, sin precio inventado.

`businessPriceGuard=direct-approved-table-standard-price-and-scoped-extras-v1` exige una tabla exacta, la aprobación directa y los hashes de los cuatro materiales. La importación administrativa guarda cifrada una única tabla; rechaza cambios de cifras, descuentos, otra aprobación o S.TECNICO. No simula una fuente nativa de WhatsApp para los adjuntos del chat de Codex. Antes de cada salida se reevalúan alcance, precio, persistencia, línea propia y atención humana.

La selección automática cubre una casa o apartamento ordinario en Medellín,Bello,Envigado,Itagüí,Sabaneta,LaEstrella,Copacabana oGirardota. Habitaciones y área, si aparecen ambas, deben coincidir en una fila. Medidas lineales, rangos ambiguos, tamaños fuera de tabla, varias propiedades, zonas comunes, inmuebles especiales, pisos/alcances adicionales o desplazamientos externos mantienen revisión; se conservan los cuatro ejemplos nativos anteriores con su alcance estricto. La tabla directa tiene prioridad cuando sus condiciones coinciden. Una cotización aceptada sólo continúa después de entrega exacta; disponibilidad y técnico se consultan a Diego/Hilary, sin confirmar reserva o guardar un servicio en el programa.

Preparación y pruebas en `.tmp/direct-prices-20261005/`. Verificar instalación e importación en ese checkpoint antes de atribuirlas a producción. Las otras empresas, los cortes originales, holds, preguntas pendientes y registros de entrega conservan su separación.

### Instalación e importación verificadas — 05/10/2026 20:12Z

Sólo `mariangel-production` fue desplegado, Dokploy DONE con `752852dc10a512bb92332a32018a3f2143bbf9f7`. Pasaron209pruebas aisladas,17nuevas. API e importación propias verificaron la tabla cifrada activa, hash `e906be8ff20357d7c6c3bdc229a926b610e1008442fb3597b2db6171224b8d9b`; recepción habilitada, ambos propietarios OPEN,120chats humanos conservados y cero cola READY/SENDING/UNCERTAIN en ese corte. No se cambiaron corte, variables, claves o holds. Miguel conserva su código anterior y cero precios; sus dos propietarios también OPEN. La siguiente solicitud legítima, entrega de cotización y continuación real siguen pendientes; no se enviaron pruebas a clientes, replays o registros de negocio. El adaptador del programa continúa pendiente y ninguna cotización acredita una reserva guardada.

## Atención de María y revisión solicitada — 05/10/2026

La usuaria pidió que María responda con empatía y ayude al cliente a avanzar bajo revisión estricta. `customerAdviserGuard=warm-scoped-reception-and-factual-next-step-v1` aplica exclusivamente a FUMIGACION: bienvenida breve en la primera recepción, preguntas sobre los datos que faltan, precio aprobado claro y una invitación respetuosa a continuar. Las preguntas siguientes no repiten la bienvenida. Las respuestas comunes aprobadas conservan su texto y fuente.

La preferencia de horario precede a la consulta operativa; disponibilidad, técnico y reserva no se anuncian como confirmados por una aceptación de precio. Los casos especiales reciben una explicación breve del pendiente. No se añaden descuentos, urgencia comercial, garantías, inocuidad, beneficios o resultados no aprobados. Los documentos de un servicio relatado como realizado, incluido «ya nos fumigaron», van a revisión y no reinician la recepción; la negación explícita mantiene su contexto.

Se preservan los controles de remitente, empresa, entrega, fuentes de precio, deduplicación y atención humana antes de cada salida. La supervisión existente revisa respuestas legítimas y corrige fallos comprobados según su frecuencia y las conexiones disponibles. No es aprobación humana continua de cada mensaje ni acredita cobertura histórica completa, servicio guardado o disponibilidad ininterrumpida.

Preparación y evidencia en `.tmp/maria-adviser-20261005/`:216pruebas aisladas,7nuevas;29metadatos y25textos guardados leídos, cero originales de medios y cero respuestas nuevas del bot en esa ventana. No se adoptan instrucciones del personal ni se avanzan los cursores generales por esta lectura parcial. Verificar el checkpoint de instalación antes de afirmar el guardia vigente en el servidor. Sólo María recibe esta instalación; Miguel, Psicólogos, Abogados y sus informes conservan su ámbito.

Instalación verificada20:36Z: Dokploy DONE en `mariangel-production` con `a701ea61f7655409bd8366973edb16d9d51fda78`; API propia devolvió el guardia nuevo y recepción activa. Ambos propietarios OPEN, tabla con el mismo hash,120chats humanos y cero cola READY/SENDING/UNCERTAIN. Se actualizó la supervisión existente sin cambiar frecuencia ni crear otro trabajo. La siguiente respuesta legítima con el tono nuevo y su entrega siguen pendientes; cero envíos de prueba o guardados de negocio del supervisor. Miguel conserva su versión y cero precios.
## Corrección vigente de colchones — 05/10/2026

La usuaria corrigió directamente el precio a **$99.000 por colchón**. Sustituye los $70.000 anteriores y la sugerencia de $100.000 para cotizaciones nuevas del alcance aprobado; los precios de cotizaciones históricas conservan su fuente. La tabla anterior permanece cifrada como historial y su hash exacto se excluye de la selección vigente. No se eliminan preguntas, entregas, atención humana ni cotizaciones previas.

Código propio de María instalado: `7f6e4f2ef1003d5fbbbbd6e83d586f1ea934e7c4`. Tabla vigente guardada y verificada: `e9ff47a70912f5268494c6ebfcb2f5be48234f30a52acf7e5da85f9dc574c726`. Recepción activa y dos propietarios exactos OPEN; cuatro precios nativos y las otras tablas permanecen. S.TECNICO no recibe este catálogo. Las veinticinco comprobaciones enfocadas incluyen conservación del historial cifrado y dos colchones por $198.000; falta la siguiente cotización legítima entregada. Checkpoint: `.tmp/mattress-price-20261005/checkpoint-private.json`.

