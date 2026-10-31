// Generado por work/maria-agente/construir-integracion.mjs desde src/sombra.mjs. No editar aquí.
// Modo sombra: la nueva María lee los mensajes de clientes que pasaron los controles del runtime y propone
// su respuesta SIN enviarla. Registrar y pasar a humano quedan simulados. Todo se guarda cifrado (meta + seal)
// para compararlo con la respuesta que salió. Revisión de Codex del 31/10 aplicada: fila con un consumidor,
// reserva antes de consultar, atención humana vigente, minimización, límites de llamadas y errores sin texto crudo.
import { crearConversacion } from './maria-agente-nucleo.mjs';

export const MODOS = ['apagado', 'sombra', 'activo'];
export const GUARDIA_SOMBRA = 'maria-agente-sombra-v2';
const CLAVE = 'maria-agente-sombra:';
const USO = 'maria-agente-sombra-uso:';
const VENTANA_ASESORA_MS = 2 * 60 * 60 * 1000;

export function modoDesdeEntorno(env = {}) {
  const modo = String(env.MARIA_AGENTE || 'apagado').trim().toLowerCase();
  if (!MODOS.includes(modo)) throw Error('MARIA_AGENTE_INVALIDO');
  return modo;
}

// Roles del almacén: customer, bot y outbound-author-unverified (escrito a mano desde el número: asesora).
export function historialDesdeContexto(contexto, eventoId, minimizar = (t) => t) {
  const previos = [];
  for (const t of contexto?.turns ?? []) {
    if (t.sourceId === eventoId) continue;
    const rol = t.role === 'customer' ? 'cliente' : t.role === 'bot' ? 'maria' : 'asesora';
    const crudo = typeof t.text === 'string' && t.text.trim() ? t.text : t.role === 'customer' && t.kind && t.kind !== 'text' ? `[El cliente envió ${t.kind}]` : '';
    const texto = crudo ? minimizar(crudo) : '';
    if (texto) previos.push({ rol, texto });
  }
  return previos;
}

export function asesoraActiva(contexto, eventoAt) {
  return (contexto?.turns ?? []).some((t) => t.role === 'outbound-author-unverified' && t.at <= eventoAt && eventoAt - t.at <= VENTANA_ASESORA_MS);
}

const leerMeta = (store, clave) => {
  const fila = store.db.prepare('SELECT value FROM meta WHERE key=?').get(clave);
  return fila ? store.open(fila.value) : null;
};
const escribirMeta = (store, clave, valor) =>
  store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(clave, store.seal(valor));
const enTransaccion = (store, fn) => (typeof store.tx === 'function' ? store.tx(fn) : fn());
const codigoError = (e) => {
  const m = String(e?.message ?? '');
  if (/LIMITE_LLAMADAS/.test(m)) return 'LIMITE_LLAMADAS';
  if (/HTTP (\d{3})/.test(m)) return 'HTTP_' + m.match(/HTTP (\d{3})/)[1];
  if (/timeout|abort|CANCELADA/i.test(m) || e?.name === 'AbortError' || e?.name === 'TimeoutError') return 'TIEMPO_AGOTADO';
  return 'ERROR';
};

// atencionHumanaPrevia: el chat ya estaba retenido o en revisión ANTES de este mensaje (lo calcula el runtime).
// Si la María actual escala en este mismo turno, la sombra sí propone: es justo el caso que interesa comparar.
// señal: cancelación que envía la fila al vencer el plazo; corta la llamada en curso y las siguientes.
const fetcherCancelable = (fetcher, señal) => (url, opciones = {}) => {
  if (!señal) return fetcher(url, opciones);
  if (señal.aborted) throw Error('CANCELADA: tiempo agotado en la fila');
  const signal = opciones.signal ? AbortSignal.any([opciones.signal, señal]) : señal;
  return fetcher(url, { ...opciones, signal });
};

