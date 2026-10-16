import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {approvedBusinessPriceSchedule} from '../automation/service-bots/business-prices.mjs';
import {registrationStatus} from '../automation/service-bots/maria-program.mjs';

function fixture(){
 const start=Math.floor((Date.now()-120000)/1000)*1000,store=new Store(':memory:','fumigacion',randomBytes(32));store.importKnowledge(approvedBusinessPriceSchedule());
 const config={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,activatedAt:start-1000,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'ISOLATED_NAME_CORRECTION_'+i})),mariaProgram:{enabled:true,url:'https://invalid.example/integrations/maria-service-registration',token:'isolated-only-not-network',actorId:'7508385b-536e-4aa2-8137-d734dfc900ef',startsAt:start-1000,expiresAt:start+86400000}};
 const engine=new Engine(store,config);let seq=0;
 const turn=async(text,extra={})=>{const e={id:'ISOLATED_NAME_CORRECTION_'+ ++seq,phone:'573000006921',line:config.lines[0].phone,at:start+seq*1000,kind:'text',fromMe:false,forwarded:false,text,...extra};store.enqueue(e);await engine.process(e);const row=store.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');return {e,row,text:row?store.open(row.body):null,state:store.conversation(e.phone).state};};
 const deliver=r=>{assert.ok(r.row,r.e.text);const mid='ISOLATED_NAME_MID_'+r.e.id;store.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED' WHERE id=?").run(mid,r.row.id);store.recordFirstBotReply({...r.row,mid},mid,config.bot,r.e.at);store.delivery(mid,r.e.line,'DELIVERED');store.db.prepare('UPDATE meta SET value=? WHERE key=?').run(store.seal({verifiedAt:r.e.at,mid,line:r.e.line,state:'DELIVERED'}),'first-delivery:'+r.row.id);};
 const ready=async()=>{const quote=await turn('Cucarachas en apartamento de 60 m² en Medellín, ¿cuánto cuesta?');deliver(quote);const accept=await turn('Sí');deliver(accept);const facts=await turn('Nombre: Juan Pérez\nDirección: Calle 50 # 42-18 apartamento 301');deliver(facts);assert.equal(facts.state.programIntake.stage,'confirm');return {quote,accept,facts};};
 return {store,config,turn,deliver,ready};
}
const noBusiness=f=>{const status=registrationStatus(f.config,f.store);assert.equal(status.saved,0);assert.equal(status.prepared,0);};

for(const correction of ['Corrijo el nombre: Juliana Arango Pérez','Corrijo mi nombre completo: Juliana Arango Pérez','Rectifico mi nombre: Juliana Arango Pérez'])test('a direct literal name correction renews the summary and keeps the address source: '+correction,async()=>{
 const f=fixture();try{
  const {facts}=await f.ready(),r=await f.turn(correction),pi=r.state.programIntake;
  assert.match(r.text,/Juliana Arango Pérez/);assert.match(r.text,/Confirmas/);assert.equal(pi.stage,'confirm');
  assert.equal(pi.customerName,'Juliana Arango Pérez');assert.equal(pi.nameSource.id,r.e.id);assert.equal(pi.nameSource.text,correction);
  assert.equal(pi.address,'Calle 50 # 42-18 apartamento 301');assert.equal(pi.addressSource.id,facts.e.id);assert.equal(pi.preview.customerName,pi.customerName);
  assert.equal(f.store.open(f.store.db.prepare('SELECT body FROM events WHERE id=?').get(facts.e.id).body).text,facts.e.text);noBusiness(f);
  const early=await f.turn('Confirmo');assert.notEqual(early.state.programIntake.stage,'pending');noBusiness(f);
  f.deliver(r);const final=await f.turn('Confirmo');assert.equal(final.state.programIntake.stage,'pending');assert.equal(registrationStatus(f.config,f.store).prepared,1);assert.equal(registrationStatus(f.config,f.store).saved,0);
  const saved=f.store.open(f.store.db.prepare("SELECT value FROM meta WHERE key LIKE 'maria-registration:%'").get().value);
  assert.equal(saved.payload.customerName,'Juliana Arango Pérez');assert.equal(saved.payload.sources.customerName.id,r.e.id);assert.equal(saved.payload.sources.address.id,facts.e.id);assert.equal(saved.payload.sources.acceptance.id,final.e.id);assert.equal(saved.summaryOutboxId,r.row.id);
 }finally{f.store.close();}
});

for(const invalidName of ['Otra Persona Sintética','mi vecino Juan Pérez','Juan'])test('an explicit but unverifiable corrected name asks for clarification and cannot reuse the old summary: '+invalidName,async()=>{
 const f=fixture();try{
  const {facts}=await f.ready(),r=await f.turn('Corrijo el nombre: '+invalidName),pi=r.state.programIntake;
  assert.match(r.text||'',/nombre completo correcto/i);assert.equal(pi.stage,'correction');assert.equal(pi.preview,null);assert.deepEqual(pi.requestedFields,['name']);assert.equal(pi.nameSource.id,facts.e.id);noBusiness(f);
  f.deliver(r);const yes=await f.turn('Sí');assert.notEqual(yes.state.programIntake.stage,'pending');noBusiness(f);
  const corrected=await f.turn('Mi nombre es Juliana Arango Pérez');assert.match(corrected.text||'',/Juliana Arango Pérez/);assert.match(corrected.text||'',/Confirmas/);assert.equal(corrected.state.programIntake.nameSource.id,corrected.e.id);noBusiness(f);
 }finally{f.store.close();}
});

test('a financial condition does not become an ordinary name correction',async()=>{
 const f=fixture();try{await f.ready();const r=await f.turn('Corrijo el nombre: quiero un descuento');assert.equal(r.state.programIntake.customerName,'Juan Pérez');assert.notEqual(r.state.programIntake.stage,'pending');assert.equal(r.state.programIntake.pendingNameCorrectionSource,undefined);noBusiness(f);}finally{f.store.close();}
});

test('a relayed correction cannot replace the current customer name or source',async()=>{
 const f=fixture();try{const {facts}=await f.ready(),r=await f.turn('Mi vecino dijo: Corrijo el nombre: Juliana Arango Pérez');assert.equal(r.state.programIntake.customerName,'Juan Pérez');assert.equal(r.state.programIntake.nameSource.id,facts.e.id);noBusiness(f);}finally{f.store.close();}
});

test('an address update cannot bypass an unresolved corrected name, even if the earlier name is later confirmed again',async()=>{
 const f=fixture();try{
  await f.ready();const invalid=await f.turn('Corrijo el nombre: Juan');f.deliver(invalid);
  const address=await f.turn('Dirección: Calle 52 # 40-20 apartamento 202');assert.match(address.text||'',/nombre completo correcto/i);assert.equal(address.state.programIntake.addressSource.id,address.e.id);assert.equal(address.state.programIntake.preview,null);noBusiness(f);f.deliver(address);
  await f.turn('Confirmo');noBusiness(f);
  const name=await f.turn('Mi nombre es Juan Pérez');assert.match(name.text||'',/Confirmas/);assert.equal(name.state.programIntake.nameSource.id,name.e.id);assert.equal(name.state.programIntake.addressSource.id,address.e.id);assert.equal(name.state.programIntake.pendingNameCorrectionSource,undefined);noBusiness(f);
 }finally{f.store.close();}
});

test('an invalid name correction followed by a literal name preserves an unrelated sourced pet observation',async()=>{
 const f=fixture();try{
  const quote=await f.turn('Cucarachas en apartamento de 60 m² en Medellín, ¿cuánto cuesta? Tengo dos mascotas.');f.deliver(quote);f.deliver(await f.turn('Sí'));
  const facts=await f.turn('Nombre: Juan Pérez\nDirección: Calle 50 # 42-18 apartamento 301');f.deliver(facts);
  const invalid=await f.turn('Corrijo el nombre: Juan');assert.match(invalid.text||'',/nombre completo correcto/i);f.deliver(invalid);
  const corrected=await f.turn('Mi nombre es Juliana Arango Pérez');assert.match(corrected.text||'',/Confirmas/);assert.equal(corrected.state.programIntake.stage,'confirm');assert.equal(corrected.state.programIntake.nameSource.id,corrected.e.id);assert.equal(corrected.state.programIntake.preview.petPresenceSource.id,quote.e.id);assert.equal(corrected.state.programIntake.preview.petPresence,'Tengo dos mascotas');noBusiness(f);
 }finally{f.store.close();}
});
