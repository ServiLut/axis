# Autonomía administrativa de Psicólogos en Colombia

## Privacidad y lenguaje — instrucción directa del 30 de septiembre de 2026

Las respuestas externas comunican el resultado útil o la única pregunta necesaria, con respeto y brevedad. No anuncian a quién se informará, qué se preguntará al personal, pasos internos, controles, razonamientos ni nombres de sistemas. Una confirmación pendiente se expresa como pendiente; no se promete una reserva, pago, plazo o decisión. Los datos de otras personas y empresas no se divulgan. Los informes internos autorizados a Sandra conservan el contexto mínimo necesario para resolver la duda.

Las respuestas de derivación se corrigieron y existe un control previo al envío que bloquea patrones de información interna, tecnología, secretos u otra empresa, incluso en mensajes previamente encolados. Este filtro es una protección adicional, no una certificación de que toda forma posible de filtración esté cubierta. El aislamiento de identidad, registros y destinatarios sigue siendo obligatorio.

Ante insultos dirigidos a la atención: mantener respeto y pasar a atención humana sin discutir, amenazar ni anunciar destinatarios internos. Una cita, un relato de maltrato o angustia no se trata por sí mismo como agresión. Las urgencias conservan prioridad. Las quejas, compensaciones, amenazas y casos no cubiertos requieren pautas concretas de Sandra; preguntar una duda contextualizada a la vez y conservar las respuestas con fuente.

## Corrección de notificaciones — 30 de septiembre de 2026

Los informes y alertas de supervisión a Sandra deben registrarse antes de enviarse mediante `POST /api/integrations/psicologos/automation`, acción `notify-chief`, con `key` estable por hecho/informe y `content`. Usa la credencial de automatización existente, nunca una credencial de otra empresa. El destinatario está fijado a Sandra. No enviar esos avisos directamente desde WhatsApp Web: su eco carece del registro de salida y puede confundirse con una toma humana.

La respuesta 202 indica registro en la cola; `ACCEPTED` significa aceptación por Chatwoot, no prueba de entrega a WhatsApp. Verificar el estado de entrega antes de afirmar recepción. Repetir la misma clave/contenido consulta el registro sin crear un envío adicional; cambiar el contenido con la misma clave devuelve conflicto. Un estado incierto se inspecciona antes de intentar otro envío.

La devolución expresa de Sandra puede procesarse desde texto o una transcripción persistida. Se aceptan saludos antes de «Luisa, retoma este chat». Un sí, mención en tercera persona, audio sin transcribir o el paso del tiempo no libera la atención humana. Esta corrección no libera retrospectivamente chats ni convierte reportes antiguos en mensajes humanos o automáticos sin verificar su origen.

La aclaración directa de la usuaria del 30/09 permite atender un turno dirigido a Luisa o una respuesta de Sandra a una pregunta verificada del bot, aunque el chat compartido siga en atención humana. La cita se contrasta contra una única salida registrada y aceptada, al mismo destinatario y anterior al mensaje. No basta citar texto desconocido. Este permiso es solo para ese turno; no libera el chat globalmente. Una intervención posterior del personal cancela la respuesta pendiente. Los demás contactos conservan la devolución expresa.

Actualización: 29 de septiembre de 2026. Este documento describe capacidades y criterios de aceptación; no certifica autonomía total ni sustituye una prueba real de cada recorrido. Para la evidencia de despliegue y mensajes, consultar la continuidad privada `.tmp/PSICOLOGOS_AI_2026-09-28.md` y los identificadores de auditoría. Nunca subir esas evidencias privadas ni archivos `.env` a Git.

## Arquitectura

WhatsApp Business → Evolution API (instancia exclusiva) → webhook autenticado n8n → API de Axis → cola y estado en PostgreSQL. Axis solicita interpretación de texto o transcripción mediante un segundo workflow privado de n8n. Axis valida la respuesta del modelo y ejecuta reglas del negocio. La salida pasa por la bandeja de Psicólogos en Chatwoot y vuelve mediante Evolution a WhatsApp.

