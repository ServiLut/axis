# Autonomía administrativa de Psicólogos en Colombia

Actualización: 28 de septiembre de 2026. Este documento describe capacidades y criterios de aceptación; no certifica autonomía total ni sustituye una prueba real de cada recorrido. Para la evidencia de despliegue y mensajes, consultar la continuidad privada `.tmp/PSICOLOGOS_AI_2026-09-28.md` y los identificadores de auditoría. Nunca subir esas evidencias privadas ni archivos `.env` a Git.

## Arquitectura

WhatsApp Business → Evolution API (instancia exclusiva) → webhook autenticado n8n → API de Axis → cola y estado en PostgreSQL. Axis solicita interpretación de texto o transcripción mediante un segundo workflow privado de n8n. Axis valida la respuesta del modelo y ejecuta reglas del negocio. La salida pasa por la bandeja de Psicólogos en Chatwoot y vuelve mediante Evolution a WhatsApp.

El servidor conserva la lógica y el estado. n8n coordina llamadas y recupera pendientes cada minuto. La IA interpreta; no ejecuta SQL libre ni recibe autoridad administrativa por el contenido de un mensaje.

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
| Comprobantes | Asociación de soporte existente revisado por Sandra; nunca presume ingreso bancario | Pendiente subida automática del archivo y conciliación con fuente independiente accesible |
| Reactivación | Clientes y profesionales compradores, última prestación/compra >6 meses, envíos 08–19 Bogotá, intervalo global mínimo60s, hasta20/día | Requiere autorización de contacto documentada; la orden de Sandra no prueba el permiso del destinatario. No equivale a seis meses sin conversación |
| Contexto | Últimos30 mensajes disponibles del mismo teléfono/bandeja, incluidos mensajes del personal y audios ya transcritos | Cobertura reciente, no historial completo. No inferir contenido de adjuntos o audios antiguos sin transcripción |
| Reportes | Automatizaciones separadas de supervisión y apertura/cierre | Su ejecución local depende de equipo y conexiones; verificar cada entrega |

## Reglas conservadas

Sesión suelta: abono de 20.000 COP descontable. Paquete: pago completo una sola vez; sesiones prepagadas no generan nuevo anticipo. Alquiler: profesional registrado, duración, consultorio y horario 07:00–20:00, sin exigir comprobante anticipado. Toda reserva tiene psicólogo asignado y disponibilidad vigente. El comprobante es evidencia, no confirmación bancaria.

Una respuesta humana pausa el chat. Si queda un mensaje del cliente sin atender durante 15 minutos, el bot puede retomar tras revisar nuevamente el contexto. No retoma pausas expresas de Sandra, urgencias, dudas pendientes de revisión ni rechazos de contacto. La comprobación corre cada minuto; no implica respuesta exactamente al segundo 900. Las urgencias clínicas reciben acompañamiento inmediato y aviso a Sandra. Las dudas operativas se consultan con una explicación breve y una pregunta concreta en lenguaje cotidiano.

Orden de Sandra en audio del28/09/2026: la atención entrante continúa24h; solo reactivación se limita08–19. La separación mínima entre envíos se controla en BD aun con trabajadores simultáneos, sin bloquear las respuestas normales. El ritmo no garantiza evitar restricciones de WhatsApp. El bloqueo de un envío incierto evita repetirlo.

Los registros antiguos con empresa nula requieren evidencia de actividad en empresa3 antes de reutilizarlos. No se migra masivamente su empresa ni se crea un duplicado al encontrarlos. Los alquileres consumidos por un profesional se distinguen de su trabajo atendiendo pacientes. Las compras recientes de paquetes y cargos de recepción excluyen inactividad aparente. Todo cambio se prueba antes de publicación; aplicar primero `docs/sql/2026-09-28-psychology-campaign-pacing.sql`.

Las propuestas y su confirmación final aplican la misma verificación de pertenencia para pacientes y profesionales históricos. Antes de guardar, se vuelve a comprobar el teléfono y la identidad única del paciente y del profesional; cambios de titular, duplicados, baja, suspensión o actividad en otra empresa requieren revisión. La pertenencia histórica permite reutilizar el registro; no prueba disponibilidad ni sustituye las confirmaciones de la reserva.

Las reservas respetan la pausa por atención humana de ambos participantes, incluso si el mensaje del personal está pendiente de procesar. Un eco verificado del propio bot no se considera toma humana. Las asignaciones operativas verificadas son Daniel Felipe (28) para neuropsicología, Diana Marcela (82) para sexología y Deicy (24) para certificados de apoyo emocional; Daniel y Diana no se asignan a otras terapias. Estas reglas no restringen su alquiler como profesionales. Cualquier cambio de tarifa, nombre de servicio o cantidad de sesiones desde la propuesta requiere una nueva propuesta. Un comando de Sandra no omite estas validaciones.

