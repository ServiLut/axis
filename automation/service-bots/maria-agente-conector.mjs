// Generado por work/maria-agente/construir-integracion.mjs desde src/conector-tenaxis.mjs. No editar aquí.
// Arma el cuerpo para el registro de servicios de María en Tenaxis (CreateMariaRegistrationDto).
// Lo usa el conector real: recibe lo que registró María y los mensajes nativos de WhatsApp con su id y fecha.
// No hace llamadas: devuelve { ok, cuerpo } o { ok:false, errores } aplicando las reglas del DTO y del
// servicio que se conocen (revisión de Codex del 23/10/2026). Tenaxis sigue siendo quien decide.
import { normalizar } from './maria-agente-precios.mjs';
import { confirmaResumen } from './maria-agente-herramientas.mjs';

export const LINEAS_MARIA = ['573126944997', '573126938721']; // azul 4997, roja 8721
export const GUARDIA_ACCESO = 'own-native-neighborhood-and-residential-access-before-new-registration-v1';
const ID = /^[A-Za-z0-9_:.-]{1,160}$/;
const TELEFONO = /^57[0-9]{10}$/;
const MAX_PRECIO = 10_000_000;
const MAX_CUERPO = 40_000;
const VENTANA_COTIZACION_MS = 24 * 60 * 60 * 1000;

const instante = (iso) => (typeof iso === 'string' && /Z$/.test(iso) && Number.isFinite(Date.parse(iso)) ? Date.parse(iso) : null);
const plano = (t) => normalizar(t).replace(/\s+/g, ' ');

// Busca el mensaje del cliente que contiene el valor literal (nombre, dirección…), el más reciente primero.
export function buscarFuente(valor, mensajes) {
  if (typeof valor !== 'string' || plano(valor).length < 2) return null;
  const v = plano(valor);
  return [...mensajes].reverse().find((m) => plano(m.texto).includes(v)) ?? null;
}

/**
 * @param registro   argumentos de registrar_servicio (nombre, direccion, municipio, barrio, casaOUnidad, mascotas, preferenciaLiteral)
 * @param cotizacion { entryId, valor, args } de cotizar(), más { mensajeId, entregadaEn } del mensaje propio entregado con el precio
 * @param mensajes   mensajes nativos del caso: [{ id, texto, at (ISO Z), deMi, reenviado }]
 */
