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

Una respuesta humana pausa el chat. Las urgencias clínicas reciben acompañamiento inmediato y aviso a Sandra; nunca se trata la ausencia de una palabra clave como prueba de seguridad. Dudas operativas reales se consultan a la jefe y se conservan con fuente, no se sustituyen por supuestos del modelo.

Orden de Sandra en audio del28/09/2026: la atención entrante continúa24h; solo reactivación se limita08–19. La separación mínima entre envíos se controla en BD aun con trabajadores simultáneos, sin bloquear las respuestas normales. El ritmo no garantiza evitar restricciones de WhatsApp. El bloqueo de un envío incierto evita repetirlo.

Los registros antiguos con empresa nula requieren evidencia de actividad en empresa3 antes de reutilizarlos. No se migra masivamente su empresa ni se crea un duplicado al encontrarlos. Los alquileres consumidos por un profesional se distinguen de su trabajo atendiendo pacientes. Las compras recientes de paquetes y cargos de recepción excluyen inactividad aparente. Todo cambio se prueba antes de publicación; aplicar primero `docs/sql/2026-09-28-psychology-campaign-pacing.sql`.

Las propuestas y su confirmación final aplican la misma verificación de pertenencia para pacientes y profesionales históricos. Antes de guardar, se vuelve a comprobar el teléfono y la identidad única del paciente y del profesional; cambios de titular, duplicados, baja, suspensión o actividad en otra empresa requieren revisión. La pertenencia histórica permite reutilizar el registro; no prueba disponibilidad ni sustituye las confirmaciones de la reserva.

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
