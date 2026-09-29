# Autonomía administrativa de Psicólogos en Colombia

Actualización: 29 de septiembre de 2026. Este documento describe capacidades y criterios de aceptación; no certifica autonomía total ni sustituye una prueba real de cada recorrido. Para la evidencia de despliegue y mensajes, consultar la continuidad privada `.tmp/PSICOLOGOS_AI_2026-09-28.md` y los identificadores de auditoría. Nunca subir esas evidencias privadas ni archivos `.env` a Git.

## Arquitectura

WhatsApp Business → Evolution API (instancia exclusiva) → webhook autenticado n8n → API de Axis → cola y estado en PostgreSQL. Axis solicita interpretación de texto o transcripción mediante un segundo workflow privado de n8n. Axis valida la respuesta del modelo y ejecuta reglas del negocio. La salida pasa por la bandeja de Psicólogos en Chatwoot y vuelve mediante Evolution a WhatsApp.

El servidor conserva la lógica y el estado. n8n coordina llamadas y recupera pendientes cada minuto. La IA interpreta; no ejecuta SQL libre ni recibe autoridad administrativa por el contenido de un mensaje.

En modo de observación de atención humana, el servidor descarta los campos de respuesta y pregunta aunque el modelo los genere. Conserva la clasificación de urgencia para los controles existentes. Esta protección se aplica al contexto de interpretación; el control previo al envío vuelve a comprobar las tomas humanas posteriores. Las pruebas de este filtro no sustituyen una devolución real del chat por Sandra.

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

Un pedido concreto de reserva tiene prioridad sobre el texto de oferta del servicio. El mensaje actual puede contener contexto suficiente aunque falte el historial antiguo. «Consultorio 10» se busca por su nombre y no por el identificador interno 10. Las solicitudes para dos días se mantienen separadas; duración y consultorio de la primera no se atribuyen a la segunda. La propuesta muestra fecha, horas y valor actuales y no confirma ocupación hasta la aceptación y nueva validación. Si ya existe una cita a esa hora para el profesional, se informa su existencia sin volver a crearla. No se vuelve a preguntar si desea agendar a quien ya lo pidió.

Antes de presentar una cita anterior como alquiler existente, se verifica su catálogo y empresa, consultorio y horario completos. Si el consultorio o la duración solicitados difieren de lo guardado, se conserva el registro y se pide aclaración a Sandra explicando ambas opciones. Una cita donde el profesional atiende a un paciente no prueba que tenga un alquiler. Una solicitud de 55 minutos se compara con la hora completa que incluye los cinco minutos de cortesía.

La migración histórica `docs/sql/2026-09-28-psychology-handover.sql` conserva las referencias de continuaciones antiguas para auditoría. Desde el29/09 no se crean ni se envían continuaciones por inactividad. Una devolución expresa de Sandra limpia la pausa, pero no habilita respuestas preparadas antes de esa devolución; se espera el siguiente mensaje para responder con contexto actual.

Axis ofrece «Conciliar pago / comprobante» desde la cita, con formulario de dinero recibido y soporte independiente. Al completar el valor, actualiza CONCILIADO y libro diario; abonos quedan pendientes. Los pagos de paquetes se registran una vez. Los pagos anteriores requieren revisión expresa, referencia y fecha real; consultar o subir un comprobante no fabrica ingresos. PDF/JPG/PNG/WEBP hasta 8 MB; los errores de carga ya no muestran éxito.

Eliminar una cita programada devuelve su sesión reservada al mismo paquete una sola vez, en una transacción con auditoría obligatoria. Las canceladas no devuelven saldo nuevamente. Se conservan citas realizadas, con comprobante, conciliadas o vinculadas a pagos, cargos o propuestas del bot; se usa cancelación o revisión para mantener su historial. La eliminación verifica empresa, titular y coherencia del saldo. Esto no corrige automáticamente saldos históricos ni acredita un reintegro de dinero. Pruebas de base de datos y acción del servidor cubren reintentos y reversión ante fallos; una eliminación real en producción no se simula sobre registros de clientes.

