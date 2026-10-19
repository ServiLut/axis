import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {MARIA_TENANT,MARIA_COMPANY} from '../automation/service-bots/maria-program.mjs';
import {createReviewedCustomerFollowupRuntime,reviewedFollowupNativeSourceHash,reviewedFollowupHistoryHash,REVIEWED_CUSTOMER_FOLLOWUP_STAGED} from '../automation/service-bots/reviewed-customer-followup.mjs';

const NOW=Date.parse('2026-10-19T16:00:00Z'),BLUE='573126944997',RED='573126938721',PHONE='573000009901',SOURCE='SYNTH_SOURCE_0001',MID='SYNTH_FOLLOWUP_0001',ACTOR='synthetic-maria-actor';
const sha=v=>createHash('sha256').update(v).digest('hex');
const clone=v=>structuredClone(v);
const authority=()=>({auditId:'synthetic-blue-audit',authorizationReference:'direct-user-synthetic-task-reference',sourceHash:sha('synthetic direct authorization')});
function fixture(){
  const f={at:NOW,sendCalls:0,programCalls:0,nativeCalls:0,ownerCalls:0};
  f.config={company:'fumigacion',name:'FUMIGACION',bot:'María Ángel',enabled:true,activatedAt:NOW-10*86400000,publicResponseStartsAt:NOW-86400000,lines:[{phone:BLUE,instance:'cucaracha-azul'},{phone:RED,instance:'cucaracha-roja'}],mariaProgram:{enabled:true,actorId:ACTOR,startsAt:NOW-10*86400000,expiresAt:NOW+86400000}};
  f.store=new Store(':memory:','fumigacion',randomBytes(32));
  f.source={key:{id:SOURCE,remoteJid:PHONE+'@s.whatsapp.net',fromMe:false},messageTimestamp:(NOW-2*86400000)/1000,message:{conversation:'Lo voy a pensar con calma y después les aviso.'},status:'READ',MessageUpdate:[]};
  f.records=[f.source];
  f.originalState={caseId:'fumigacion:'+SOURCE,slots:{service:'cucarachas'},customerDeferral:{active:true},asked:[]};
  f.store.db.prepare('INSERT INTO conversations(phone,line,hold,revision,at,body) VALUES(?,?,0,7,?,?)').run(PHONE,BLUE,NOW-2*86400000,f.store.seal(f.originalState));
  f.program=()=>({guard:'own-fumigacion-daily-readonly-program-snapshot-v1',company:'FUMIGACION',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,advisorMembershipId:ACTOR,checkedAt:new Date(f.at).toISOString(),readOnly:true,searchedContacts:[{phone:PHONE,clientIds:[],orderIds:[],complete:true,identityAmbiguous:false}],orders:[],coverage:{contactSearchComplete:true,integrityConflicts:false,noncanonicalPhoneFieldsCovered:false,hardDeletesCovered:false}});
  f.transport={config:f.config,
    verifyLine:async()=>{f.ownerCalls++;if(f.ownerHook)await f.ownerHook();return {ownerVerified:true,open:true,phone:BLUE,instance:'cucaracha-azul',...f.bindingPatch};},
    request:async(line,route,body)=>{f.nativeCalls++;assert.equal(line.phone,BLUE);assert.equal(route,'/chat/findMessages/cucaracha-azul');if(f.nativeHook)await f.nativeHook(body);if(f.nativeError)throw Error('synthetic unavailable');let rows=clone(f.records);if(body.where.key.id)rows=rows.filter(r=>r.key.id===body.where.key.id);else {for(const [k,v] of Object.entries(body.where.key))rows=rows.filter(r=>r.key[k]===v);const from=Date.parse(body.where.messageTimestamp.gte),through=Date.parse(body.where.messageTimestamp.lte);rows=rows.filter(r=>Number(r.messageTimestamp)*1000>=from&&Number(r.messageTimestamp)*1000<=through);}const total=f.badTotal??rows.length;return {messages:{total,records:rows.slice((body.page-1)*body.offset,body.page*body.offset)}};},
    currentAttention:async()=>{if(f.attentionHook)await f.attentionHook();return {complete:true,through:f.at,sources:[],...f.attentionPatch};},
    send:async(row,text)=>{f.sendCalls++;assert.equal(f.store.db.prepare('SELECT state FROM outbox WHERE id=?').get(row.id).state,'SENDING');if(f.sendHook)await f.sendHook(row,text);if(f.sendError)throw Error('synthetic timeout after request');return MID;}
  };
  f.reader=async()=>{f.programCalls++;if(f.programHook)await f.programHook();if(f.programError)throw Error('synthetic reader unavailable');return {...f.program(),...f.programPatch};};
  f.runtime=createReviewedCustomerFollowupRuntime(f.config,f.store,f.transport,{authorization:authority(),readProgram:f.reader,now:()=>f.at});
  f.readBody=()=>({company:'fumigacion',line:BLUE,phone:PHONE,sourceId:SOURCE,historyFrom:NOW-3*86400000});
  f.proposal=()=>({company:'fumigacion',line:BLUE,phone:PHONE,sourceId:SOURCE,authorization:authority(),review:{nativeSourceHash:reviewedFollowupNativeSourceHash(f.source),historyFrom:NOW-3*86400000,historyHash:reviewedFollowupHistoryHash(f.records),revision:7,caseId:f.originalState.caseId,text:'Hola, entiendo que deseas pensarlo con calma. ¿Hay alguna duda de tu solicitud en la que pueda ayudarte?',textHash:sha('Hola, entiendo que deseas pensarlo con calma. ¿Hay alguna duda de tu solicitud en la que pueda ayudarte?'),reviewedAt:f.at}});
  f.prepare=()=>f.runtime.prepare(f.proposal());
  f.keyBody=key=>({company:'fumigacion',key});
  f.close=()=>f.store.close();
  return f;
}
function order(f,extra={}){return {id:'synthetic-order',clientId:'synthetic-client',createdAt:new Date(NOW-365*86400000).toISOString(),scheduledAt:null,actualStartedAt:null,actualFinishedAt:null,deletedAt:null,state:'NUEVO',canonicalContacts:[PHONE],contactScopeVerified:true,...extra};}
function withOrder(f,value){const base=f.program;f.program=()=>{const p=base();p.orders=[value];p.searchedContacts[0].clientIds=[value.clientId];p.searchedContacts[0].orderIds=[value.id];return p;};}