El servidor conserva la lógica y el estado. n8n coordina llamadas y recupera pendientes cada minuto. La IA interpreta; no ejecuta SQL libre ni recibe autoridad administrativa por el contenido de un mensaje.

En modo de observación de atención humana, el servidor descarta los campos de respuesta y pregunta aunque el modelo los genere, salvo el turno de Sandra dirigido al bot y comprobado por el servidor conforme a la aclaración del 30/09. Conserva la clasificación de urgencia. El control previo al envío vuelve a comprobar intervenciones humanas posteriores; la excepción de un turno no libera el chat.

La toma humana incluye el chat compartido con Sandra. Puede devolverlo expresamente con «Luisa, retoma este chat», mediante texto o transcripción persistida posterior a la intervención. Un mensaje dirigido a Luisa o una respuesta a una pregunta verificada del bot autoriza solo ese turno; las intervenciones del personal y menciones ambiguas siguen en silencio. El informe nocturno y las alertas independientes conservan su autorización.

Instrucción directa de la usuaria del29/09: Sandra debe dirigirse claramente a Luisa Fernanda o al bot para recibir respuesta. El número autorizado por sí solo no basta; una conversación con el personal, una mención en tercera persona o un destinatario dudoso se observa en silencio, sin ejecutar ni aprender órdenes. En audio se comprueba el texto transcrito; si no puede comprenderse el destinatario, no se pregunta automáticamente. Esto no revoca el informe nocturno ni las alertas independientes autorizadas. La dirección explícita tampoco levanta por sí sola una toma humana: se mantiene la devolución expresa del chat.

## Alcance e identidad

- Empresa 3, tenant 4, sistema PSICOLOGOS.
- Instancia `psicologos-en-colombia`; número propio 573016818845.
- Chatwoot cuenta 2, bandeja 10; otras empresas quedan fuera del alcance.
- Única jefe autorizada por número: Sandra 573016803926. Una persona que escriba “soy Sandra” desde otro teléfono sigue siendo cliente.
- Todo nuevo número puede entrar sin estar guardado en la libreta, Chatwoot o Axis. Se crea estado de conversación; el registro administrativo de paciente requiere datos y confirmación.

## Capacidades y comprobación

| Proceso | Implementación | Verificación pendiente o límite |
|---|---|---|
| Entrada y salida WhatsApp | Activas por Evolution/Chatwoot/n8n | Revisar conexión y entrega; aceptación HTTP no equivale a entrega |
| Números sin guardar | Admitidos por teléfono; creación automática de contacto/conversación Chatwoot | Pruebas de contrato específicas; la libreta del teléfono no se usa como filtro |
| Texto y audio | Interpretación y transcripción privadas; probadas con audios reales | Dependen del proveedor y su saldo; fallos requieren aviso |
| Servicios | Respuestas rápidas aprobadas, opción múltiple y cambio de servicio | No inventar precios, especialidades ni disponibilidad |
| Alta de paciente | Borrador por mensajes, validación, resumen, confirmación del remitente y alta auditada en empresa correcta | Duplicados, identidad discordante, ambigüedad o fallo de escritura se revisan; probar un caso real sin inventar pacientes |
| Continuidad de paciente | Petición inequívoca de continuar: busca registro único por teléfono con atención realizada en Psicólogos y recoge preferencias sin repetir el alta | Reconoce profesional anterior solo si el paciente lo solicita; no presume disponibilidad, tarifa ni saldo. Identidad ambigua, cita futura existente o profesional inactivo requieren revisión. No reactiva chats atendidos por personas |
| Preferencias | Recoge psicólogo/psicóloga/indiferente, modalidad y fecha/hora inequívocas | La propuesta libre y selección de profesional siguen pendientes |
| Reserva confirmada | Propuesta administrativa; confirmaciones de paciente y profesional; nueva validación transaccional antes de guardar | Falta construir propuestas automáticamente desde preferencias y gestionar alternativas/reprogramación |
| Solicitud de alquiler por WhatsApp | Conserva hasta cuatro horarios separados; verifica profesional por teléfono, consultorio por nombre visible, agenda, duración y tarifa; ofrece propuesta para los horarios completos y pregunta solo datos faltantes | Confirmación expresa antes de crear la reserva; citas previas no se duplican. Cambios a propuestas enviadas, agenda incompleta o identidad ambigua se revisan. Prueba real completa de confirmación aún pendiente |
| Comprobantes | Asociación de soporte existente revisado por Sandra; nunca presume ingreso bancario | Pendiente subida automática del archivo y conciliación con fuente independiente accesible |
| Reactivación | Clientes y profesionales compradores, última prestación/compra >6 meses, envíos 08–19 Bogotá, intervalo global mínimo60s, hasta20/día | Requiere autorización de contacto documentada; la orden de Sandra no prueba el permiso del destinatario. No equivale a seis meses sin conversación |
| Contexto | Últimos30 mensajes disponibles del mismo teléfono/bandeja, incluidos mensajes del personal y audios ya transcritos | Cobertura reciente, no historial completo. No inferir contenido de adjuntos o audios antiguos sin transcripción |
| Reportes | Automatizaciones separadas de supervisión y apertura/cierre | Su ejecución local depende de equipo y conexiones; verificar cada entrega |