export async function proponerEnSombra({ config, store, evento, fetcher = fetch, esInterno = () => false, minimizar = (t) => t, atencionHumanaPrevia = false, limiteMensual = 3000, maxLlamadas = 6, señal = null, ahora = Date.now() }) {
  if (config?.company !== 'fumigacion' || config.mariaAgente !== 'sombra') return null;
  if (!evento || evento.fromMe || evento.forwarded || esInterno(evento.phone)) return null;
  const ai = config.conversationalAi;
  if (!ai?.ready || !ai.key || !ai.model) return null;
  const clave = CLAVE + evento.id;
  const mes = new Date(ahora).toISOString().slice(0, 7);

  // Reserva atómica del evento y de la cuota ANTES de consultar: sin duplicados mientras otra consulta corre.
  const reservado = enTransaccion(store, () => {
    if (store.db.prepare('SELECT 1 FROM meta WHERE key=?').get(clave)) return false;
    const uso = leerMeta(store, USO + mes) ?? { mes, propuestas: 0 };
    if (uso.propuestas >= limiteMensual) return false;
    escribirMeta(store, USO + mes, { ...uso, propuestas: uso.propuestas + 1 });
    escribirMeta(store, clave, { guardia: GUARDIA_SOMBRA, eventoId: evento.id, linea: evento.line, at: evento.at, estado: 'RESERVADO' });
    return true;
  });
  if (!reservado) return null;

  // Atención humana: retención vigente (una persona tomó el chat), revisión previa a este mensaje o asesora reciente.
  const conversacionActual = store.conversation?.(evento.phone);
  const contexto = store.conversationContext(evento.phone, evento.at, 20, evento.id);
  const motivoCalla = conversacionActual?.hold ? 'retencion-humana' : atencionHumanaPrevia ? 'revision-humana' : asesoraActiva(contexto, evento.at) ? 'asesora-reciente' : null;

  const efectosSimulados = [];
  const efectos = {
    registrar: (args, cotizacion) => { efectosSimulados.push({ tipo: 'registrar', valor: args.valor, plaga: args.plaga, cotizado: cotizacion?.valor ?? null }); return { guardado: true, id: 'SOMBRA' }; },
    pasarAHumano: (args) => { efectosSimulados.push({ tipo: 'pasar_a_humano', motivo: args.motivo, urgente: args.urgente }); return { avisado: true }; },
    guardarInstruccion: () => ({ guardada: false, motivo: 'modo sombra' }),
  };
  const conversacion = crearConversacion({ clave: ai.key, modelo: ai.model, fetcher: fetcherCancelable(fetcher, señal), sesion: 'sombra', maxLlamadas, efectos,
    historialPrevio: historialDesdeContexto(contexto, evento.id, minimizar) });
  const inicio = Date.now();
  let propuesta = '';
  let error = null;
  if (!motivoCalla) {
    try { propuesta = await conversacion.responder(evento.kind === 'text' ? minimizar(evento.text) : `[El cliente envió ${evento.kind || 'un mensaje sin texto'}]`); }
    catch (e) { error = codigoError(e); }
  }
  const registro = {
    guardia: GUARDIA_SOMBRA, estado: 'LISTO', eventoId: evento.id, linea: evento.line, at: evento.at, propuesta, motivoCalla, error,
    segundos: Math.round((Date.now() - inicio) / 100) / 10,
    herramientas: conversacion.acciones.map((a) => ({ herramienta: a.herramienta, ok: a.resultado?.ok ?? a.resultado?.guardado ?? true, valor: a.resultado?.valor ?? null, motivo: a.resultado?.motivo ?? null })),
    efectos: efectosSimulados,
  };
  escribirMeta(store, clave, registro);
  store.audit('MARIA_AGENTE_SOMBRA', evento.id, { guardia: GUARDIA_SOMBRA, motivoCalla, herramientas: registro.herramientas.map((h) => h.herramienta), error, enviado: false });
  return registro;
}

// Fila acotada con UN solo consumidor: nunca hay dos propuestas a la vez (revisión de Codex del 31/10).
// Al vencer el plazo se cancela la propuesta (señal → llamadas al modelo) y se ESPERA su cierre real antes de
// seguir. Si no cierra ni siquiera tras la cancelación, la fila se bloquea: deja de aceptar trabajo en vez de
// abrir otra consulta en paralelo.
export function crearColaSombra({ procesar = proponerEnSombra, maximo = 20, timeoutMs = 60000, graciaMs = 5000, alBloquear = () => {} } = {}) {
  const fila = [];
  let corriendo = null;
  let detenida = false;
  let bloqueada = false;
  let enCurso = 0;
  const unaPropuesta = async (item) => {
    const control = new AbortController();
    const plazo = setTimeout(() => control.abort(), timeoutMs);
    const bloqueo = setTimeout(() => { bloqueada = true; detenida = true; fila.length = 0; alBloquear(item); }, timeoutMs + graciaMs);
    plazo.unref?.(); bloqueo.unref?.();
    enCurso++;
    try { await procesar({ ...item, señal: control.signal }); } catch { /* el error ya queda registrado por procesar */ }
    finally { enCurso--; clearTimeout(plazo); clearTimeout(bloqueo); }
  };
  const consumir = async () => {
    while (fila.length && !detenida) await unaPropuesta(fila.shift());
    corriendo = null;
  };
  return {
    encolar(item) {
      if (detenida || fila.length >= maximo) return false;
      fila.push(item);
      corriendo ??= consumir();
      return true;
    },
    // Resuelve cuando no queda NINGUNA propuesta corriendo (no solo cuando la fila se vacía).
    vaciar: () => corriendo ?? Promise.resolve(),
    detener() { detenida = true; fila.length = 0; },
    pendientes: () => fila.length,
    estado: () => ({ enCurso, pendientes: fila.length, detenida, bloqueada }),
  };
}
export const colaSombra = crearColaSombra({
  alBloquear: (item) => { try { item.store.audit('MARIA_AGENTE_SOMBRA_FILA_BLOQUEADA', item.evento?.id, { guardia: GUARDIA_SOMBRA, enviado: false }); } catch { /* sin almacén */ } },
});

// Para revisar: la propuesta junto al mensaje del cliente y la respuesta exacta de ese mensaje (<evento>:reply).
export function listarSombra(store, { limite = 50 } = {}) {
  const filas = store.db.prepare('SELECT key, value FROM meta WHERE key LIKE ? ORDER BY rowid DESC LIMIT ?').all(CLAVE + '%', Math.min(Math.max(1, limite), 200));
  return filas.map((f) => {
    const r = store.open(f.value);
    const ev = store.db.prepare('SELECT phone, body FROM events WHERE id=?').get(r.eventoId);
    const actual = store.db.prepare('SELECT body, state FROM outbox WHERE id=? AND line=?').get(r.eventoId + ':reply', r.linea);
    return {
      cuando: new Date(r.at).toISOString(), telefono: ev ? '…' + String(ev.phone).slice(-4) : null, linea: r.linea, estado: r.estado,
      cliente: ev ? store.open(ev.body)?.text ?? null : null,
      mariaActual: actual ? store.open(actual.body) : null,
      mariaActualEstado: actual ? actual.state : 'sin respuesta para este mensaje',
      mariaNueva: r.motivoCalla ? `(calla: ${r.motivoCalla})` : r.propuesta, herramientas: r.herramientas, segundos: r.segundos, error: r.error,
    };
  });
}
