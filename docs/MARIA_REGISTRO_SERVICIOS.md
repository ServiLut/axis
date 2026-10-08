# Registro propio de servicios nuevos de María — 08/10/2026

La usuaria autorizó recibir, cotizar y guardar servicios nuevos a nombre de María en FUMIGACION. El código preparado permite registrar una solicitud ordinaria aceptada, con nombre y dirección literales, precio aprobado, confirmación de un resumen entregado y recibo persistido de Tenaxis. El servicio queda NUEVO, pendiente de programación. Horario, técnico, ejecución, pagos y garantías requieren sus fuentes y controles propios.

## Configuración y alcance

La integración permanece cerrada sin identidad y token propios. Tenant `9ffea9df-1e06-4590-acec-0e5cde715ba9`, empresa `35a19d89-15d1-4c32-8353-3471b6d9f0ff`, nombre FUMIGACION, usuario técnico `maria.angel.bot`. Su usuario no tiene acceso interactivo. La credencial específica admite solamente registro ordinario propio y lecturas de estado, recibo y elegibilidad del seguimiento. No usar credenciales del personal o de otras empresas.

El backend candidato de Tenaxis ofrece POST `/integrations/maria-service-registration`, `/status`, `/receipt` y `/customer-status`. Valida alcance del actor, corte, expiración, precio de la tabla aprobada, identidad del cliente, duplicados, contrato y orden pendientes. Usa transacción serializable, bloqueo del cliente y una clave durable por caso y aceptación; crea cliente/dirección sólo si proceden, orden, recibo y auditoría juntos. Los escritores humanos no participan necesariamente en el bloqueo asesor; no se garantiza ausencia universal de carreras.

POST `/program-setup` del runtime propio, autenticado con su token administrativo existente, acepta únicamente `enabled`, `url`, `token`, `actorId`, `startsAt` y `expiresAt`. Comprueba `/status` antes de guardar la configuración cifrada. Los estados públicos no exponen el token. La configuración de entorno equivalente usa `BOT_MARIA_PROGRAM_ENABLED`, `BOT_MARIA_PROGRAM_URL`, `BOT_MARIA_PROGRAM_TOKEN`, `BOT_MARIA_PROGRAM_ACTOR_ID`, `BOT_MARIA_PROGRAM_STARTS_AT_UTC` y `BOT_MARIA_PROGRAM_EXPIRES_AT_UTC`.

## Guardado y confirmación

Sólo una cotización propia de la tabla directa vigente, entregada y aceptada dentro de 24 horas, habilita la recepción de datos. Las cuatro cotizaciones nativas excepcionales conservan su alcance y no habilitan esta escritura. La tabla mantiene $99.000 por colchón y sus demás condiciones verificadas.

María pide los datos faltantes, muestra el resumen y espera una confirmación inequívoca posterior a su entrega. Una corrección exige un nuevo resumen; un rechazo no crea un servicio. Cambios explícitos de municipio, varias propiedades o alcance especial conservan revisión. Los datos de registro no se envían al modelo.

Antes del POST se comprueban propietario, atención humana, fuente y cuerpo nativos, precio, resumen, aceptación y actividad entrante de ambas líneas. Se reserva el intento cifrado antes de escribir. Sólo un recibo propio con hash, orden y creador concordantes permite anunciar el guardado y atribuirlo a María. Una respuesta incierta no produce otro POST: se consulta el mismo recibo. Las lecturas fallidas se espacian; después de tres requieren revisión. Si el personal toma el chat, se conserva el recibo y se suprime la confirmación externa.

## Rapidez y seguimiento

María despierta su worker tras guardar una entrada verificada, procesa una entrada por ciclo y envía READY antes de otra comprensión. El temporizador de respaldo de María es de un segundo; el de Miguel conserva diez segundos. Se omite una segunda llamada de estilo en el turno ordinario de María. Se registran recepción HTTP, preparación, ACCEPTED y acuses observados por separado. Tres segundos es un objetivo pendiente de medición con conversaciones legítimas, no una garantía de entrega.

`BOT_CUSTOMER_INACTIVITY_FOLLOWUP=true` prepara un seguimiento único por caso después de 20 minutos y hasta 24 horas. Exige autoría propia comprobada, salida entregada, contexto nativo y consulta nueva del programa antes de encolar y enviar. Sin programa propio conectado no envía. Atención humana, rechazo, posservicio, documentos, pagos, medios no revisados, preguntas pendientes o servicio guardado impiden el seguimiento. No crea otro job, no reproduce históricos y no permite campañas.

## Verificación y pendientes

Las pruebas aisladas cubren resumen y entrega, correcciones, rechazo, alcance distinto, intervención humana, otra línea, vencimiento, recuperación de recibo y autoría. No crean servicios reales ni demuestran la primera escritura legítima. Publicación, migración, configuración privada y primer servicio real deben registrarse por separado en el checkpoint. Una instalación cerrada no acredita conexión del programa.
