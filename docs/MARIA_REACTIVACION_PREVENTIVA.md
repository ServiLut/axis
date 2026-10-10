# Reactivación preventiva de María Ángel

## Instrucción y alcance

La usuaria autorizó el 10/10/2026 contactar por WhatsApp a clientes de FUMIGACIÓN cuya última finalización comprobada o interacción real de agendamiento tenga de 60 a 90 días calendario de Colombia. La revisión de este chat quedó programada a las 08:00; el cierre diario con WhatsApp y Tenaxis a las 00:05. Estas revisiones requieren Codex, equipo y conexiones disponibles. Las dos automatizaciones existentes se actualizaron a las 17:50:25Z con accesos y tabla instalados, manteniendo horarios, estado ACTIVE y controles; no se creó otro job ni se habilitó el envío preventivo.

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
- La usuaria confirmó expresamente los tres accesos exclusivos: lectura general de Tenaxis, escritura de la nota exacta y prueba nativa de entrega. Se generaron separados a las 16:55Z y se instalaron en María a las 17:12:00Z. La lectura propia se comprobó a las 17:12:09Z y de nuevo a las 17:48:03Z tras el Reload; ocho comprobaciones de separación de roles pasaron a las 17:23:29Z. Conservan el actor `maria.angel.bot` y vencen el **07/11/2026 a las 16:56:52.680Z**, sin renovación automática. Crear e instalar el acceso de notas no activa su ejecución.
- La lectura general del programa está habilitada; envío y notas preventivas del runtime permanecen **OFF**. El ensayo con la estructura actual de PostgreSQL 18.6 aprobó a las 17:44:40Z la restauración del esquema, 13 comprobaciones sintéticas y rollback, preservando el índice previo. El respaldo contiene sólo estructura: no se exportaron filas de negocio ni se acreditó recuperación de datos. La tabla de notas productiva quedó **CREATED** a las 17:46:20Z, con recibo y hashes concordantes; no cambió filas de negocio ni historia de Prisma. Se conservó la configuración completa de 47 campos y sólo se activó `MARIA_RETENTION_NOTE_ENABLED` en el backend. Reload, estado verde y lectura del registro original fueron comprobados. Tres gates finales pasaron a las 17:53:53Z: el acceso de notas llegó al rechazo del cuerpo vacío (400), y lectura/registro fueron rechazados (401); no se envió una clave de ciclo válida ni se intentó verificar una entrega o escribir una nota. La tabla se acredita por su recibo DDL separado, no por esos rechazos. El acceso general sigue siendo sólo lectura: su indicador de escritura false no contradice el módulo separado de notas habilitado. No se enviaron campañas ni se escribieron notas de clientes; falta una continuidad legítima de entrega/nota.
- La vista del perfil muestra únicamente notas propias de FUMIGACIÓN comprobadas. Un acceso o tabla faltante muestra historia no disponible; no equivale a cero notas.

El cruce de sólo lectura terminó a las 17:29:52Z: 247 páginas secuenciales, 17.132 filas de clientes observadas y 15.626 comprobaciones de teléfonos canónicos vinculados al programa. La paginación y los lotes terminaron, pero no forman una fotografía única de toda la población; 1.386 filas conservaron teléfono ambiguo o faltante. Sin historia nativa sincronizada/revisada de ambas líneas, el estado sigue `BLOCKED_NATIVE_COVERAGE` y la elegibilidad global es desconocida. Los cero candidatos reportados no significan cero clientes elegibles. El cruce conservó el alcance diario anterior de 44 registros de órdenes y una eliminación lógica observada, sólo metadatos; no prueba fraude, autoría de borrados ni servicios omitidos. La lectura posterior de las 17:48:03Z observó 46 registros de órdenes del día y 28 técnicos en el catálogo actual; no demuestra asistencia, ejecución ni cobertura universal o histórica de técnicos.

## Cola y controles de ejecución

`/preventive-retention-prepare` crea únicamente registros `RETENTION_STAGED`, que no puede enviar el drenaje general. Conserva la revisión y caso anteriores del contacto. `/preventive-retention-dispatch` exige nuevamente datos actuales y propietario de línea, reserva un intento durable antes del proveedor y nunca reintenta resultados inciertos. `/preventive-retention-notes` revisa también entregas pendientes de días anteriores, sin reenviar esos mensajes, y sólo escribe tras comprobar el MID nativo y la elegibilidad vigente.

El token independiente de notas se limita al cuerpo `cycleKey`, mismo actor y vencimiento original; no puede reutilizar secretos administrativos, de ingreso, registro, lectura o prueba. La activación de envíos no se acepta desde un cuerpo de solicitud. Los tres accesos, tabla productiva, Reload y gates de autorización/DTO están verificados. El módulo separado de notas está habilitado; el runtime de contactos/notas permanece OFF. La historia de ambas líneas y el recorrido legítimo de entrega/nota permanecen pendientes.

El ensayo PostgreSQL 16.15 en una base aislada aprobó 36 comprobaciones: aislamiento por empresa, claves únicas, nota/auditoría atómicas, concurrencia, reversión de fallo y respaldo/restauración. Usó únicamente datos sintéticos; no sustituye el respaldo y la inspección de migraciones de producción.

## Evidencia

Archivos privados en `.tmp/services-live-review-20261010/`; registros de autorización, configuración y fuentes conservados en sus ámbitos propios. No trasladar credenciales, clientes, precios ni actores a Servicio Técnico, Psicólogos o Abogados.
