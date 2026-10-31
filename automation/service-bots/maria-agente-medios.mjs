// Generado por work/maria-agente/construir-integracion.mjs desde src/medios.mjs. No editar aquí.
// Notas de voz y fotos del cliente. María nunca responde "recibí tu audio": primero se transcribe y ella
// contesta lo que el cliente dijo, como si lo hubiera escrito.
const TRANSCRIPCION = 'https://api.openai.com/v1/audio/transcriptions';

export async function transcribirAudio({ datos, tipo = 'audio/ogg', clave = process.env.OPENAI_API_KEY,
  modelo = process.env.MARIA_MODELO_AUDIO, fetcher = fetch }) {
  if (!modelo) throw Error('Falta MARIA_MODELO_AUDIO (modelo de transcripción de la cuenta)');
  const formulario = new FormData();
  formulario.append('model', modelo);
  formulario.append('language', 'es');
  formulario.append('file', new Blob([datos], { type: tipo }), 'nota-de-voz.' + (tipo.split('/')[1] || 'ogg').split(';')[0]);
  const respuesta = await fetcher(TRANSCRIPCION, {
    method: 'POST', headers: { Authorization: 'Bearer ' + clave }, body: formulario, signal: AbortSignal.timeout(30000),
  });
  const cuerpo = await respuesta.json();
  if (!respuesta.ok || typeof cuerpo.text !== 'string') throw Error('Transcripción fallida: ' + (respuesta.status ?? ''));
  return cuerpo.text.trim();
}

// Foto en formato que acepta el modelo (Responses API, input_image).
export const imagenParaModelo = (datos, tipo = 'image/jpeg') =>
  ({ type: 'input_image', image_url: `data:${tipo};base64,${Buffer.from(datos).toString('base64')}` });

// Contenido del turno del cliente: texto, transcripción de su nota de voz y fotos.
export function contenidoCliente({ texto = '', transcripcion = null, imagenes = [] }) {
  const partes = [];
  if (texto) partes.push(texto);
  if (transcripcion) partes.push(`[Nota de voz del cliente, transcrita]: ${transcripcion}`);
  if (imagenes.length) partes.push(`[El cliente envió ${imagenes.length} foto(s); míralas antes de responder]`);
  const textoFinal = partes.join('\n') || '[Mensaje sin texto]';
  return imagenes.length ? [{ type: 'input_text', text: textoFinal }, ...imagenes] : textoFinal;
}
