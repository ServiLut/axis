// Generado por work/maria-agente/construir-integracion.mjs desde src/agente.mjs. No editar aquí.
import { DEFINICIONES, DEFINICION_INSTRUCCION, crearEjecutor } from './maria-agente-herramientas.mjs';
import { revisarRespuesta } from './maria-agente-control.mjs';
import { transcribirAudio, contenidoCliente } from './maria-agente-medios.mjs';
import { leerConocimiento } from './maria-agente-conocimiento.mjs';

// Clara y honesta: dice qué pasa y quién responde, sin narrar procesos internos.
const RESPUESTA_SEGURA = 'Una asesora te responderá lo antes posible con la información exacta.';

const opcional = (nombre) => { const t = leerConocimiento(nombre); return t ? '\n\n' + t : ''; };

export function instrucciones({ esJefa = false, ahora = new Date() } = {}) {
  let conocimiento = leerConocimiento('negocio');
  // Órdenes permanentes de la jefa: tienen prioridad sobre el resto del conocimiento.
  const ordenes = opcional('instrucciones-jefa');
  if (ordenes) conocimiento += '\n\n## Instrucciones de la jefa (prioridad máxima)' + ordenes;
  // Plantillas de la empresa y ejemplos reales de los mejores asesores. Es como María "aprende" su estilo.
  conocimiento += opcional('respuestas-rapidas');
  conocimiento += opcional('ejemplos-asesores');
  const fecha = ahora.toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'full', timeStyle: 'short' });
  let texto = leerConocimiento('prompt-sistema').replace('{{CONOCIMIENTO}}', conocimiento) + `\n\nFecha y hora actual en Bogotá: ${fecha}.`;
  if (esJefa) texto += '\n\n' + leerConocimiento('modo-jefa');
  return texto;
}

// Algunos modelos no aceptan el contenido de razonamiento cifrado; se recuerda por modelo para no reintentar cada vez.
const sinRazonamiento = new Set();

async function llamarModelo({ clave, modelo, instrucciones, entrada, herramientas, fetcher }) {
  const pedir = (conRazonamiento) => fetcher('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + clave, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(90000),
    body: JSON.stringify({
      model: modelo,
      instructions: instrucciones,
      input: entrada,
      tools: herramientas,
      store: false,
      // Mensajes de WhatsApp: cortos. Pone techo al costo de cada llamada.
      max_output_tokens: 900,
      ...(conRazonamiento ? { include: ['reasoning.encrypted_content'] } : {}),
    }),
  });
  let respuesta = await pedir(!sinRazonamiento.has(modelo));
  let datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok && !sinRazonamiento.has(modelo) && /include|reasoning|encrypted/i.test(JSON.stringify(datos.error ?? ''))) {
    sinRazonamiento.add(modelo);
    respuesta = await pedir(false);
    datos = await respuesta.json().catch(() => ({}));
  }
  if (!respuesta.ok || datos.error) {
    const e = datos.error ?? {};
    throw Error(`Error del modelo (HTTP ${respuesta.status}): ${e.message ?? JSON.stringify(e)}${e.param ? ` [campo: ${e.param}]` : ''}`);
  }
  // Los elementos de razonamiento sin contenido cifrado no se pueden reenviar con store:false.
  return (datos.output ?? []).filter((x) => x.type !== 'reasoning' || x.encrypted_content);
}

