import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {Transport,drain} from '../automation/service-bots/transport.mjs';
import {BUSINESSES,SANDRA} from '../automation/service-bots/config.mjs';
import {PRICE_AUTHORITY,priceBodyHash,selectPrice,validatePriceCatalog,verifyPriceSource} from '../automation/service-bots/prices.mjs';
import {createBotServer} from '../automation/service-bots/server.mjs';

const phone='573001112233',at='2026-10-05T10:00:00.000Z';
const original='El servicio tiene un valor de TAN SOLO $155.000';
const facts='Cucarachas en casa, Medellín, Manrique, 5 cuartos pequeños';
function catalog(patch={}){
  return {company:'fumigacion',kind:'approved_price_catalog',source:PRICE_AUTHORITY,authorizationSource:PRICE_AUTHORITY,approval:{source:PRICE_AUTHORITY,reviewed:true},at,
    entries:[{id:'casa-cucarachas-manrique-cinco-pequenos',priceCop:155000,currency:'COP',active:true,scope:'ordinary-service-exact-reviewed-conditions',
      appliesTo:{service:'cucarachas',site:'casa',location:'medellin',locationDetails:'Manrique',rooms:'5 cuartos',roomScale:'pequeños'},
      source:{nativeVerified:true,line:'573126938721',quoteId:'QUOTE01',at,quoteHash:priceBodyHash(original),context:[{id:'SOURCE01',at,bodyHash:priceBodyHash(facts)}]},...patch}]};
}
function fixture(){
  const c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,historyCheckRequired:true,activatedAt:Date.now()-10000,
    lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'own-'+i,apiKey:'fake'}))};
  const s=new Store(':memory:','fumigacion',randomBytes(32)),engine=new Engine(s,c);let sequence=0;
  const native=(id,text,fromMe)=>({key:{id,remoteJid:phone+'@s.whatsapp.net',fromMe},messageTimestamp:Date.parse(at)/1000,message:{conversation:text}});
  const records=new Map([['QUOTE01',native('QUOTE01',original,true)],['SOURCE01',native('SOURCE01',facts,false)]]);
  const transport={config:c,verifyLine:async()=>{},priorHistory:async()=>({cutoff:c.activatedAt,priorOutgoing:false}),currentAttention:async()=>({complete:true,sources:[]}),
    understand:async()=>({}),request:async(line,path,body)=>({messages:{records:[records.get(body.where.key.id)].filter(Boolean)}}),send:async()=> 'BOTMID'+(++sequence)};
  const event=(id,text,extra={})=>({id,text,phone,line:c.lines[1].phone,at:Date.now(),fromMe:false,kind:'text',...extra});
  const process=async(id,text,extra={})=>{const e=event(id,text,extra);s.enqueue(e);await drain(s,c,transport,engine);return e;};
  const response=id=>{const row=s.db.prepare('SELECT * FROM outbox WHERE id=?').get(id+':reply');return row&&{...row,text:s.open(row.body)};};
  return {c,s,engine,transport,records,event,process,response};
}

test('the supplied first burst preserves all facts and quotes once instead of asking them again',async()=>{
  const f=fixture();try{
    f.s.importKnowledge(catalog());const start=Date.now();
    for(const [i,text]of ['Medellín, 5 cuartos (pequeños), sala y comedor','Cucarachas','Manrique','Casa'].entries())f.s.enqueue(f.event('BURST000'+i,text,{at:start+i}));
    await drain(f.s,f.c,f.transport,f.engine);
    const state=f.s.conversation(phone).state;
    assert.equal(state.slots.rooms,'5 cuartos');assert.equal(state.slots.roomScale,'pequeños');assert.equal(state.slots.location,'medellin');
    assert.match(state.slots.locationDetails,/Manrique/);assert.equal(state.intakeSources.service.sourceId,'BURST0001');
    assert.match(f.response('BURST0003').text,/\$155\.000 COP/);assert.doesNotMatch(f.response('BURST0003').text,/habitaciones|plaga|inmueble|pendiente/);
    assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox WHERE internal=0').get().n,1);
    assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
  }finally{f.s.close();}
});

test('facts supplied together with a price question remain literal and are not requested twice',async()=>{
  const f=fixture();try{
    await f.process('WITHQUESTION','Tengo cucarachas en mi casa de 3 habitaciones en Bello. ¿Cuánto cuesta?');
    assert.equal(f.s.conversation(phone).state.slots.rooms,'3 habitaciones');assert.equal(f.s.conversation(phone).state.slots.location,'bello');
    assert.match(f.response('WITHQUESTION').text,/Una asesora continuará/);assert.doesNotMatch(f.response('WITHQUESTION').text,/cuántas|qué plaga|qué tipo|municipio/i);
    await f.process('ADDEDFLOOR','Es en el primer piso');
    assert.equal(f.response('ADDEDFLOOR'),undefined);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,1);
  }finally{f.s.close();}
});

