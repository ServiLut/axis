// Generado por work/maria-agente/construir-integracion.mjs desde src/control.mjs. No editar aquí.
// Control posterior a la redacción: el modelo escribe libre, pero antes de enviar
// se verifica que no filtre procesos internos, no diga precios no cotizados,
// no deje plantillas a medio llenar y no repita lo que ya dijo.
const INTERNOS = [
  /\btenaxis\b/i, /\bherramienta/i, /\bsistema\b/i, /\bprograma\b/i, /\bbackend\b/i, /\bregistro interno/i,
  /\bt[eé]cnico sin asignar/i, /\bequipo interno/i, /\bpendiente (?:por|de) confirmar/i, /\bfallo\b/i, /\berror\b/i,
  /\bcotizar\(|registrar_servicio|pasar_a_humano/i, /\basesora humana\b/i, /\brevisi[oó]n (?:interna|del equipo)/i,
  // Frases reales de la María anterior que dejaban al cliente sin respuesta.
  /\bnecesita confirmaci[oó]n/i, /\brevisaremos tu solicitud/i, /no tengo una respuesta confirmada/i, /pendiente de revisi[oó]n/i,
  /consultando el valor/i, /verificar el antecedente/i, /ya conserv[eé]/i,
  // Narrar lo que hace por dentro en vez de responder (queja de la dueña, 24/10).
  /\bestoy (?:consultando|revisando|verificando|analizando|procesando|escuchando)\b/i,
  /\bvoy a (?:revisar|verificar|consultar|analizar|procesar)\b/i,
  /\brecib[ií] tu (?:audio|nota de voz|mensaje|pregunta|foto|imagen)\b/i,
  /\b(?:un momento|dame un momento) mientras\b/i, /\bd[eé]jame (?:revisar|verificar|consultar|confirmarlo)\b/i,
];

// Plantillas enviadas con el espacio del precio o de un dato vacío.
const PLANTILLA_VACIA = [
  /TAN SOLO!?\s*\$?\s*(?:💥|$|\n)/i, /valor de\s*\$?\s*(?:💥|$|\n|\.)/i, /<[^>]{2,40}>/, /\[(?:nombre|valor|precio|plaga|fecha|hora)\]/i, /\$(?!\s*\d)/,
];

const montos = (texto) =>
  [...texto.matchAll(/\$\s?(\d{1,3}(?:[.,]\d{3})+|\d{4,})/g)].map((m) => Number(m[1].replace(/[.,]/g, '')));

const palabras = (texto) =>
  new Set(texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9ñ]{3,}/g) ?? []);

// Parecido entre dos mensajes (0 a 1) por palabras compartidas.
export function parecido(a, b) {
  const x = palabras(a), y = palabras(b);
  if (!x.size || !y.size) return 0;
  let comunes = 0;
  for (const p of x) if (y.has(p)) comunes++;
  return comunes / Math.min(x.size, y.size);
}

// preciosCotizados: valores devueltos por cotizar() (se admiten también sus mitades, para el refuerzo).
// anteriores: mensajes que María ya envió en esta conversación.
export function revisarRespuesta(texto, preciosCotizados = [], anteriores = []) {
  const problemas = [];
  for (const patron of INTERNOS) if (patron.test(texto)) problemas.push(`Menciona algo interno: ${patron}`);
  for (const patron of PLANTILLA_VACIA) if (patron.test(texto)) { problemas.push('Plantilla con un dato o precio sin llenar'); break; }
  const permitidos = new Set(preciosCotizados.flatMap((v) => [v, v / 2]));
  for (const monto of montos(texto)) {
    if (!permitidos.has(monto)) problemas.push(`Precio no cotizado: ${monto}`);
  }
  if (texto.length > 1600) problemas.push('Mensaje demasiado largo para WhatsApp');
  const repetido = anteriores.slice(-4).find((previo) => texto.length > 30 && parecido(texto, previo) >= 0.8);
  if (repetido) problemas.push(`Repite casi igual un mensaje que ya envió: «${repetido.slice(0, 80)}»`);
  return { ok: problemas.length === 0, problemas };
}