El aprendizaje guarda aclaraciones de Sandra con evento de origen y fecha. Antes de interpretar cada mensaje se buscan hasta 24 instrucciones activas: primero las relacionadas con el tema y después las recientes. La búsqueda considera todo el conocimiento activo, no solo las últimas doce entradas. No se guardan como reglas las respuestas inventadas del bot ni afirmaciones de clientes. Aprender una instrucción no implementa una función nueva ni prueba disponibilidad, pago o tarifa vigente. Si hay contradicción, se consulta la diferencia concreta.

La recepción está activada de forma persistente en PostgreSQL y el flujo n8n publicado recupera pendientes cada minuto en horario America/Bogota, sin una activación diaria. Las pausas expresas se conservan hasta que Sandra devuelve el chat al bot. La continuidad depende de los servidores, la sesión WhatsApp y el proveedor de IA. Una configuración activa no prueba recuperación ante todos los fallos de infraestructura.

Antes de saludar se verifica si el teléfono pertenece a un profesional de la empresa. Un estado NEW de la integración no demuestra que sea una persona nueva. Se consulta el historial disponible y se conserva el texto citado del mensaje entrante como contexto no confiable. Los certificados administrativos se distinguen del servicio de apoyo emocional. Las preguntas de seguimiento sin antecedente suficiente se consultan con Sandra; no reinician una venta. El historial anterior a la integración puede faltar: no afirmar lectura completa.

El saludo aprobado es: «Hola 😊 ¿Cómo estás? Soy Luisa Fernanda de *Psicólogos en Colombia*. Cuéntame, ¿en qué podemos ayudarte hoy?». Solo se usa al iniciar una conversación nueva. Un saludo simple sin historial, cita textual ni identidad profesional puede omitir la llamada al modelo, después de verificar contexto. Menos de tres segundos es un objetivo, todavía no una latencia de extremo a extremo garantizada.

Migración previa al despliegue: `docs/sql/2026-09-28-psychology-handover.sql`. Las continuaciones por inactividad tienen un evento único que referencia al original, sin reescribirlo. Se vuelve a comprobar la atención humana antes de enviar.

Axis ofrece «Conciliar pago / comprobante» desde la cita, con formulario de dinero recibido y soporte independiente. Al completar el valor, actualiza CONCILIADO y libro diario; abonos quedan pendientes. Los pagos de paquetes se registran una vez. Los pagos anteriores requieren revisión expresa, referencia y fecha real; consultar o subir un comprobante no fabrica ingresos. PDF/JPG/PNG/WEBP hasta 8 MB; los errores de carga ya no muestran éxito.

Las tareas diarias vuelven a comprobar elegibilidad cada día; no reiteran una invitación de la misma campaña. Antes de cada envío se consulta el contexto reciente, el número de citas realizadas y el último profesional registrado. Historial no disponible, audio histórico sin transcribir, rechazo, duda o conversación a cargo humano detienen esa invitación y se notifican a Sandra. Se mantiene el texto breve aprobado, sin incluir datos clínicos, precios históricos ni nombres de profesionales. Inmediatamente antes de enviar se vuelven a comprobar horario y autorización de contacto.

## Supervisión temporal

Automatización `supervisi-n-y-autonom-a-psic-logos`, cada 30 minutos en este chat. Debe revisar salud, mensajes nuevos y bloqueos, continuar correcciones y verificar despliegues. Guardar línea base; no repetir alertas ni tocar conversaciones tomadas por humanos. Mantener silencio si no cambió nada accionable. La ejecución necesita el equipo encendido y Codex disponible; el bot de servidor tiene infraestructura independiente.

No declarar el objetivo completo hasta verificar:

1. Consulta inicial desde número nuevo → información aprobada → datos confirmados → registro correcto y sin duplicados.
2. Preferencias → disponibilidad de agenda y confirmación profesional → confirmación paciente → cita real correcta, sin colisiones ni duplicados.
3. Pago o paquete correctamente asociado, sin duplicar ingresos, con soporte y comprobación independiente cuando se declare conciliación bancaria.
4. Alquiler, alternativas, cancelación/reprogramación y recuperación ante fallos funcionando según reglas autorizadas.
5. Órdenes de Sandra, reactivación y reportes con progreso y entrega verificados.
6. Validación real controlada de cada flujo, registro de fallos y límites. Las pruebas sintéticas no demuestran una cita ni un cobro real.

Al completar lo anterior, informar capacidades y excepciones humanas que se conservan y retirar solo la supervisión temporal; mantener bot y reportes diarios. No comprar créditos ni activar recarga automática sin autorización específica.