## Reglas conservadas

Sesión suelta: abono de 20.000 COP descontable. Paquete: pago completo una sola vez; sesiones prepagadas no generan nuevo anticipo. Alquiler: profesional registrado, duración, consultorio y horario 07:00–20:00, sin exigir comprobante anticipado. Toda reserva tiene psicólogo asignado y disponibilidad vigente. El comprobante es evidencia, no confirmación bancaria.

Una respuesta del personal pausa el chat desde la recepción del evento, antes de interpretar otros mensajes. Por instrucción de la usuaria del29/09, se elimina la reanudación automática tras15minutos: Sandra debe devolver explícitamente la conversación al bot. Se cancelan respuestas pendientes y continuaciones antiguas; cada salida vuelve a comprobar la toma humana justo antes de enviarse. Una petición ya transmitida al proveedor no puede retirarse; se conserva evidencia de esa limitación y del retraso posible de webhooks. Las urgencias siguen generando aviso a Sandra; una conversación tomada por personal no recibe una segunda respuesta automática. Las dudas operativas se consultan con una explicación breve y una pregunta concreta.

El intérprete observa los mensajes recientes del personal de la misma conversación, distinguiéndolos de los propios mensajes mediante referencias de salida y correlación temporal limitada. En HUMAN analiza sin proponer respuesta externa ni reanudar. Los ejemplos enseñan tono, continuidad y preguntas pertinentes; no autorizan nuevas tarifas, cobros, reservas, permisos, identidades o reglas. Las pautas de tono revisadas se conservan separadas de datos particulares. No se afirma entrenamiento de un modelo ni identidad individual de quien usa la cuenta compartida. Las respuestas rápidas aprobadas siguen siendo la fuente de servicios y precios.

Orden de Sandra en audio del28/09/2026: la atención entrante continúa24h; solo reactivación se limita08–19. La separación mínima entre envíos se controla en BD aun con trabajadores simultáneos, sin bloquear las respuestas normales. El ritmo no garantiza evitar restricciones de WhatsApp. El bloqueo de un envío incierto evita repetirlo.

Los registros antiguos con empresa nula requieren evidencia de actividad en empresa3 antes de reutilizarlos. No se migra masivamente su empresa ni se crea un duplicado al encontrarlos. Los alquileres consumidos por un profesional se distinguen de su trabajo atendiendo pacientes. Las compras recientes de paquetes y cargos de recepción excluyen inactividad aparente. Todo cambio se prueba antes de publicación; aplicar primero `docs/sql/2026-09-28-psychology-campaign-pacing.sql`.