// WhatsApp no usa Markdown: **negrita** se ve con asteriscos de más. Se adapta antes de enviar.
export const formatoWhatsApp = (texto) => texto
  .replace(/\*\*(.+?)\*\*/g, '*$1*')
  .replace(/__(.+?)__/g, '_$1_')
  .replace(/^#{1,6}\s+/gm, '')
  .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1: $2')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const textoDe = (salida) =>
  salida.filter((x) => x.type === 'message').flatMap((x) => x.content ?? []).filter((c) => c.type === 'output_text').map((c) => c.text).join('\n').trim();

// Una conversación con un cliente. responder() recibe su mensaje y devuelve lo que María enviaría.
// esJefa debe venir del número verificado por el transporte de WhatsApp, nunca del texto del mensaje.
// historialPrevio: turnos ya ocurridos en WhatsApp [{ rol: 'cliente' | 'maria' | 'asesora', texto }], para continuar
// una conversación real. efectos: dónde quedan registrar/pasar a humano (el servidor o el modo sombra los inyectan).
export function crearConversacion({ clave = process.env.OPENAI_API_KEY, modelo = process.env.MARIA_MODELO, modeloAudio = process.env.MARIA_MODELO_AUDIO, sesion = 'simulador', esJefa = false, fetcher = fetch, historialPrevio = [], efectos = null, maxLlamadas = 16 } = {}) {
  let llamadas = 0;
  const fetcherConLimite = (...a) => { if (++llamadas > maxLlamadas) throw Error('LIMITE_LLAMADAS'); return fetcher(...a); };
  if (!clave) throw Error('Falta OPENAI_API_KEY');
  if (!modelo) throw Error('Falta MARIA_MODELO (por ejemplo, el modelo que ya usa la cuenta de FUMIGACION)');
  const historial = [];
  const preciosCotizados = [];
  const acciones = [];
  const mensajesCliente = [];
  const enviados = [];
  for (const { rol, texto } of historialPrevio) {
    if (!texto) continue;
    if (rol === 'cliente') { historial.push({ role: 'user', content: texto }); mensajesCliente.push(texto); }
    else {
      // Las asesoras escriben desde el mismo número; María debe saber qué dijeron para no repetir ni contradecir.
      historial.push({ role: 'assistant', content: rol === 'asesora' ? `[Escrito por una asesora]: ${texto}` : texto });
      enviados.push(texto);
      for (const m of texto.matchAll(/\$\s?(\d{1,3}(?:[.,]\d{3})+)/g)) preciosCotizados.push(Number(m[1].replace(/[.,]/g, '')));
    }
  }
  const ejecutor = crearEjecutor({ sesion, preciosCotizados, esJefa, efectos, ultimoMensaje: () => mensajesCliente.at(-1) ?? '', mensajesCliente: () => mensajesCliente });
  const sistema = instrucciones({ esJefa });
  const herramientas = esJefa ? [...DEFINICIONES, DEFINICION_INSTRUCCION] : DEFINICIONES;

  async function turno() {
    for (let paso = 0; paso < 8; paso++) {
      const salida = await llamarModelo({ clave, modelo, instrucciones: sistema, entrada: historial, herramientas, fetcher: fetcherConLimite });
      historial.push(...salida);
      const llamadas = salida.filter((x) => x.type === 'function_call');
      if (!llamadas.length) return textoDe(salida);
      for (const llamada of llamadas) {
        const args = JSON.parse(llamada.arguments || '{}');
        const resultado = ejecutor[llamada.name] ? ejecutor[llamada.name](args) : { error: 'Herramienta desconocida' };
        acciones.push({ herramienta: llamada.name, args, resultado });
        historial.push({ type: 'function_call_output', call_id: llamada.call_id, output: JSON.stringify(resultado) });
      }
    }
    return '';
  }

  return {
    acciones,
    // audio: { datos, tipo } de una nota de voz; imagenes: fotos ya convertidas con imagenParaModelo().
    async responder(mensajeCliente = '', { audio = null, imagenes = [] } = {}) {
      let transcripcion = null;
      if (audio) {
        try {
          transcripcion = await transcribirAudio({ ...audio, clave, modelo: modeloAudio, fetcher });
        } catch {
          transcripcion = '(no se pudo escuchar la nota de voz)';
        }
      }
      mensajesCliente.push([mensajeCliente, transcripcion].filter(Boolean).join('\n'));
      historial.push({ role: 'user', content: contenidoCliente({ texto: mensajeCliente, transcripcion, imagenes }) });
      let texto = formatoWhatsApp(await turno());
      // Con la jefa se habla de procesos internos y precios especiales; el control aplica a clientes.
      if (esJefa) return texto;
      let control = revisarRespuesta(texto, preciosCotizados, enviados);
      if (!control.ok) {
        // Un intento de corrección; si vuelve a fallar se envía una respuesta segura y se avisa al equipo.
        historial.push({ role: 'developer', content: 'Tu último mensaje no se envió al cliente por: ' + control.problemas.join('; ') + '. Escríbelo de nuevo corrigiendo eso. Si repetías, responde lo nuevo que dijo el cliente o avanza al siguiente paso.' });
        texto = formatoWhatsApp(await turno());
        control = revisarRespuesta(texto, preciosCotizados, enviados);
      }
      if (!control.ok || !texto) {
        ejecutor.pasar_a_humano({ motivo: 'otro', urgente: false, resumen: 'Respuesta bloqueada por control: ' + control.problemas.join('; ') });
        acciones.push({ herramienta: 'control', resultado: control });
        // La respuesta segura tampoco se repite: si ya se usó, María espera al equipo en silencio.
        texto = enviados.includes(RESPUESTA_SEGURA) ? '' : RESPUESTA_SEGURA;
      }
      if (texto) enviados.push(texto);
      return texto;
    },
  };
}
