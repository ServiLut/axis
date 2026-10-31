// Generado por work/maria-agente/construir-integracion.mjs desde src/herramientas.mjs. No editar aquí.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cotizar, normalizar, PLAGAS } from './maria-agente-precios.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const BITACORA = join(RAIZ, 'salidas', 'acciones-simuladas.jsonl');
const INSTRUCCIONES_JEFA = join(RAIZ, 'conocimiento', 'instrucciones-jefa.md');

// Definiciones para OpenAI Responses (function calling estricto).
export const DEFINICIONES = [
  {
    type: 'function',
    name: 'cotizar',
    description: 'Calcula el precio aprobado de un servicio residencial. Úsala siempre antes de decir un valor. Devuelve un id de cotización.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['plaga', 'inmueble', 'municipio', 'habitaciones', 'metrosCuadrados', 'colchones', 'muebles', 'pisos', 'patio'],
      properties: {
        plaga: { type: 'string', enum: PLAGAS, description: '"roedores" incluye ratas y ratones; "otra" para plagas sin tabla.' },
        inmueble: { type: 'string', description: 'casa, apartamento u otro tipo tal como lo dijo el cliente' },
        municipio: { type: 'string' },
        habitaciones: { type: ['integer', 'null'] },
        metrosCuadrados: { type: ['number', 'null'] },
        colchones: { type: ['integer', 'null'], description: 'Solo para chinches' },
        muebles: { type: ['integer', 'null'], description: 'Solo para chinches: sofás, sofá cama u otros muebles afectados (0 si no hay)' },
        pisos: { type: ['integer', 'null'], description: 'Niveles del inmueble si el cliente lo mencionó' },
        patio: { type: ['boolean', 'null'], description: 'true si el cliente mencionó patio' },
      },
    },
  },
  {
    type: 'function',
    name: 'registrar_servicio',
    description: 'Crea el servicio en el programa. Solo cuando el último mensaje del cliente confirma el resumen.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['cotizacionId', 'nombre', 'tipoDocumento', 'numeroDocumento', 'telefono', 'correo', 'direccion', 'casaOUnidad', 'municipio', 'barrio', 'plaga', 'inmueble', 'tamano', 'valor', 'fechaPreferida', 'franjaPreferida', 'preferenciaLiteral', 'mascotas', 'observaciones'],
      properties: {
        cotizacionId: { type: 'string', description: 'id devuelto por cotizar; cadena vacía solo si la jefa dictó el valor' },
        nombre: { type: 'string', description: 'Copiado tal cual del mensaje del cliente, solo el nombre (sin frases como "aquí te lo mandé")' },
        tipoDocumento: { type: 'string', enum: ['CC', 'CE', 'NIT', 'otro', 'no_dado'] },
        numeroDocumento: { type: 'string', description: 'Cadena vacía si no lo dio' },
        telefono: { type: 'string', description: 'Fijo o celular que dio el cliente; cadena vacía si no lo dio' },
        correo: { type: 'string', description: 'Cadena vacía si no lo dio' },
        direccion: { type: 'string', description: 'Copiada tal cual del mensaje del cliente, solo la dirección (sin el nombre ni otros datos)' },
        casaOUnidad: { type: 'string', description: 'Unidad, torre, apartamento; cadena vacía si es casa sin unidad' },
        municipio: { type: 'string' },
        barrio: { type: 'string' },
        plaga: { type: 'string' },
        inmueble: { type: 'string' },
        tamano: { type: 'string' },
        valor: { type: 'integer', description: 'Exactamente el valor de la cotización indicada' },
        fechaPreferida: { type: 'string', description: 'AAAA-MM-DD o cadena vacía. Es preferencia, no cita confirmada.' },
        franjaPreferida: { type: 'string', enum: ['manana', 'tarde', 'hora_exacta', 'indiferente'] },
        preferenciaLiteral: { type: 'string', description: 'Lo que dijo el cliente sobre fecha y hora, tal cual' },
        mascotas: { type: 'string' },
        observaciones: { type: 'string' },
      },
    },
  },
  {
    type: 'function',
    name: 'pasar_a_humano',
    description: 'Avisa al equipo para que una asesora continúe o complete la respuesta. El cliente no debe saberlo.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['motivo', 'urgente', 'resumen'],
      properties: {
        motivo: { type: 'string', enum: ['fuera_de_cobertura', 'sin_precio', 'pregunta_tecnica', 'queja', 'pago', 'emergencia', 'cliente_pide_humano', 'correccion_o_cancelacion', 'fallo_registro', 'otro'] },
        urgente: { type: 'boolean' },
        resumen: { type: 'string', description: 'Qué necesita el cliente y qué datos ya dio' },
      },
    },
  },
];