Las propuestas y su confirmación final aplican la misma verificación de pertenencia para pacientes y profesionales históricos. Antes de guardar, se vuelve a comprobar el teléfono y la identidad única del paciente y del profesional; cambios de titular, duplicados, baja, suspensión o actividad en otra empresa requieren revisión. La pertenencia histórica permite reutilizar el registro; no prueba disponibilidad ni sustituye las confirmaciones de la reserva.

Las reservas respetan la pausa por atención humana de ambos participantes, incluso si el mensaje del personal está pendiente de procesar. Un eco verificado del propio bot no se considera toma humana. Las asignaciones operativas verificadas son Daniel Felipe (28) para neuropsicología, Diana Marcela (82) para sexología y Deicy (24) para certificados de apoyo emocional; Daniel y Diana no se asignan a otras terapias. Estas reglas no restringen su alquiler como profesionales. Cualquier cambio de tarifa, nombre de servicio o cantidad de sesiones desde la propuesta requiere una nueva propuesta. Un comando de Sandra no omite estas validaciones.

El aprendizaje guarda aclaraciones de Sandra con evento de origen y fecha. Antes de interpretar cada mensaje se buscan hasta 24 instrucciones activas: primero las relacionadas con el tema y después las recientes. La búsqueda considera todo el conocimiento activo, no solo las últimas doce entradas. No se guardan como reglas las respuestas inventadas del bot ni afirmaciones de clientes. Aprender una instrucción no implementa una función nueva ni prueba disponibilidad, pago o tarifa vigente. Si hay contradicción, se consulta la diferencia concreta.

Una indicación explícita de Sandra expresada como preocupación o pregunta puede guardarse sin volver a pedir autorización, incluso si la interpretación la etiquetó como pregunta. Esta tolerancia se limita a recordar una indicación con alta confianza del número autorizado; no habilita envíos, pausas, campañas ni acciones financieras. El acuse ocurre después de guardar y auditar. Importes sin periodo, fecha o soporte no se convierten en gastos pagados, reparto liquidado ni ganancia comprobada.

Una frase de audio incoherente, negación dudosa o referencia sin resolver queda pendiente de aclaración y bloquea el aprendizaje y las acciones propuestas, aunque la confianza global sea alta. La pregunta se limita al fragmento dudoso. Se conserva a quién iba dirigida la indicación y su alcance: una tarea del personal en cámaras no habilita al bot para verlas ni para cobrar. Las respuestas de baja confianza no piden un número si la duda trata sobre una regla operativa.

La recepción está activada de forma persistente en PostgreSQL y el flujo n8n publicado recupera pendientes cada minuto en horario America/Bogota, sin una activación diaria. Las pausas expresas se conservan hasta que Sandra devuelve el chat al bot. La continuidad depende de los servidores, la sesión WhatsApp y el proveedor de IA. Una configuración activa no prueba recuperación ante todos los fallos de infraestructura.

Antes de saludar se verifica si el teléfono pertenece a un profesional de la empresa. Un estado NEW de la integración no demuestra que sea una persona nueva. Se consulta el historial disponible y se conserva el texto citado del mensaje entrante como contexto no confiable. Los certificados administrativos se distinguen del servicio de apoyo emocional. Las preguntas de seguimiento sin antecedente suficiente se consultan con Sandra; no reinician una venta. El historial anterior a la integración puede faltar: no afirmar lectura completa.

El saludo aprobado es: «Hola 😊 ¿Cómo estás? Soy Luisa Fernanda de *Psicólogos en Colombia*. Cuéntame, ¿en qué podemos ayudarte hoy?». Solo se usa al iniciar una conversación nueva. Un saludo simple sin historial, cita textual ni identidad profesional puede omitir la llamada al modelo, después de verificar contexto. Menos de tres segundos es un objetivo, todavía no una latencia de extremo a extremo garantizada.

