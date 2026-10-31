import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Store } from '../automation/service-bots/store.mjs';
import { Engine } from '../automation/service-bots/engine.mjs';
import { BUSINESSES, configFromEnv } from '../automation/service-bots/config.mjs';
import { drain } from '../automation/service-bots/transport.mjs';
import { listarSombra, colaSombra } from '../automation/service-bots/maria-agente-sombra.mjs';

const base = (company = 'fumigacion') => ({ company, ...BUSINESSES[company], enabled: true, activatedAt: Date.now() - 60000, lines: BUSINESSES[company].phones.map((phone, i) => ({ phone, instance: company + '-' + i })) });
const evento = (o = {}) => ({ id: 'SOMBRA0001', phone: '573001112233', at: Date.now(), line: '573126944997', fromMe: false, kind: 'text', text: 'Cucarachas, apartamento de 2 habitaciones en Bello', ...o });
const modelo = (texto, registro) => async (url, opciones) => {
  registro.push(JSON.parse(opciones.body));
  return { ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: texto }] }] }) };
};

test('nueva María: modo apagado por defecto; sombra solo en FUMIGACION; activo aún no habilitado', () => {
  const lines = base().lines.map((l, i) => ({ ...l, apiKey: String(i).repeat(32) }));
  const env = { BOT_COMPANY: 'fumigacion', BOT_LINES_JSON: JSON.stringify(lines), BOT_AUTH_TOKEN_HASH: 'a'.repeat(64), BOT_WEBHOOK_TOKEN_HASH: 'c'.repeat(64), BOT_DATA_KEY: 'b'.repeat(64), BOT_DATABASE_PATH: '/data/fumigacion/bot.sqlite', BOT_EVOLUTION_URL: 'https://own.example' };
  assert.equal(configFromEnv(env).mariaAgente, 'apagado');
  assert.equal(configFromEnv({ ...env, MARIA_AGENTE: 'sombra' }).mariaAgente, 'sombra');
  assert.throws(() => configFromEnv({ ...env, MARIA_AGENTE: 'activo' }), /MARIA_AGENTE_ACTIVE_NOT_ENABLED/);
  assert.throws(() => configFromEnv({ ...env, MARIA_AGENTE: 'cualquiera' }), /MARIA_AGENTE_INVALIDO/);
});

test('sombra: propone con el historial real, no envía nada, no cambia la respuesta actual y compara la respuesta exacta', async () => {
  const store = new Store(':memory:', 'fumigacion', randomBytes(32));
  try {
    const config = { ...base(), mariaAgente: 'sombra', conversationalAi: { ready: true, key: 'sk-prueba', model: 'modelo-prueba', scope: 'FUMIGACION' } };
    const enviados = [];
    const llamadas = [];
    const transport = { verifyLine: async () => {}, understand: async () => ({}), send: async (row, text) => { enviados.push(text); return 'MID' + enviados.length; },
      fetcher: modelo('PROPUESTA-SOMBRA: con gusto te ayudo, ¿en qué barrio de Bello queda el apartamento?', llamadas) };
    store.enqueue(evento());
    await drain(store, config, transport, new Engine(store, config));
    await colaSombra.vaciar();
    assert.equal(llamadas.length, 1, 'la nueva María fue consultada una vez');
    assert.match(JSON.stringify(llamadas[0].input), /Cucarachas, apartamento de 2 habitaciones en Bello/);
    assert.ok(enviados.every((t) => !/PROPUESTA-SOMBRA/.test(t)), 'la propuesta nunca se envía');
    assert.ok(store.db.prepare('SELECT body FROM outbox').all().every((r) => !/PROPUESTA-SOMBRA/.test(store.open(r.body))), 'la propuesta no entra al outbox');
    const [p] = listarSombra(store);
    assert.match(p.mariaNueva, /PROPUESTA-SOMBRA/);
    assert.equal(p.cliente, 'Cucarachas, apartamento de 2 habitaciones en Bello');
    const real = store.db.prepare('SELECT body FROM outbox WHERE id=?').get('SOMBRA0001:reply');
    assert.equal(p.mariaActual, real ? store.open(real.body) : null, 'compara con la respuesta de ese mismo mensaje');
    assert.equal(store.db.prepare("SELECT COUNT(*) n FROM audit WHERE action='MARIA_AGENTE_SOMBRA'").get().n, 1);
  } finally { store.close(); }
});

test('sombra: un chat con atención humana retenida no se consulta', async () => {
  const store = new Store(':memory:', 'fumigacion', randomBytes(32));
  try {
    const config = { ...base(), mariaAgente: 'sombra', conversationalAi: { ready: true, key: 'sk-prueba', model: 'modelo-prueba' } };
    const engine = new Engine(store, config);
    const llamadas = [];
    const transport = { verifyLine: async () => {}, understand: async () => ({}), send: async () => 'MID1', fetcher: modelo('no', llamadas) };
    store.enqueue(evento({ id: 'SOMBRA0003' }));
    await drain(store, config, transport, engine);
    await colaSombra.vaciar();
    store.db.prepare('UPDATE conversations SET hold=1 WHERE phone=?').run('573001112233');
    store.enqueue(evento({ id: 'SOMBRA0004', at: Date.now() + 1000, text: '¿y para el sábado?' }));
    await drain(store, config, transport, engine);
    await colaSombra.vaciar();
    assert.equal(llamadas.length, 1, 'solo el primer mensaje, antes de la retención');
  } finally { store.close(); }
});

test('sombra apagada: el flujo actual no consulta a la nueva María', async () => {
  const store = new Store(':memory:', 'fumigacion', randomBytes(32));
  try {
    const config = { ...base(), mariaAgente: 'apagado', conversationalAi: { ready: true, key: 'sk-prueba', model: 'modelo-prueba' } };
    let consultas = 0;
    const transport = { verifyLine: async () => {}, understand: async () => ({}), send: async () => 'MID1', fetcher: async () => { consultas++; throw Error('no'); } };
    store.enqueue(evento({ id: 'SOMBRA0002' }));
    await drain(store, config, transport, new Engine(store, config));
    await colaSombra.vaciar();
    assert.equal(consultas, 0);
    assert.equal(listarSombra(store).length, 0);
  } finally { store.close(); }
});
