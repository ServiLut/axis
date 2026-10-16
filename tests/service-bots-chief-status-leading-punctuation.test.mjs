import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {chiefStatusTopic} from '../automation/service-bots/chief-status.mjs';
import {parseChiefCommand} from '../automation/service-bots/chief-actions.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {Store} from '../automation/service-bots/store.mjs';
import {BUSINESSES,SANDRA} from '../automation/service-bots/config.mjs';
import {BLUE_ONLY_SCOPE_VERSION,BLUE_ONLY_AUTHORIZATION_SOURCE,FUMIGACION_BLUE,FUMIGACION_RED} from '../automation/service-bots/line-scope.mjs';

const actualQuestion='María Ángel, ¿estás atendiendo a los clientes?';
function fixture(enabled=false){
  const at=Date.now(),config={company:'fumigacion',...BUSINESSES.fumigacion,enabled,chiefOnly:true,activatedAt:at-60000,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'synthetic-chief-status-'+i})),operationalLineScope:{company:'fumigacion',version:BLUE_ONLY_SCOPE_VERSION,authorizationSource:BLUE_ONLY_AUTHORIZATION_SOURCE,activeLines:[FUMIGACION_BLUE],suspendedLines:[FUMIGACION_RED],authorizedAt:new Date(at-60000).toISOString()}};
  const store=new Store(':memory:','fumigacion',randomBytes(32));
  return {config,store,engine:new Engine(store,config),at};
}
const event=(f,text,extra={})=>({id:'SYNTHETIC_CHIEF_INTERROGATED',phone:SANDRA,line:FUMIGACION_BLUE,at:f.at,kind:'text',fromMe:false,forwarded:false,quotedId:null,text,...extra});

test('the exact native customer-status question delegates to status rather than the unsupported command planner',()=>{
  const f=fixture();try{
    assert.equal(chiefStatusTopic('¿estás atendiendo a los clientes?'),'customer-status');
    assert.equal(parseChiefCommand(event(f,actualQuestion),f.config),null);
  }finally{f.store.close();}
});

test('opening Spanish question and exclamation marks preserve only the existing closed status topics',()=>{
  for(const [text,topic] of [['¿Estás ahí?','presence'],['¡Estás disponible!','presence'],['¿Cuántos chats has respondido hoy?','counts'],['¿Estás respondiendo los mensajes?','customer-status'],['¿ ¡ Estás atendiendo a los clientes?!','customer-status']])assert.equal(chiefStatusTopic(text),topic,text);
});

for(const enabled of [false,true])test('directed interrogated status reports the actual '+(enabled?'active':'paused')+' mode, once, without releasing human attention',async()=>{
  const f=fixture(enabled);try{
    const e=event(f,actualQuestion);f.store.enqueue(e);f.store.hold(SANDRA,'SYNTHETIC_STAFF_HOLD',true);await f.engine.process(e);await f.engine.process(e);
    assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(e.id).state,'CHIEF_STATUS');
    const rows=f.store.db.prepare('SELECT * FROM outbox').all();assert.equal(rows.length,1);assert.equal(rows[0].id,e.id+':status');assert.equal(rows[0].phone,SANDRA);assert.equal(rows[0].line,FUMIGACION_BLUE);assert.equal(rows[0].internal,1);
    const text=f.store.open(rows[0].body);assert.match(text,enabled?/activa en la línea 4997/:/pausada en la línea 4997/);assert.match(text,/8721 permanece suspendida/);assert.doesNotMatch(text,/guardé tu solicitud|consultar entradas|no ejecuté esa combinación|registré|pago recibido/);
    assert.equal(f.store.conversation(SANDRA).hold,1);assert.equal(f.store.db.prepare("SELECT name FROM sqlite_master WHERE name='chief_requests'").get(),undefined);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n,0);
  }finally{f.store.close();}
});

test('interrogated presence gets the presence reply under pause and never runs a command',async()=>{
  const f=fixture();try{const e=event(f,'María Ángel, ¿estás ahí?');f.store.enqueue(e);await f.engine.process(e);assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(e.id).state,'CHIEF_PRESENCE');const row=f.store.db.prepare('SELECT * FROM outbox').get();assert.equal(row.id,e.id+':presence');assert.match(f.store.open(row.body),/Sí, Sandra/);assert.match(f.store.open(row.body),/pausada/);}finally{f.store.close();}
});

test('punctuation does not turn negation, narration, quotations, hypotheticals or combined business actions into status',()=>{
  for(const text of ['¿No estás atendiendo a los clientes?','¿María dice que estás atendiendo a los clientes?','«¿Estás atendiendo a los clientes?»','"¿Estás atendiendo a los clientes?"','¿Si estás atendiendo a los clientes?','¿Estás atendiendo a los clientes y registra un servicio?','¿Estás atendiendo a los clientes? Cobra el servicio.'])assert.equal(chiefStatusTopic(text),null,text);
});

test('a forwarded message, third-person mention, customer or outgoing staff text acquires no chief-status authority',async()=>{
  const patches=[{forwarded:true},{text:'María Ángel dijo: ¿estás atendiendo a los clientes?'},{phone:'573000009999'},{fromMe:true}];
  for(const patch of patches){const f=fixture();try{const e=event(f,actualQuestion,patch);f.store.enqueue(e);await f.engine.process(e);assert.notEqual(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(e.id).state,'CHIEF_STATUS');assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE id=?').get(e.id+':status').n,0);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n,0);}finally{f.store.close();}}
});

test('a genuine reply to an exact delivered own message can ask interrogated status while an unlinked reply cannot',async()=>{
  for(const linked of [false,true]){const f=fixture();try{
    f.store.queue('SYNTHETIC_OWN_REPLY',SANDRA,FUMIGACION_BLUE,'Estoy aquí.',true,0);f.store.db.prepare("UPDATE outbox SET state='DELIVERED',mid='SYNTHETIC_OWN_MID'").run();
    const e=event(f,'¿Estás atendiendo a los clientes?',{quotedId:linked?'SYNTHETIC_OWN_MID':'SYNTHETIC_OTHER_MID'});f.store.enqueue(e);f.store.hold(SANDRA,'SYNTHETIC_EXISTING_HOLD',true);await f.engine.process(e);
    const state=f.store.db.prepare('SELECT state FROM events WHERE id=?').get(e.id).state;if(linked)assert.equal(state,'CHIEF_STATUS');else assert.notEqual(state,'CHIEF_STATUS');assert.equal(f.store.conversation(SANDRA).hold,1);
  }finally{f.store.close();}}
});
