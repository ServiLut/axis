# IA propia de María Ángel

## Alcance de esta preparación — 06/10/2026

La usuaria autorizó proceder con la conexión. Se implementó un adaptador exclusivo de FUMIGACION para OpenAI Responses. La cuenta, clave propia, modelo habilitado y límite de uso todavía requieren configuración: preparar o instalar este código no acredita una conexión real ni una conversación nueva atendida por IA.

Esta primera versión extrae únicamente fragmentos literales del mensaje actual para completar campos que faltan y selecciona entre redacciones equivalentes revisadas para algunas preguntas y cotizaciones. Conserva el siguiente paso decidido por las reglas del negocio. No permite generación libre de hechos ni equivale a una asesora entrenada para todos los casos.

Los precios se calculan con la tabla aprobada que ya usa María, incluido $99.000 COP por colchón dentro de su alcance. El modelo no cambia importes ni decide descuentos, horarios, técnicos, garantías, productos, reservas o pagos. Las respuestas frecuentes aprobadas mantienen su texto literal. Las preguntas operativas, destinatarios y chats humanos conservan su estado.

## Información enviada al modelo

Sólo el texto minimizado del turno actual, los campos permitidos del mismo caso, los campos ya preguntados y las alternativas de respuesta revisadas. Se omiten teléfonos, correos, direcciones precisas, enlaces y secretos reconocibles. No se envían el historial completo, mensajes del personal, conocimiento histórico sin aprobación, documentos ni información de otras empresas. Esta minimización no equivale a una garantía universal de anonimato.

El contexto disponible es parcial. Continúan pendientes respuestas frecuentes verificadas sobre preparación, productos, reingreso, garantías y excepciones, así como la conexión propia del programa. Una IA conectada no reemplaza esas fuentes ni confirma disponibilidad o guardados sin evidencia.

## Configuración exclusiva de mariangel-production

Configurar por un canal seguro las siguientes variables sólo en la aplicación `mariangel-production` de Dokploy. La clave debe corresponder a un acceso autorizado para FUMIGACION; no copiar credenciales de Psicólogos, Abogados, Miguel o del personal. No pegar claves en chats, archivos versionados o capturas.

| Variable | Contenido necesario |
| --- | --- |
| `BOT_AI_PROVIDER` | `openai` |
| `BOT_AI_SCOPE` | `FUMIGACION` |
| `BOT_OPENAI_API_KEY` | Clave privada propia de FUMIGACION |
| `BOT_AI_MODEL` | Identificador de un modelo habilitado en esa cuenta que admita Responses y JSON Schema |
| `BOT_AI_MONTHLY_CALL_LIMIT` | Entero acordado de 1 a 100.000; no hay límite autorizado por defecto |
| `BOT_AI_ENABLED_FROM` | Fecha ISO UTC del inicio nuevo; eventos anteriores no pasan al nuevo adaptador |
| `BOT_OPENAI_PROJECT_ID` | Opcional: proyecto propio de esa misma clave |

El tope local cuenta solicitudes antes de llamar al proveedor, también las fallidas. Usa meses UTC, máximo una solicitud de comprensión y otra de redacción por turno cuando aplica, y una comprobación técnica deduplicada por modelo/fecha de activación. El tope de llamadas no es un tope monetario: el costo depende del modelo y los tokens. El presupuesto de la cuenta debe definirse con su titular. No se crean cuentas, claves, compras ni cobros automáticos desde este conector.

Si falta configuración, el adaptador permanece inactivo. Si el proveedor falla, rechaza la estructura o se alcanza el límite, continúa la respuesta aprobada que permiten las reglas actuales, con auditoría. No se reintentan automáticamente resultados de IA inciertos o fallidos ni entregas inciertas de WhatsApp.

## Verificación posterior

1. Confirmar despliegue propio y `/status`: `conversationalAi.configured` acredita configuración, no conexión.
2. Consultar `/ai-health` mediante autenticación administrativa propia. Usa una solicitud técnica aislada sin cliente, mensajes ni escrituras de negocio, consume el límite y guarda la fecha comprobada. Una repetición de la misma configuración devuelve esa fecha histórica sin otra llamada; no es una revisión continua del proveedor.
3. Revisar un siguiente turno legítimo nuevo y su entrega nativa. Comprobar conservación de hechos/precio, pregunta pertinente, toma humana y autoría. No fabricar mensajes ni reproducir casos históricos.

La salida de IA no autoriza envío: después de esperar al modelo se verifican atención nativa, intervención del personal, revisión del chat, fuente vigente del precio y texto aprobado. La primera cita, pago o servicio real siguen requiriendo su propio guardado y evidencia.

## Referencia técnica

Se usa `text.format` con JSON Schema estricto de [Structured Outputs de OpenAI](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses). Cada solicitud lleva `store:false`, siguiendo [Conversation state](https://developers.openai.com/api/docs/guides/conversation-state); esto no se presenta como eliminación automática de todos los registros del proveedor ni como retención cero.

Las pruebas del repositorio usan un proveedor simulado aislado: no consumen crédito ni acreditan entrenamiento, conexión real, envío a clientes o autonomía integral.