// Solo disponible cuando el mensaje llega del número verificado de la jefa.
export const DEFINICION_INSTRUCCION = {
  type: 'function',
  name: 'guardar_instruccion',
  description: 'Guarda una instrucción permanente de la jefa (cómo responder, precios especiales, qué hacer en una situación). Se aplica desde la siguiente conversación.',
  strict: true,
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['instruccion'],
    properties: { instruccion: { type: 'string', description: 'La instrucción redactada clara y completa, en tercera persona' } },
  },
};

// Confirmación explícita del cliente al resumen: se comprueba en código, no se deja al modelo.
const AFIRMATIVO = /^(?:si|claro|confirmo|confirmado|listo|dale|de acuerdo|correcto|ok|okay|perfecto|exacto|asi es|esta bien|todo bien|de una)\b/;
export const confirmaResumen = (texto) => AFIRMATIVO.test(normalizar(texto).replace(/^[^a-z]+/, ''));

function bitacora(registro) {
  mkdirSync(dirname(BITACORA), { recursive: true });
  appendFileSync(BITACORA, JSON.stringify({ at: new Date().toISOString(), ...registro }) + '\n');
}

// Tenaxis exige que nombre y dirección vengan de un mensaje real del cliente (MariaSourcesDto).
// Además evita el error de la orden BF23DF14: nombre y dirección mezclados o con frases de conversación.
const NO_ES_DATO = /\b(?:aqui|te lo|te la|mande|envie|mi nombre es|me llamo|direccion|nombre)\b/;
function fuenteLiteral(valor, mensajes) {
  const v = normalizar(valor).replace(/\s+/g, ' ');
  if (v.length < 3 || NO_ES_DATO.test(v)) return null;
  return mensajes.find((m) => normalizar(m).replace(/\s+/g, ' ').includes(v)) ?? null;
}

// Efectos del prototipo: simulados, escriben en salidas/ y no tocan Tenaxis ni WhatsApp.
// El servidor (modo sombra o activo) inyecta los suyos; las validaciones de abajo aplican siempre.
export const efectosDePrueba = (sesion) => ({
  registrar(args, cotizacion) {
    const id = 'SIM-' + Date.now().toString(36).toUpperCase();
    bitacora({ sesion, accion: 'registrar_servicio', id, ...args, cotizacion });
    return { guardado: true, id };
  },
  pasarAHumano(args) { bitacora({ sesion, accion: 'pasar_a_humano', ...args }); return { avisado: true }; },
  guardarInstruccion(instruccion) {
    const fecha = new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota' });
    appendFileSync(INSTRUCCIONES_JEFA, `- (${fecha}) ${instruccion.replace(/\s+/g, ' ').trim()}\n`);
    bitacora({ sesion, accion: 'guardar_instruccion', instruccion });
    return { guardada: true };
  },
});

export function crearEjecutor({ sesion, preciosCotizados, esJefa = false, efectos = null, ultimoMensaje = () => '', mensajesCliente = () => [] }) {
  const ef = efectos ?? efectosDePrueba(sesion);
  const cotizaciones = new Map();
  let registrado = null;
  return {
    cotizar(args) {
      const r = cotizar(args);
      if (!r.ok) return r;
      const id = 'COT-' + (cotizaciones.size + 1);
      cotizaciones.set(id, { valor: r.valor, entryId: r.entryId, args: { ...args } });
      preciosCotizados.push(r.valor);
      return { ...r, cotizacionId: id };
    },
    registrar_servicio(args) {
      if (!esJefa) {
        if (registrado) return { guardado: false, motivo: `Esta conversación ya tiene un servicio registrado (${registrado}); para cambios usa pasar_a_humano` };
        if (cotizaciones.get(args.cotizacionId)?.valor !== args.valor) return { guardado: false, motivo: 'El valor no coincide con la cotización indicada' };
        if (!confirmaResumen(ultimoMensaje())) return { guardado: false, motivo: 'El último mensaje del cliente no confirma el resumen; pide confirmación' };
        for (const campo of ['nombre', 'direccion']) {
          if (!fuenteLiteral(args[campo], mensajesCliente())) {
            return { guardado: false, motivo: `El campo ${campo} debe copiarse tal cual de un mensaje del cliente, sin otras palabras` };
          }
        }
        if (/\d/.test(args.nombre) || normalizar(args.direccion).includes(normalizar(args.nombre))) {
          return { guardado: false, motivo: 'Nombre y dirección están mezclados; sepáralos' };
        }
      }
      // El conector real usa esta cotización (entryId, tamaño) para armar el registro de Tenaxis.
      const r = ef.registrar(args, cotizaciones.get(args.cotizacionId) ?? null);
      if (r?.guardado) registrado = r.id ?? 'registrado';
      return r;
    },
    pasar_a_humano(args) {
      return ef.pasarAHumano(args);
    },
    guardar_instruccion({ instruccion }) {
      if (!esJefa) return { guardada: false, motivo: 'Solo la jefa puede dar instrucciones' };
      return ef.guardarInstruccion(instruccion);
    },
  };
}