Una pregunta social aislada («¿cómo estás?») o un agradecimiento breve reciben una respuesta cálida sin consultar a Sandra ni reiniciar datos o reservas en curso. Se reconoce la frase completa, no palabras dentro de solicitudes. Las citas textuales, pendientes administrativos, identidad ambigua, urgencias y atención humana conservan sus controles. La corrección del29/09 tiene regresiones sintéticas; su publicación no demuestra todavía una nueva conversación real completada con esa respuesta.

Un pedido concreto de reserva tiene prioridad sobre el texto de oferta del servicio. El mensaje actual puede contener contexto suficiente aunque falte el historial antiguo. «Consultorio 10» se busca por su nombre y no por el identificador interno 10. Las solicitudes para dos días se mantienen separadas; duración y consultorio de la primera no se atribuyen a la segunda. La propuesta muestra fecha, horas y valor actuales y no confirma ocupación hasta la aceptación y nueva validación. Si ya existe una cita a esa hora para el profesional, se informa su existencia sin volver a crearla. No se vuelve a preguntar si desea agendar a quien ya lo pidió.

Antes de presentar una cita anterior como alquiler existente, se verifica su catálogo y empresa, consultorio y horario completos. Si el consultorio o la duración solicitados difieren de lo guardado, se conserva el registro y se pide aclaración a Sandra explicando ambas opciones. Una cita donde el profesional atiende a un paciente no prueba que tenga un alquiler. La duración solicitada se conserva en minutos exactos. La usuaria aclaró el 30/09 que el operador introduce el valor del adicional por minutos, incluso cero; no se redondea a horas completas ni se inventa una tarifa proporcional. Si falta ese valor, el bot consulta internamente antes de cotizar o reservar.

La migración histórica `docs/sql/2026-09-28-psychology-handover.sql` conserva las referencias de continuaciones antiguas para auditoría. Desde el29/09 no se crean ni se envían continuaciones por inactividad. Una devolución expresa de Sandra limpia la pausa, pero no habilita respuestas preparadas antes de esa devolución; se espera el siguiente mensaje para responder con contexto actual.

Axis ofrece «Conciliar pago / comprobante» desde la cita, con formulario de dinero recibido y soporte independiente. Al completar el valor, actualiza CONCILIADO y libro diario; abonos quedan pendientes. Los pagos de paquetes se registran una vez. Los pagos anteriores requieren revisión expresa y fecha real; consultar o subir un comprobante no fabrica ingresos. Por instrucción directa de la usuaria del 29/09/2026, la referencia es opcional en todos los medios y también en registros anteriores revisados. Si se aporta, corresponde al número de transacción o recibo, no a la cuenta de origen; se conserva la comprobación de duplicados. Monto, fecha, medio y confirmación de dinero recibido siguen siendo necesarios. PDF/JPG/PNG/WEBP hasta 8 MB; los errores de carga ya no muestran éxito.

Eliminar una cita programada devuelve su sesión reservada al mismo paquete una sola vez, en una transacción con auditoría obligatoria. Las canceladas no devuelven saldo nuevamente. Se conservan citas realizadas, con comprobante, conciliadas o vinculadas a pagos, cargos o propuestas del bot; se usa cancelación o revisión para mantener su historial. La eliminación verifica empresa, titular y coherencia del saldo. Esto no corrige automáticamente saldos históricos ni acredita un reintegro de dinero. Pruebas de base de datos y acción del servidor cubren reintentos y reversión ante fallos; una eliminación real en producción no se simula sobre registros de clientes.

Las tareas diarias vuelven a comprobar elegibilidad cada día; no reiteran una invitación de la misma campaña. Antes de cada envío se consulta el contexto reciente, el número de citas realizadas y el último profesional registrado. Historial no disponible, audio histórico sin transcribir, rechazo, duda o conversación a cargo humano detienen esa invitación y se notifican a Sandra. Se mantiene el texto breve aprobado, sin incluir datos clínicos, precios históricos ni nombres de profesionales. Inmediatamente antes de enviar se vuelven a comprobar horario y autorización de contacto.