Las tareas diarias vuelven a comprobar elegibilidad cada día; no reiteran una invitación de la misma campaña. Antes de cada envío se consulta el contexto reciente, el número de citas realizadas y el último profesional registrado. Historial no disponible, audio histórico sin transcribir, rechazo, duda o conversación a cargo humano detienen esa invitación y se notifican a Sandra. Se mantiene el texto breve aprobado, sin incluir datos clínicos, precios históricos ni nombres de profesionales. Inmediatamente antes de enviar se vuelven a comprobar horario y autorización de contacto.

## Supervisión temporal

La comunicación de reservas usa días y horas cotidianos y confirmaciones naturales. Un «sí» debe corresponder a una única pregunta de reserva enviada antes de la respuesta; si hay varios horarios o una contradicción, se pide aclaración. Los códigos siguen siendo internos. El mensaje de reserva completada se envía después del registro transaccional. Los precios y respuestas rápidas aprobadas conservan su fuente.

Las preferencias de consultorio se guardan por profesional verificado con cita textual, evento y fecha, únicamente cuando expresa un gusto o rechazo. No se deducen de visitas anteriores. Se consulta disponibilidad actual, se presentan primero las opciones preferidas disponibles y la persona elige; no se asigna automáticamente una alternativa. Las dudas de identidad o instrucciones contradictorias requieren Sandra. Una regla general aprendida de Sandra no identifica por sí sola la preferencia de cada profesional.

Sandra indicó directamente el 29/09/2026 a las 10:31, evento `3AEF06952898296AD66C`, recibir solo un informe breve en la noche. El informe queda a las 9:30 p. m., hora de Colombia; la revisión de las 8 p. m. prepara insumos internos. Se suprimen la apertura y los avisos ordinarios de cambios de agenda. El cierre incluye acciones de captación y retención basadas en fuentes disponibles, separa ingresos de gastos y declara cobertura incompleta. Permanecen las alertas de errores que requieren acción y las preguntas operativas necesarias. Son tareas de Codex que requieren equipo y conexiones disponibles; no equivalen todavía a reportes completamente autónomos en n8n.

Las consultas a Sandra deben incluir el hecho o solicitud disponible, indicar qué falta confirmar y formular la pregunta concreta. No se le pide revisar otra conversación. Los avisos del bot conservan un extracto atribuido del mensaje y del antecedente citado cuando existe, con longitud limitada; no convierten lo dicho por un contacto en un hecho verificado. Ante urgencia se avisa del riesgo sin reproducir la narrativa clínica. La pregunta de un profesional por la confirmación de asistencia de su paciente requiere esa confirmación, no una nueva venta de alquiler de consultorio. Los chats HUMAN continúan en silencio.

Automatización `supervisi-n-y-autonom-a-psic-logos`, cada 30 minutos en este chat. Debe revisar salud, mensajes nuevos y bloqueos, continuar correcciones y verificar despliegues. Guardar línea base; no repetir alertas ni tocar conversaciones tomadas por humanos. Mantener silencio si no cambió nada accionable. La ejecución necesita el equipo encendido y Codex disponible; el bot de servidor tiene infraestructura independiente.

No declarar el objetivo completo hasta verificar:

1. Consulta inicial desde número nuevo → información aprobada → datos confirmados → registro correcto y sin duplicados.
2. Preferencias → disponibilidad de agenda y confirmación profesional → confirmación paciente → cita real correcta, sin colisiones ni duplicados.
3. Pago o paquete correctamente asociado, sin duplicar ingresos, con soporte y comprobación independiente cuando se declare conciliación bancaria.
4. Alquiler, alternativas, cancelación/reprogramación y recuperación ante fallos funcionando según reglas autorizadas.
5. Órdenes de Sandra, reactivación y reportes con progreso y entrega verificados.
6. Validación real controlada de cada flujo, registro de fallos y límites. Las pruebas sintéticas no demuestran una cita ni un cobro real.

Al completar lo anterior, informar capacidades y excepciones humanas que se conservan y retirar solo la supervisión temporal; mantener bot y reportes diarios. No comprar créditos ni activar recarga automática sin autorización específica.