export function construirRegistro({ caseId, telefono, linea, registro = {}, cotizacion = {}, scheduleHash, mensajes = [] }) {
  const errores = [];
  const exigir = (condicion, texto) => { if (!condicion) errores.push(texto); };
  exigir(ID.test(caseId ?? ''), 'caseId inválido');
  exigir(TELEFONO.test(telefono ?? ''), 'teléfono debe ser 57 + 10 dígitos');
  exigir(LINEAS_MARIA.includes(linea), 'línea no es de María');
  for (const campo of ['nombre', 'direccion', 'municipio']) exigir(typeof registro[campo] === 'string', `falta ${campo}`);
  exigir(cotizacion.args && typeof cotizacion.args === 'object', 'cotización sin alcance');
  if (errores.length) return { ok: false, errores };

  const validos = mensajes
    .filter((m) => m && ID.test(m.id ?? '') && instante(m.at) !== null && typeof m.texto === 'string' && m.texto.length >= 1 && m.texto.length <= 8000)
    .sort((a, b) => instante(a.at) - instante(b.at));
  const delCliente = validos.filter((m) => !m.deMi && !m.reenviado);
  const entrega = instante(cotizacion.entregadaEn);

  // Aceptación: el último mensaje del cliente posterior a la cotización que confirma de forma inequívoca.
  const aceptacion = [...delCliente].reverse().find((m) => entrega !== null && instante(m.at) > entrega && confirmaResumen(m.texto));
  exigir(aceptacion, 'no hay un mensaje del cliente que acepte de forma clara después de la cotización');
  const antesDeAceptar = aceptacion ? delCliente.filter((m) => instante(m.at) <= instante(aceptacion.at)) : [];
  const nombre = buscarFuente(registro.nombre, antesDeAceptar);
  const direccion = buscarFuente(registro.direccion, antesDeAceptar);
  exigir(nombre, 'nombre sin mensaje de origen');
  exigir(direccion, 'dirección sin mensaje de origen');
  exigir(registro.nombre.trim().split(/\s+/).length >= 2, 'el nombre debe tener al menos dos palabras');
  exigir(registro.nombre.length >= 3 && registro.nombre.length <= 200, 'nombre: 3 a 200 caracteres');
  exigir(registro.direccion.length >= 5 && registro.direccion.length <= 500, 'dirección: 5 a 500 caracteres');
  exigir(registro.municipio.length >= 3 && registro.municipio.length <= 100, 'municipio: 3 a 100 caracteres');
  exigir(typeof cotizacion.entryId === 'string' && cotizacion.entryId.length >= 1 && cotizacion.entryId.length <= 100, 'entryId inválido');
  exigir(Number.isInteger(cotizacion.valor) && cotizacion.valor >= 1 && cotizacion.valor <= MAX_PRECIO, 'precio fuera de rango');
  exigir(typeof scheduleHash === 'string' && scheduleHash.length > 0, 'falta el hash de la tabla de precios');
  exigir(ID.test(cotizacion.mensajeId ?? '') && entrega !== null, 'falta el mensaje propio entregado con el precio');
  if (aceptacion && entrega !== null) exigir(instante(aceptacion.at) - entrega <= VENTANA_COTIZACION_MS, 'la cotización tiene más de 24 horas');

  // Campos opcionales: solo se envían si tienen su mensaje de origen; nunca se truncan.
  const preferencia = registro.preferenciaLiteral ? buscarFuente(registro.preferenciaLiteral, antesDeAceptar) : null;
  const mascotas = registro.mascotas && registro.mascotas.length <= 100 ? buscarFuente(registro.mascotas, antesDeAceptar) : null;
  const barrio = registro.barrio && registro.barrio.length >= 3 ? buscarFuente(registro.barrio, antesDeAceptar) : null;
  const unidad = registro.casaOUnidad && registro.casaOUnidad.length >= 3 ? buscarFuente(registro.casaOUnidad, antesDeAceptar) : null;
  if (errores.length) return { ok: false, errores };

  const fuente = (m) => ({ id: m.id, text: m.texto, at: m.at });
  const nativa = (m) => ({ ...fuente(m), phone: telefono, line: linea, fromMe: false, forwarded: false });
  const a = cotizacion.args;
  const cuerpo = {
    caseId, phone: telefono, line: linea, sourceId: delCliente[0].id,
    customerName: registro.nombre, address: registro.direccion, municipality: registro.municipio,
    // Barrio y unidad con fuente van en accessDetails; si falta alguno, quedan como detalle de ubicación.
    locationDetails: barrio && unidad ? '' : [registro.barrio && `Barrio: ${registro.barrio}`, registro.casaOUnidad && `Unidad: ${registro.casaOUnidad}`].filter(Boolean).join('. '),
    ...(barrio && unidad ? { accessDetails: { guard: GUARDIA_ACCESO, neighborhood: { value: registro.barrio, source: nativa(barrio) }, unit: { value: registro.casaOUnidad, source: nativa(unidad) } } } : {}),
    ...(mascotas ? { petPresence: registro.mascotas } : {}),
    slots: {
      service: a.plaga, site: a.inmueble, location: a.municipio,
      ...(a.habitaciones ? { rooms: `${a.habitaciones} ${a.habitaciones === 1 ? 'habitación' : 'habitaciones'}` } : {}),
      ...(a.metrosCuadrados ? { area: `${a.metrosCuadrados} m2` } : {}),
      ...(a.colchones ? { mattresses: `${a.colchones} ${a.colchones === 1 ? 'colchón' : 'colchones'}` } : {}),
      ...(preferencia ? { preference: registro.preferenciaLiteral } : {}),
    },
    quote: {
      entryId: cotizacion.entryId, priceCop: cotizacion.valor, scheduleHash,
      mid: cotizacion.mensajeId, sourceId: delCliente[0].id, deliveredAt: cotizacion.entregadaEn,
      acceptedAt: aceptacion.at, acceptanceId: aceptacion.id,
    },
    sources: {
      customerName: fuente(nombre), address: fuente(direccion), acceptance: nativa(aceptacion),
      ...(preferencia ? { preference: fuente(preferencia) } : {}),
      ...(mascotas ? { petPresence: fuente(mascotas) } : {}),
    },
  };
  if (Buffer.byteLength(JSON.stringify(cuerpo)) > MAX_CUERPO) return { ok: false, errores: ['el cuerpo supera 40.000 bytes'] };
  return { ok: true, cuerpo };
}
