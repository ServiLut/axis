# Reactivación preventiva de María Ángel

## Instrucción y alcance

La usuaria autorizó el 10/10/2026 contactar por WhatsApp a clientes de FUMIGACIÓN cuya última finalización comprobada o interacción real de agendamiento tenga de 60 a 90 días calendario de Colombia. La revisión de este chat quedó programada a las 08:00; el cierre diario con WhatsApp y Tenaxis a las 00:05. Estas revisiones requieren Codex, equipo y conexiones disponibles.

Antes de cada contacto se revisan Tenaxis y las dos líneas propias. Una fecha de creación, cotización, imagen de comprobante o estado sin intervalo real no demuestra que se prestó el servicio. El primer contrato de escritura de notas admite únicamente la última finalización real comprobada; los casos cuya única fuente sea una interacción de agendamiento conservan el pendiente de integración.

## Selección

1. Verificar empresa, cliente y teléfono único, con fuente nativa de WhatsApp.
2. Cruzar historia, última finalización e interacciones reales de agendamiento. La fuente más reciente determina la antigüedad de 60–90 días, inclusive.
3. Excluir agenda futura, negativa o no contacto en cualquiera de las líneas. Conservar toma humana, caso activo, visita/cotización pendiente, medios sin revisar o identidad contradictoria como revisión.
4. Exigir cobertura completa del cliente en Tenaxis y ambas líneas. La cobertura normalizada de teléfonos actuales no demuestra por sí sola identidad histórica, ausencia de cambios de teléfono o propiedad del número durante el servicio anterior.
5. Conservar línea original y un único ciclo por teléfono y fuente. La roja suspendida no se sustituye por la azul. No repetir intentos ACCEPTED, UNCERTAIN, entregados o leídos.

## Comunicación

Usar nombre sólo con fuente vinculada y fecha factual. El texto preparado dice: «Hola. Han pasado aproximadamente [2 o 3] meses desde tu último servicio registrado. Queremos ayudarte a mantener el control de plagas en tu espacio. ¿Te interesa coordinar un mantenimiento preventivo?»

Si sólo existe agendamiento, referir la consulta de agendamiento, sin afirmar prestación. No prometer protección total, duración residual universal, resultado, refuerzo gratuito, garantía o disponibilidad no consultada. El interés del cliente permite continuar el recorrido ordinario; no es una orden ni cita ya guardada.

## Entrega y nota

La salida pertenece al caso, teléfono, revisión y línea originales, con clave estable y texto/hash exactos. Antes de acreditar entrega se relee el MID nativo: propietario de la línea, destinatario único, salida propia, cuerpo exacto y acuse DELIVERY_ACK o READ. Se rechazan edición, eliminación, reenvío o acuses con identidad contradictoria. SERVER_ACK o ACCEPTED no prueban entrega.

El token de prueba nativa sólo admite la lectura de ese ciclo. No concede acceso administrativo, envíos, registros de servicios ni notas. La prueba reciente cruza nuevamente elegibilidad; no se acepta una afirmación de entrega suministrada por el solicitante.

Tenaxis obtiene la prueba directamente del runtime propio. El contrato de escritura sólo acepta `cycleKey`; nombre, teléfono, texto, estado y fechas vienen de las fuentes verificadas. Se revalida cliente, última finalización, antigüedad y agenda dentro de una transacción. La nota, recibo y auditoría son atómicos y se atribuyen a `maria.angel.bot`.

Texto exacto: **Mensaje de seguimiento 2-3 meses enviado**. Se deduplica por ciclo, cliente/finalización y MID/línea. Si el proveedor no aporta la hora real del acuse, ésta queda desconocida; se conserva la hora en que se comprobó el estado. No convertir la hora de envío en hora de entrega.

## Estado real al 10/10/2026

- Diario cifrado de futuras entradas y lecturas de supervisión instalados en ambos runtimes mediante `9978234ee308d77175b58a27c3d00d9252a51b19`; Dokploy DONE y API propia comprobados. No reconstruye entradas o eliminaciones anteriores ni garantiza que WhatsApp notifique todos los borrados.
- María conserva Luna propio, registro ordinario conectado y un recibo real BF23DF14. La línea azul está habilitada; la roja permanece suspendida por instrucción humana.
- Filtro preventivo, lectura cruzada de elegibilidad, staging cifrado, envío único y nota están implementados. Las fuentes internas se revalidan antes de cada acción; los cuerpos HTTP sólo admiten empresa, día y cursor o clave del ciclo. El recorrido está apagado por defecto; tener el adaptador instalado no prueba cobertura histórica completa. No hubo campaña, contactos ni notas reales nuevos en esta implementación.
- El acceso actual de registro no incluye historia general ni escritura de notas. Las concesiones adicionales son distintas, propias de FUMIGACIÓN, con vencimiento máximo del 07/11/2026; necesitan confirmación específica antes de crearlas en la consola.
- SQL de notas candidato, con respaldo/restauración e historia productiva como requisitos antes de aplicarlo. La tabla no se declara instalada por generar Prisma o desplegar código.
- La vista del perfil muestra únicamente notas propias de FUMIGACIÓN comprobadas. Un acceso o tabla faltante muestra historia no disponible; no equivale a cero notas.

## Cola y controles de ejecución

`/preventive-retention-prepare` crea únicamente registros `RETENTION_STAGED`, que no puede enviar el drenaje general. Conserva la revisión y caso anteriores del contacto. `/preventive-retention-dispatch` exige nuevamente datos actuales y propietario de línea, reserva un intento durable antes del proveedor y nunca reintenta resultados inciertos. `/preventive-retention-notes` revisa también entregas pendientes de días anteriores, sin reenviar esos mensajes, y sólo escribe tras comprobar el MID nativo y la elegibilidad vigente.

El token independiente de notas se limita al cuerpo `cycleKey`, mismo actor y vencimiento original; no puede reutilizar secretos administrativos, de ingreso, registro, lectura o prueba. La activación de envíos no se acepta desde un cuerpo de solicitud. Las concesiones, historia de ambas líneas, tabla productiva y prueba real permanecen como requisitos previos.

El ensayo PostgreSQL 16.15 en una base aislada aprobó 36 comprobaciones: aislamiento por empresa, claves únicas, nota/auditoría atómicas, concurrencia, reversión de fallo y respaldo/restauración. Usó únicamente datos sintéticos; no sustituye el respaldo y la inspección de migraciones de producción.

## Evidencia

Archivos privados en `.tmp/services-live-review-20261010/`; registros de autorización, configuración y fuentes conservados en sus ámbitos propios. No trasladar credenciales, clientes, precios ni actores a Servicio Técnico, Psicólogos o Abogados.