## Supervisión temporal

### Aclaraciones de la usuaria y verificación del 30/09/2026

- Identificar el tipo de contacto por registros y el propósito por lo conversado antes de responder. Un saludo compuesto como «Hola muy buenos días cómo estás?» recibe un saludo cálido; no genera por sí solo una consulta a Sandra, una reserva pendiente ni una solicitud de datos repetidos. Una petición concreta en el mismo mensaje conserva prioridad sobre el saludo.
- Ante un alquiler, conservar fecha y hora ya indicadas y preguntar solamente lo que falte, por ejemplo la duración. Consultar la agenda y la tarifa vigentes, ofrecer los consultorios disponibles respetando preferencias verificadas y presentar el valor antes de pedir la elección. No asumir duración ni asignar un consultorio diferente sin elección.
- La usuaria ordenó separar el espacio cuando exista disponibilidad y la persona confirme. La aceptación inequívoca de una propuesta única vuelve a comprobar agenda, identidad, precio y toma humana; crea la reserva y luego encola la confirmación. Los reintentos de la misma aceptación no crean una segunda cita. No se exige un anticipo inventado para alquiler ni se registra un ingreso por recibir un comprobante.
- El mensaje de reserva guardada requiere el identificador real de la cita. Las reservas ordinarias se incorporan al informe nocturno; no originan avisos separados a Sandra. Errores nuevos y dudas operativas concretas conservan su canal independiente.
- Sandra puede dirigirse explícitamente a Luisa/bot o responder a una pregunta previa cuya salida sea verificable. Eso habilita esa intervención concreta durante atención humana, sin devolver globalmente el chat ni habilitar instrucciones del personal. El evento preparado para interpretación debe ser el mismo que se ejecuta. Si falta análisis, conservar pendiente interno sin enviar una pregunta genérica ni afirmar que se aprendió.
- Cada mensaje externo pasa por un control de privacidad: no revela nombres de destinatarios internos, a quién se consultará, detalles de sistemas o tareas internas, datos ajenos ni información de otra empresa. Ante trato grosero, responder con respeto y límites breves; urgencias y amenazas se revisan. No confundir malestar, una cita textual o un relato con agresión dirigida al equipo.

Evidencia: regresiones de saludo/identidad/alquiler, recepción de citas textuales, instrucciones de Sandra y reserva transaccional pasan. Se comprobó en producción el canal abierto, empresa 3 / tenant 4 / PSICOLOGOS y los dos flujos del proyecto EhbXYnreuotCXRlY. Los casos reales con intervención posterior del personal no se reactivaron para probar. Falta una nueva reserva real completada de principio a fin con estas correcciones; no se declara autonomía integral.

La comunicación de reservas usa días y horas cotidianos y confirmaciones naturales. Un «sí» debe corresponder a una única pregunta de reserva enviada antes de la respuesta; si hay varios horarios o una contradicción, se pide aclaración. Los códigos siguen siendo internos. El mensaje de reserva completada se envía después del registro transaccional. Los precios y respuestas rápidas aprobadas conservan su fuente.

Las preferencias de consultorio se guardan por profesional verificado con cita textual, evento y fecha, únicamente cuando expresa un gusto o rechazo. No se deducen de visitas anteriores. Se consulta disponibilidad actual, se presentan primero las opciones preferidas disponibles y la persona elige; no se asigna automáticamente una alternativa. Las dudas de identidad o instrucciones contradictorias requieren Sandra. Una regla general aprendida de Sandra no identifica por sí sola la preferencia de cada profesional.

Sandra indicó directamente el 29/09/2026 a las 10:31, evento `3AEF06952898296AD66C`, recibir solo un informe breve en la noche. El informe queda a las 9:30 p. m., hora de Colombia; la revisión de las 8 p. m. prepara insumos internos. Se suprimen la apertura y los avisos ordinarios de cambios de agenda. El cierre incluye acciones de captación y retención basadas en fuentes disponibles, separa ingresos de gastos y declara cobertura incompleta. Permanecen las alertas de errores que requieren acción y las preguntas operativas necesarias. Son tareas de Codex que requieren equipo y conexiones disponibles; no equivalen todavía a reportes completamente autónomos en n8n.

