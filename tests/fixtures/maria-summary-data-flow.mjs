import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';
import {Store} from '../../automation/service-bots/store.mjs';import {Engine} from '../../automation/service-bots/engine.mjs';
import {BUSINESSES} from '../../automation/service-bots/config.mjs';
import {approvedBusinessPriceSchedule} from '../../automation/service-bots/business-prices.mjs';
import {MARIA_TENANT,MARIA_COMPANY,registrationHash} from '../../automation/service-bots/maria-program.mjs';
export function createSummaryDataFixture(setTime){
 const start=Date.parse('2026-10-16T21:20:00.000Z'),actorId='7508385b-536e-4aa2-8137-d734dfc900ef',orderId='85c47fc8-5314-4f68-a8d6-dde112640f5d';setTime(start);
 const store=new Store(':memory:','fumigacion',randomBytes(32));store.importKnowledge(approvedBusinessPriceSchedule());
 const config={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,activatedAt:start-60000,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'summary-fixture-'+i})),mariaProgram:{enabled:true,url:'https://tenaxis-backend-0zeuja.servilutioncrm.cloud/integrations/maria-service-registration',token:'synthetic_local_only_'.padEnd(43,'x'),actorId,tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,startsAt:start-60000,expiresAt:Date.parse('2026-11-07T16:56:52.680Z')}};
 const engine=new Engine(store,config);let n=0;
 const turn=async(text,patch={})=>{const event={id:'SYNTHETIC_SUMMARY_DATA_'+ ++n,phone:'573000007384',line:config.lines[0].phone,at:start+n*10000,fromMe:false,forwarded:false,kind:'text',text,...patch};setTime(event.at);store.enqueue(event);await engine.process(event);return event;};
 const row=e=>store.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');
 const reply=e=>{const r=row(e);return r&&store.open(r.body);};
 const deliver=e=>{const r=row(e);assert.ok(r,'own response to '+e.text);setTime(e.at+4000);const mid='MID_'+e.id;store.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED' WHERE id=?").run(mid,r.id);store.recordFirstBotReply(r,mid,config.bot,e.at+4000);store.delivery(mid,e.line,'DELIVERED');return reply(e);};
 const state=e=>store.conversation(e.phone).state;
 const summary=async()=>{const quote=await turn('Cucarachas en apartamento de dos habitaciones en Itagüí, barrio Santa María.');assert.match(deliver(quote),/129\.000/);const initial=await turn('Sí');deliver(initial);const facts=await turn('Nombre: Laura Gómez\nDirección: Calle 50 # 42-18 apartamento 301');assert.match(reply(facts),/¿Confirmas que estos datos son correctos/);return {quote,initial,facts};};
 const entry=e=>{const r=store.db.prepare('SELECT value FROM meta WHERE key=?').get('maria-registration:'+state(e).caseId);return r&&store.open(r.value);};
 const transport=handler=>({verifyLine:async()=>{},currentAttention:async()=>({complete:true,sources:store.db.prepare('SELECT mid id,line FROM outbox WHERE mid IS NOT NULL').all()}),currentCustomerActivity:async(phone,at)=>({complete:true,sources:store.db.prepare('SELECT id,line,at FROM events WHERE phone=? AND from_me=0 AND at>=?').all(phone,at)}),request:async(_line,_path,body)=>{
  const id=body.where.key.id,incoming=store.db.prepare('SELECT body FROM events WHERE id=?').get(id),outgoing=store.db.prepare('SELECT * FROM outbox WHERE mid=?').get(id);
  if(incoming){const e=store.open(incoming.body);return {messages:{records:[{key:{id,remoteJid:e.phone+'@s.whatsapp.net',fromMe:false},message:{conversation:e.text},messageTimestamp:e.at/1000}]}};}
  if(outgoing)return {messages:{records:[{key:{id,remoteJid:outgoing.phone+'@s.whatsapp.net',fromMe:true},message:{conversation:store.open(outgoing.body)},status:'DELIVERY_ACK',messageTimestamp:Math.floor(outgoing.created/1000)}]}};
  return {messages:{records:[]}};
 },fetcher:handler});
 const receipt=p=>({company:'FUMIGACION',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,advisorMembershipId:actorId,createdById:actorId,phone:p.phone,persisted:true,orderId,caseId:p.caseId,acceptanceId:p.quote.acceptanceId,requestHash:registrationHash(p),state:'NUEVO',scheduled:false,paymentRecorded:false});
 return {store,config,engine,turn,row,reply,deliver,state,summary,entry,transport,receipt};
}