test('native exact PN read exposes local hold/revision without requiring a historical journal event',async()=>{
  const f=fixture();try{assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM events').get().n,0);const r=await f.runtime.readStatus(f.readBody());assert.equal(r.native.verified,true);assert.equal(r.local.hold,false);assert.equal(r.local.revision,7);assert.equal(r.eligible,true);assert.equal(r.history.hash,reviewedFollowupHistoryHash(f.records));assert.equal(f.sendCalls,0);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM events').get().n,0);}finally{f.close();}
});
test('prepare is encrypted, non-sendable, and leaves conversation/deferral and public cutoff intact',async()=>{
  const f=fixture();try{const before=clone(f.store.conversation(PHONE));const r=await f.prepare();assert.equal(r.state,'PREPARED');assert.equal(r.outboxState,REVIEWED_CUSTOMER_FOLLOWUP_STAGED);assert.equal(f.sendCalls,0);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM outbox WHERE state='READY'").get().n,0);assert.deepEqual(f.store.conversation(PHONE),before);assert.equal(f.config.publicResponseStartsAt,NOW-86400000);assert.doesNotMatch(f.store.db.prepare('SELECT body FROM reviewed_customer_followups').get().body,/Lo voy|entiendo|synthetic direct/);assert.doesNotMatch(f.store.db.prepare('SELECT body FROM reviewed_customer_followup_ledger').get().body,/entiendo|authorizationReference/);}finally{f.close();}
});
test('a once-only send persists its exact MID, recognizes the echo, and grants no first-bot authorship',async()=>{
  const f=fixture();try{const prepared=await f.prepare();const sent=await f.runtime.send(f.keyBody(prepared.key));assert.equal(sent.state,'ACCEPTED');assert.equal(sent.mid,MID);assert.equal(sent.deliveryVerified,false);assert.equal(f.sendCalls,1);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM case_authorship').get().n,0);const echo={id:MID,phone:PHONE,line:BLUE,at:f.at,fromMe:true,kind:'text',text:f.proposal().review.text};f.store.enqueue(echo);await new Engine(f.store,f.config).process(echo);assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(MID).state,'BOT_ECHO');assert.equal(f.store.conversation(PHONE).hold,0);assert.deepEqual(f.store.conversation(PHONE).state,f.originalState);const again=await f.runtime.send(f.keyBody(prepared.key));assert.equal(again.sends,0);assert.equal(f.sendCalls,1);}finally{f.close();}
});
test('the fact key survives repeat preparation, edited wording, dates, or task ids',async()=>{
  const f=fixture();try{const p=f.proposal(),first=await f.runtime.prepare(p);assert.equal((await f.runtime.prepare(p)).duplicate,true);const changed=clone(p);changed.review.text='Hola, ¿hay alguna duda de tu solicitud en la que pueda ayudarte?';changed.review.textHash=sha(changed.review.text);await assert.rejects(f.runtime.prepare(changed),/LAST_FACT_ALREADY_RESERVED/);changed.authorization.auditId='another-task';await assert.rejects(f.runtime.prepare(changed),/DIRECT_TASK_AUTHORIZATION/);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,1);assert.equal((await f.runtime.readStatus(f.keyBody(first.key))).found,true);}finally{f.close();}
});
for(const mode of ['absent','malformed','wrong-line','invalid-hold'])test('unknown local attention blocks: '+mode,async()=>{
  const f=fixture();try{if(mode==='absent')f.store.db.prepare('DELETE FROM conversations').run();if(mode==='malformed')f.store.saveConversation(PHONE,{slots:{}});if(mode==='wrong-line')f.store.db.prepare('UPDATE conversations SET line=?').run(RED);if(mode==='invalid-hold')f.store.db.prepare('UPDATE conversations SET hold=2').run();const r=await f.runtime.readStatus(f.readBody());assert.equal(r.eligible,false);assert.equal(r.local.hold,null);assert.match(r.reason,/LOCAL_ATTENTION_UNKNOWN/);assert.equal((await f.prepare()).queued,false);assert.equal(f.sendCalls,0);}finally{f.close();}
});
for(const mode of ['hold','humanHold','awaitingHumanReview','doNotContact','optOutGlobal','contactDeclined','closed','durable-red-optout'])test('attention and no-contact are preserved: '+mode,async()=>{
  const f=fixture();try{if(mode==='hold')f.store.hold(PHONE,'synthetic-staff');else if(mode==='durable-red-optout')f.store.db.prepare('INSERT INTO meta VALUES(?,?)').run('commercial-optout:fumigacion:'+sha(PHONE+':'+RED),f.store.seal({kind:'no-contact'}));else f.store.saveConversation(PHONE,{...f.originalState,[mode]:true});const before=clone(f.store.conversation(PHONE));const r=await f.prepare();assert.equal(r.eligible,false);assert.match(r.reason,/HUMAN_ATTENTION|NO_CONTACT/);assert.deepEqual(f.store.conversation(PHONE),before);assert.equal(f.sendCalls,0);}finally{f.close();}
});
test('a staff hold arriving after preparation blocks reservation without releasing it',async()=>{
  const f=fixture();try{const p=await f.prepare();f.store.hold(PHONE,'synthetic-new-staff');const r=await f.runtime.send(f.keyBody(p.key));assert.equal(r.state,'REVIEW');assert.equal(f.sendCalls,0);assert.equal(f.store.conversation(PHONE).hold,1);}finally{f.close();}
});
for(const mode of ['remote','alternate','owner','not-unique','deleted','media','new-incoming','unavailable'])test('native proof cannot be replaced by HTTP assertions: '+mode,async()=>{
  const f=fixture();try{if(mode==='remote')f.source.key.remoteJid='573000001234@s.whatsapp.net';if(mode==='alternate')f.source.key.remoteJidAlt='573000001234@s.whatsapp.net';if(mode==='owner')f.bindingPatch={phone:RED};if(mode==='not-unique')f.badTotal=2;if(mode==='deleted')f.source.MessageUpdate=[{status:'DELETED'}];if(mode==='media')f.source.message={imageMessage:{caption:'reviewed claim'}};if(mode==='new-incoming')f.records.push({...clone(f.source),key:{...f.source.key,id:'SYNTH_SOURCE_0002'},messageTimestamp:(NOW-1000)/1000});if(mode==='unavailable')f.nativeError=true;const r=await f.runtime.readStatus(f.readBody());assert.equal(r.eligible,false);assert.equal(f.sendCalls,0);}finally{f.close();}
});
test('an explicit PN alternate on the current native source works without an old journal binding',async()=>{
  const f=fixture();try{f.source.key.remoteJid='1234567890@lid';f.source.key.remoteJidAlt=PHONE+'@s.whatsapp.net';const r=await f.runtime.readStatus(f.readBody());assert.equal(r.local.hold,false);assert.equal(r.native.verified,true);assert.equal(r.eligible,true);}finally{f.close();}
});
for(const mode of ['refusal','media','edit','conflicting-pn'])test('same-JID LID context cannot supply identity or conceal risk: '+mode,async()=>{
  const f=fixture();try{f.source.key.remoteJid='1234567890@lid';f.source.key.remoteJidAlt=PHONE+'@s.whatsapp.net';const row={...clone(f.source),key:{id:'SYNTH_LID_GAP_001',remoteJid:'1234567890@lid',fromMe:false},messageTimestamp:(NOW-4*86400000)/1000,message:{conversation:'No quiero que me vuelvan a escribir.'}};if(mode==='media')row.message={imageMessage:{caption:'unreviewed'}};if(mode==='edit')row.MessageUpdate=[{status:'EDITED'}];if(mode==='conflicting-pn')row.key.remoteJidAlt='573000001234@s.whatsapp.net';f.records.unshift(row);const r=await f.runtime.readStatus(f.readBody());assert.equal(r.native.verified,true);assert.equal(r.eligible,false);assert.match(r.reason,mode==='conflicting-pn'?/HISTORY_IDENTITY_CONFLICT/:/NATIVE_LID_CONTEXT_REQUIRED/);assert.equal(f.sendCalls,0);}finally{f.close();}
});
for(const mode of ['changed','later-source','stale','stale-program','program-exception','native-exception','unknown-attention','native-staff','staff-during-program'])test('fresh revalidation blocks send: '+mode,async()=>{
  const f=fixture();try{const p=await f.prepare();if(mode==='changed')f.source.message.conversation='Otra solicitud posterior.';if(mode==='later-source')f.records.push({...clone(f.source),key:{...f.source.key,id:'SYNTH_SOURCE_0002'},messageTimestamp:(NOW-1000)/1000});if(mode==='stale')f.at+=120001;if(mode==='stale-program')f.programPatch={checkedAt:new Date(f.at-120001).toISOString()};if(mode==='program-exception')f.programError=true;if(mode==='native-exception')f.nativeError=true;if(mode==='unknown-attention')f.attentionPatch={complete:false};if(mode==='native-staff')f.attentionPatch={sources:[{id:'SYNTH_STAFF_0001',line:BLUE,at:f.at-1000,kind:'text'}]};if(mode==='staff-during-program')f.programHook=async()=>f.store.hold(PHONE,'synthetic-intervention');const r=await f.runtime.send(f.keyBody(p.key));assert.equal(r.state,'REVIEW');assert.equal(r.sends,0);assert.equal(f.sendCalls,0);if(mode==='staff-during-program')assert.equal(f.store.conversation(PHONE).hold,1);}finally{f.close();}
});
for(const mode of ['current-order','future-booking','current-completion','ambiguous-client','truncated-orders'])test('fresh scoped program facts prevent a conflicting followup: '+mode,async()=>{
  const f=fixture();try{if(mode==='current-order')withOrder(f,order(f,{createdAt:new Date(NOW-86400000).toISOString()}));if(mode==='future-booking')withOrder(f,order(f,{scheduledAt:new Date(NOW+86400000).toISOString()}));if(mode==='current-completion')withOrder(f,order(f,{actualFinishedAt:new Date(NOW-86400000).toISOString(),state:'LIQUIDADO'}));if(mode==='ambiguous-client'){const base=f.program;f.program=()=>{const p=base();p.searchedContacts[0].identityAmbiguous=true;return p;};}if(mode==='truncated-orders'){const base=f.program;f.program=()=>{const p=base();p.searchedContacts[0].orderIds=['unread-order'];return p;};}const r=await f.prepare();assert.equal(r.eligible,false);assert.equal(f.sendCalls,0);}finally{f.close();}
});
test('old unfinished/finished orders do not prove that the new October case was concluded',async()=>{
  for(const state of ['NUEVO','LIQUIDADO','SIN_CONCRETAR']){const f=fixture();try{withOrder(f,order(f,{state}));assert.equal((await f.prepare()).state,'PREPARED',state);}finally{f.close();}}
});
test('earlier no-contact cannot be hidden by choosing a later case start',async()=>{
  const f=fixture();try{f.records.unshift({...clone(f.source),key:{...f.source.key,id:'SYNTH_REFUSAL_001'},messageTimestamp:(NOW-30*86400000)/1000,message:{conversation:'No quiero que me vuelvan a escribir.'}});const r=await f.runtime.readStatus(f.readBody());assert.match(r.reason,/NATIVE_REFUSAL/);assert.equal(r.eligible,false);}finally{f.close();}
});
test('an expressed future contact day is respected while a soft deferral remains unchanged',async()=>{
  const f=fixture();try{f.source.messageTimestamp=(NOW-1000)/1000;f.source.message.conversation='Por favor escríbeme mañana.';assert.match((await f.prepare()).reason,/FUTURE_CONTACT/);assert.deepEqual(f.store.conversation(PHONE).state,f.originalState);}finally{f.close();}
});
test('timeout after reservation is durable UNCERTAIN and never retried',async()=>{
  const f=fixture();try{const p=await f.prepare();f.sendError=true;const r=await f.runtime.send(f.keyBody(p.key));assert.equal(r.state,'UNCERTAIN');assert.equal(r.outboxState,'UNCERTAIN');assert.equal(f.sendCalls,1);assert.equal((await f.runtime.send(f.keyBody(p.key))).sends,0);assert.equal((await f.prepare()).duplicate,true);assert.equal(f.sendCalls,1);}finally{f.close();}
});
test('concurrent sends reserve only one provider attempt and echoes during SENDING are not taken as staff',async()=>{
  const f=fixture();try{const p=await f.prepare();let resume;f.sendHook=async(row,text)=>{f.store.enqueue({id:MID,phone:PHONE,line:BLUE,at:f.at,fromMe:true,kind:'text',text});assert.equal(f.store.conversation(PHONE).hold,0);await new Promise(r=>{resume=r;});};const first=f.runtime.send(f.keyBody(p.key));while(!resume)await new Promise(r=>setImmediate(r));const other=await f.runtime.send(f.keyBody(p.key));assert.equal(other.sends,0);resume();assert.equal((await first).state,'ACCEPTED');assert.equal(f.sendCalls,1);await new Engine(f.store,f.config).process({id:MID,phone:PHONE,line:BLUE,at:f.at,fromMe:true,kind:'text',text:f.proposal().review.text});assert.equal(f.store.conversation(PHONE).hold,0);}finally{f.close();}
});
test('closed request contracts reject claimed eligibility, foreign/internal destinations, or unsafe copy',async()=>{
  const f=fixture();try{const p=f.proposal();await assert.rejects(f.runtime.prepare({...p,eligible:true}),/CLOSED_PREPARE/);await assert.rejects(f.runtime.readStatus({...f.readBody(),complete:true}),/CLOSED_READ/);await assert.rejects(f.runtime.prepare({...p,phone:'573016803926'}),/EXACT_RECIPIENT/);for(const text of ['El precio es especial para ti. ¿Deseas continuar?','Tu servicio está garantizado, puedes confirmar.','Tu servicio quedó programado para mañana.','Te enviaremos un técnico mañana.','El servicio cuesta $100.000.']){const proposal=clone(p);proposal.review.text=text;proposal.review.textHash=sha(text);await assert.rejects(f.runtime.prepare(proposal),/EXACT_REVIEWED_PROPOSAL/);}assert.equal(f.sendCalls,0);}finally{f.close();}
});

function duringRead(f,stage,action){
  if(stage==='program')f.programHook=async()=>action();
  if(stage==='attention')f.attentionHook=async()=>action();
  if(stage==='owner'){let owners=0;f.ownerHook=async()=>{if(++owners===3)action();};}
}
for(const operation of ['prepare','send'])for(const stage of ['program','attention','owner'])for(const kind of ['response','no-contact'])test('native '+kind+' arriving during '+stage+' blocks '+operation+' before reservation',async()=>{
  const f=fixture();try{
    const prepared=operation==='send'?await f.prepare():null,before=clone(f.store.conversation(PHONE));
    duringRead(f,stage,()=>f.records.push({...clone(f.source),key:{...f.source.key,id:'SYNTH_LATER_NATIVE_0002'},messageTimestamp:f.at/1000,message:{conversation:kind==='no-contact'?'No quiero que me vuelvan a escribir.':'Ya tomé una decisión, necesito hablar con ustedes.'}}));
    const result=operation==='send'?await f.runtime.send(f.keyBody(prepared.key)):await f.prepare();
    assert.equal(result.state,'REVIEW');assert.equal(result.sends??0,0);assert.equal(f.sendCalls,0);
    assert.deepEqual(f.store.conversation(PHONE),before);
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM events').get().n,0,'the new webhook has not arrived');
    assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM outbox WHERE state='SENDING'").get().n,0);
    if(operation==='prepare')assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM reviewed_customer_followups').get().n,0);
    else assert.equal((await f.runtime.send(f.keyBody(prepared.key))).sends,0);
  }finally{f.close();}
});
for(const stage of ['program','attention','owner'])test('a real hold arriving during '+stage+' remains held after final native revalidation',async()=>{
  const f=fixture();try{const prepared=await f.prepare();duringRead(f,stage,()=>f.store.hold(PHONE,'synthetic-intervention'));const result=await f.runtime.send(f.keyBody(prepared.key));assert.equal(result.state,'REVIEW');assert.equal(result.sends,0);assert.equal(f.sendCalls,0);assert.equal(f.store.conversation(PHONE).hold,1);}finally{f.close();}
});
test('an unequivocal written optout remains an optout when replying to a quoted message',async()=>{
  const f=fixture();try{
    f.source.message={extendedTextMessage:{text:'No quiero que me vuelvan a escribir.',contextInfo:{stanzaId:'SYNTH_QUOTED_BOT_001',quotedMessage:{conversation:'¿Tienes alguna duda de tu solicitud?'}}}};
    const result=await f.prepare();assert.equal(result.state,'REVIEW');assert.match(result.reason,/NATIVE_REFUSAL/);assert.equal(f.sendCalls,0);assert.deepEqual(f.store.conversation(PHONE).state,f.originalState);
  }finally{f.close();}
});
for(const mode of ['quoted-body-only','relayed-own-text'])test('a purely relayed refusal does not become a customer optout: '+mode,async()=>{
  const f=fixture();try{
    f.source.message={extendedTextMessage:{text:mode==='relayed-own-text'?'Mi vecino dice que no quiere que le vuelvan a escribir.':'Lo voy a pensar con calma.',contextInfo:{stanzaId:'SYNTH_QUOTED_OTHER_001',quotedMessage:{conversation:'No quiero que me vuelvan a escribir.'}}}};
    assert.equal((await f.prepare()).state,'PREPARED');assert.equal(f.sendCalls,0);assert.deepEqual(f.store.conversation(PHONE).state,f.originalState);
  }finally{f.close();}
});
for(const text of ['Por favor escríbeme el 25 de octubre.','Por favor escríbeme el próximo viernes.','Llámame el 25.','Por favor escríbeme cuando pueda atenderte.','Escríbeme el 25/10.','Escríbeme el 2026-10-25.','Escríbeme el 2026-02-30.'])test('future or unresolved requested contact timing requires review: '+text,async()=>{
  const f=fixture();try{f.source.message.conversation=text;const result=await f.prepare();assert.equal(result.state,'REVIEW');assert.match(result.reason,/FUTURE_CONTACT/);assert.equal(f.sendCalls,0);assert.deepEqual(f.store.conversation(PHONE).state,f.originalState);}finally{f.close();}
});
test('a valid fully specified past contact day is resolved without inventing its year',async()=>{
  const f=fixture();try{f.source.message.conversation='Por favor escríbeme el 2026-10-18.';assert.equal((await f.prepare()).state,'PREPARED');assert.equal(f.sendCalls,0);assert.deepEqual(f.store.conversation(PHONE).state,f.originalState);}finally{f.close();}
});