Las consultas a Sandra deben incluir el hecho o solicitud disponible, indicar qué falta confirmar y formular la pregunta concreta. No se le pide revisar otra conversación. Los avisos del bot conservan un extracto atribuido del mensaje y del antecedente citado cuando existe, con longitud limitada; no convierten lo dicho por un contacto en un hecho verificado. Ante urgencia se avisa del riesgo sin reproducir la narrativa clínica. La pregunta de un profesional por la confirmación de asistencia de su paciente requiere esa confirmación, no una nueva venta de alquiler de consultorio. Los chats HUMAN continúan en silencio.

Un archivo cuyo contenido no se ha podido leer no se presenta como comprobante ni se presupone que corresponda a una cita. La consulta explica esa limitación y pide qué información falta para aclarar la solicitud. Cuando existe una solicitud expresa sobre un comprobante, se conserva como pago reportado sin verificar y se distingue cita de paquete; nunca acredita por sí sola un ingreso.

Automatización `supervisi-n-y-autonom-a-psic-logos`, cada 30 minutos en este chat. Debe revisar salud, mensajes nuevos y bloqueos, continuar correcciones y verificar despliegues. Guardar línea base; no repetir alertas ni tocar conversaciones tomadas por humanos. Mantener silencio si no cambió nada accionable. La ejecución necesita el equipo encendido y Codex disponible; el bot de servidor tiene infraestructura independiente.

No declarar el objetivo completo hasta verificar:

1. Consulta inicial desde número nuevo → información aprobada → datos confirmados → registro correcto y sin duplicados.
2. Preferencias → disponibilidad de agenda y confirmación profesional → confirmación paciente → cita real correcta, sin colisiones ni duplicados.
3. Pago o paquete correctamente asociado, sin duplicar ingresos, con soporte y comprobación independiente cuando se declare conciliación bancaria.
4. Alquiler, alternativas, cancelación/reprogramación y recuperación ante fallos funcionando según reglas autorizadas.
5. Órdenes de Sandra, reactivación y reportes con progreso y entrega verificados.
6. Validación real controlada de cada flujo, registro de fallos y límites. Las pruebas sintéticas no demuestran una cita ni un cobro real.

Al completar lo anterior, informar capacidades y excepciones humanas que se conservan y retirar solo la supervisión temporal; mantener bot y reportes diarios. No comprar créditos ni activar recarga automática sin autorización específica.

### Importes recibidos y horarios exactos — 30/09/2026

Se permite registrar un importe recibido mayor al saldo, manteniendo el precio original del servicio y auditando el adicional recibido. Un importe menor requiere confirmarlo expresamente como abono y conserva el saldo pendiente. Un servicio ya pagado rechaza otro registro. La confirmación de dinero recibido, la revisión de pagos anteriores, el ámbito de empresa y la deduplicación siguen siendo obligatorios. La pantalla no constituye prueba de ingreso bancario.

### Conexión y preguntas directas — 30/09/2026

El estado `enabled` solo indica habilitación. Consultar la acción autenticada `channel-health` para comprobar la conexión efectiva, el número propietario y la bandeja de Psicólogos. `ready: true` acredita esas comprobaciones en la fecha indicada; la recepción, interpretación y entrega requieren eventos reales. Un error de red queda como disponibilidad desconocida, nunca como conectado.

Las preguntas dirigidas sin coma, por ejemplo «Luisa estás funcionando?» y el caso real «Luisa estan funcionando?», autorizan ese turno verificado de Sandra. La respuesta de presencia usa el mensaje recibido, sin inferir que todas las funciones estén listas y sin liberar globalmente un chat en atención humana. Una mención en tercera persona sigue sin conferir autoridad.
