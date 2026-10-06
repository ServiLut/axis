# IA propia de María Ángel

## Alcance de esta preparación — 06/10/2026

La usuaria autorizó proceder con la conexión. Se implementó un adaptador exclusivo de FUMIGACION para OpenAI Responses. La cuenta, clave propia, modelo habilitado y límite de uso todavía requieren configuración: preparar o instalar este código no acredita una conexión real ni una conversación nueva atendida por IA.

Esta primera versión extrae únicamente fragmentos literales del mensaje actual para completar campos que faltan y selecciona entre redacciones equivalentes revisadas para algunas preguntas y cotizaciones. Conserva el siguiente paso decidido por las reglas del negocio. No permite generación libre de hechos ni equivale a una asesora entrenada para todos los casos.

## Conocimiento aprobado y calibración — 06/10/2026

La base propia reúne nueve reglas vigentes con su fuente: contexto del mismo caso, prioridad del personal, precio aprobado, cotización previa, agenda, respuestas frecuentes y seguridad, solicitudes posteriores a un servicio, pagos y tono/privacidad. La tabla conserva seis filas para cucarachas y roedores, el adicional autorizado de comején y $99.000 por colchón dentro de su alcance. Los mínimos internos y propuestas históricas no se entregan al modelo.

La versión de esta base se guarda cifrada una sola vez por hash en el volumen propio y queda auditada. `/ai-knowledge` permite revisar su contenido mediante autenticación administrativa propia; no crea una vía general de escritura. La comprensión recibe sólo reglas de contexto/identidad/privacidad. La redacción recibe reglas aprobadas y, cuando existe una referencia válida, el importe exacto de la cotización vigente. No se incorporan textos del personal, historial de clientes ni observaciones sin aprobación.

Guardia: `own-approved-rule-sources-and-current-quotation-v1`. La cobertura de respuestas frecuentes, productos, seguridad original y programa sigue parcial. La preparación y evaluación de esta base no son un entrenamiento de los pesos del modelo ni acreditan conexión del proveedor. Las pruebas de calibración incluyen 22 ejemplos de importes y alcances, en un entorno aislado sin mensajes a clientes.

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

## Activación propia autorizada — 06/10/2026

La usuaria autorizó una clave exclusiva de OpenAI, guardada en el archivo privado local de Fumigación, y GPT-6 Luna con un límite de 10.000 llamadas por mes UTC usando el saldo existente. Esto no es un tope monetario ni autoriza recargas o compras.

Además de las variables propias de la aplicación, la configuración inicial puede ingresarse mediante POST /ai-setup con la autenticación administrativa ya existente de María. La ruta acepta exclusivamente los siete campos de IA documentados, scope FUMIGACION, una clave y proyecto propios y un corte nuevo. Primero ejecuta una única comprobación técnica de Responses sin datos de clientes. Sólo después de comprobar el resultado guarda la configuración cifrada con AES-256-GCM en el volumen propio y la activa. Una repetición idéntica no vuelve a llamar al proveedor; una configuración distinta se rechaza. La clave nunca se devuelve ni se escribe en auditoría. Los reinicios recuperan esta configuración; una configuración de entorno activa que entre en conflicto impide el inicio.

Esta ruta no es una vía general de escritura ni cambia acceso, toma humana, mensajes históricos, precios, preguntas o registros de servicios. Sólo existe para la instalación inicial propia; exige el token administrativo y no acepta el token del webhook. GPT-6 Luna usa reasoning.effort=none para este trabajo estructurado breve y los límites de salida existentes. Configuración, prueba técnica y la siguiente conversación real se verifican por separado.

## Comprensión del tipo de solicitud y evaluación propia — 06/10/2026

La usuaria autorizó comenzar con Luna y comparar Sol si las pruebas revelan que no alcanza el nivel necesario. La comprensión ahora devuelve una intención acotada junto con evidencia literal del turno actual: servicio nuevo, refuerzo, verificación, reclamación de garantía, problema posterior, pregunta general, solicitud ambigua u otro mensaje. Recibe ejemplos revisados y contexto mínimo del mismo caso, incluido el mensaje anterior minimizado; una etiqueta de IA nunca acredita ejecución, garantía, gratuidad, precio, agenda o pago. La intención únicamente puede conservar una revisión apropiada; no reemplaza controles nativos ni permite escrituras generales. El primer antecedente y los destinatarios previos se conservan. Una revisión pendiente evita llamadas y acuses innecesarios.

Guardia: own-current-source-intent-and-reviewed-examples-v1. POST /ai-evaluate requiere la autenticación administrativa existente, empresa FUMIGACION y únicamente caseIds del catálogo fijo de doce escenarios sintéticos aislados. No acepta historias de clientes, textos arbitrarios o modelos alternativos. Consume y registra el mismo límite mensual de la instancia, deduplica por versión y escenario, guarda resultados cifrados y no crea eventos, chats, consultas o salidas de WhatsApp. /status muestra uso reservado y evaluación actual; pruebas sintéticas no acreditan calidad integral ni un siguiente recorrido legítimo.

La comprensión recibe hasta tres aclaraciones guardadas, vigentes y con fuente verificada del mismo caso, minimizadas. Se excluyen respuestas vencidas, sin fuente o del caso anterior cuando se inicia una solicitud nueva. Una aclaración de caso no se convierte en política general ni autoriza acciones o garantías. Esta conexión del contexto se comprueba con una prueba aislada; la siguiente aplicación legítima de una explicación permanece pendiente.