test('chinches intake asks about affected mattresses and retains an explicit count, never substitutes rooms',async()=>{
  const f=fixture();try{
    await f.process('CHINCHES01','Chinches en una casa en Bello, 3 habitaciones');
    assert.match(f.response('CHINCHES01').text,/colchones/);assert.doesNotMatch(f.response('CHINCHES01').text,/habitaciones|metros cuadrados/);
    await f.process('CHINCHES02','2 colchones y una base de cama');
    assert.equal(f.s.conversation(phone).state.slots.mattresses,'2 colchones');
    assert.equal(f.s.db.prepare('SELECT * FROM questions').get().topic,'cotizacion-verificada');
  }finally{f.s.close();}
});

test('a residential building requests its own quote instead of applying a household price',async()=>{
  const f=fixture();try{
    f.s.importKnowledge(catalog());await f.process('BUILDING01','Cucarachas en edificio de 5 apartamentos en Manrique Medellín');
    assert.equal(f.s.db.prepare('SELECT * FROM questions').get().topic,'special-quotation');
    assert.doesNotMatch(f.response('BUILDING01').text,/155|cuartos|habitaciones/);
    assert.equal(f.s.conversation(phone).state.awaitingHumanReview,true);
  }finally{f.s.close();}
});

test('matching never drops extra pests, area, floors, room size, or conflicting quotes',()=>{
  const doc=catalog(),slots=doc.entries[0].appliesTo;
  assert.equal(selectPrice({...slots,rooms:'cinco habitaciones'},[doc]).entry.priceCop,155000);
  for(const change of [{service:'cucarachas y hormigas'},{area:'100 m²'},{floors:'2 pisos'},{roomScale:'grandes'},{rooms:'6 cuartos'}])assert.equal(selectPrice({...slots,...change},[doc]).entry,undefined);
  const other=catalog({id:'conflicting-own-quote',priceCop:139000});
  assert.equal(selectPrice(slots,[doc,other]).reason,'CONFLICTING_REVIEWED_PRICES');
  assert.equal(selectPrice(slots,[doc,catalog({active:false})]).entry,undefined);
  assert.throws(()=>validatePriceCatalog({...doc,company:'servicio-tecnico'},'servicio-tecnico'));
});

test('natural acceptance continues to scheduling only after the exact price was delivered; no booking is claimed',async()=>{
  const f=fixture();try{
    f.s.importKnowledge(catalog());await f.process('PRICEFIRST',facts);f.s.delivery(f.response('PRICEFIRST').mid,f.c.lines[1].phone,'DELIVERED');
    await f.process('ACCEPTPRICE','Sí, por favor');
    assert.match(f.response('ACCEPTPRICE').text,/día y franja/);assert.doesNotMatch(f.response('ACCEPTPRICE').text,/155|inmueble|habitaciones/);
    await f.process('PREFERDAY1','Mañana en la tarde');
    assert.equal(f.s.db.prepare('SELECT * FROM questions').get().topic,'disponibilidad-y-tecnico');
    assert.doesNotMatch(f.response('PREFERDAY1').text,/cita confirmada|agendad|reservad|\$155/);
    assert.equal(f.s.conversation(phone).state.slots.preference,'Mañana en la tarde');
    await f.process('PREFERDAY2','Después de las dos');assert.equal(f.response('PREFERDAY2'),undefined);
  }finally{f.s.close();}
});

test('accepted-only or withdrawn quotations cannot support a natural confirmation',async()=>{
  for(const withdrawn of [false,true]){
    const f=fixture();try{
      f.s.importKnowledge(catalog());await f.process('UNDELPRICE',facts);
      if(withdrawn){f.s.delivery(f.response('UNDELPRICE').mid,f.c.lines[1].phone,'READ');f.s.importKnowledge({...catalog({active:false}),at:'2026-10-05T11:00:00.000Z'});}
      await f.process('UNDELACCEPT','Sí');
      if(withdrawn)assert.match(f.response('UNDELACCEPT').text,/Una asesora continuará/);else assert.equal(f.response('UNDELACCEPT'),undefined);
      assert.equal(f.s.conversation(phone).state.quotedPrice.accepted,undefined);
    }finally{f.s.close();}
  }
});

test('staff ingestion freezes a ready reply immediately, preserves authorship, and exact bot echoes do not freeze',async()=>{
  const f=fixture();try{
    await f.process('FIRSTSOURCE','Hola');const first=f.s.caseAuthorship('fumigacion:FIRSTSOURCE');
    const echo=f.event(f.response('FIRSTSOURCE').mid,f.response('FIRSTSOURCE').text,{fromMe:true});f.s.enqueue(echo);assert.equal(f.s.conversation(phone).hold,0);
    const second=f.event('PENDINGCLIENT','Cucarachas');f.s.enqueue(second);await f.engine.process(second);
    f.s.enqueue(f.event('WRITTENSTAFF','Buenos días, yo te atiendo.',{fromMe:true}));
    assert.equal(f.s.conversation(phone).hold,1);assert.equal(f.response('PENDINGCLIENT').state,'SUPPRESSED_HUMAN');
    assert.deepEqual(f.s.caseAuthorship(first.caseId),first);
    await drain(f.s,f.c,f.transport,f.engine);assert.equal(f.response('PENDINGCLIENT').mid,null);
  }finally{f.s.close();}
});

test('native quote verification rejects changed text, another contact, or another business before sending',async()=>{
  const f=fixture();try{
    const entry=catalog().entries[0];assert.equal(await verifyPriceSource(entry,f.transport),true);
    await assert.rejects(()=>verifyPriceSource({...entry,appliesTo:{...entry.appliesTo,rooms:'7 habitaciones'}},f.transport),/PRICE_SCOPE_NOT_IN_NATIVE_SOURCE/);
    f.records.get('QUOTE01').message.conversation+=' cambio';await assert.rejects(()=>verifyPriceSource(entry,f.transport),/PRICE_SOURCE_CHANGED/);
    f.s.importKnowledge(catalog());await f.process('CHANGEDSRC',facts);assert.equal(f.response('CHANGEDSRC').state,'PRICE_REVIEW');assert.equal(f.response('CHANGEDSRC').mid,null);
    f.records.get('QUOTE01').message.conversation=original;f.records.get('SOURCE01').key.remoteJid='573009998877@s.whatsapp.net';
    await assert.rejects(()=>verifyPriceSource(entry,f.transport),/PRICE_CONTACT_CONTEXT_MISMATCH/);
    await assert.rejects(()=>verifyPriceSource(entry,{...f.transport,config:{...f.c,company:'servicio-tecnico'}}),/PRICE_OWN_LINE_REQUIRED/);
  }finally{f.s.close();}
});

test('staff activity received during price-source verification suppresses the price',async()=>{
  const f=fixture();try{
    f.s.importKnowledge(catalog());const originalRequest=f.transport.request;
    f.transport.request=async(...args)=>{f.s.enqueue(f.event('STAFFINREAD','Ya te atiendo.',{fromMe:true}));return originalRequest(...args);};
    await f.process('PRICEWITHRACE',facts);assert.equal(f.response('PRICEWITHRACE').state,'SUPPRESSED_HUMAN');assert.equal(f.response('PRICEWITHRACE').mid,null);
  }finally{f.s.close();}
});

test('the authenticated price import verifies native sources, cannot cross company, and does not enqueue messages',async()=>{
  const f=fixture(),token='a'.repeat(43);f.c.authHash=createHash('sha256').update(token).digest('hex');
  const server=createBotServer(f.c,f.s,f.transport,f.engine);try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port+'/knowledge';
    const call=doc=>fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(doc)});
    assert.equal((await call(catalog())).status,200);
    f.records.get('QUOTE01').message.conversation+=' changed';assert.notEqual((await call({...catalog(),at:'2026-10-05T12:00:00.000Z'})).status,200);
    assert.notEqual((await call({...catalog(),company:'servicio-tecnico'})).status,200);
    assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
  }finally{await new Promise(resolve=>server.close(resolve));f.s.close();}
});

test('native outgoing edits with unavailable bodies retain attention while receipts alone do not',async()=>{
  const f=fixture();try{
    const transport=new Transport(f.c);transport.verifyLine=async()=>{};
    const row={key:{id:'EDITEDSTAFF',remoteJid:'12345@lid',remoteJidAlt:phone+'@s.whatsapp.net',fromMe:true},messageTimestamp:Math.floor(Date.now()/1000),message:null,MessageUpdate:[{status:'READ'},{status:'EDITED'}]};
    transport.request=async(line,path,body)=>{const rows=line.phone===f.c.lines[1].phone&&body.where.key.remoteJidAlt?[row]:[];return {messages:{total:rows.length,records:rows}};};
    assert.equal((await transport.currentAttention(phone)).sources[0].kind,'edited-body-unavailable');
    row.MessageUpdate=[{status:'READ'},{status:'DELIVERY_ACK'}];assert.equal((await transport.currentAttention(phone)).sources.length,0);
  }finally{f.s.close();}
});
