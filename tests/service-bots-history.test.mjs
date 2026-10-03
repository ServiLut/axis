import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Transport,drain} from '../automation/service-bots/transport.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,SANDRA,configFromEnv} from '../automation/service-bots/config.mjs';
const cfg=(company='fumigacion')=>({company,...BUSINESSES[company],enabled:true,activatedAt:Date.now()-10000,historyCheckRequired:true,provider:'https://own.example',lines:BUSINESSES[company].phones.map((phone,i)=>({phone,instance:company+'-'+i,apiKey:String(i).repeat(32)}))});
const ev=(c,patch={})=>({id:'NEWMSG001',phone:'573001112233',at:Date.now(),line:c.lines[0].phone,fromMe:false,kind:'text',text:'Hola',...patch});
const fixture=()=>{const c=cfg(),s=new Store(':memory:',c.company,randomBytes(32));return {c,s,e:new Engine(s,c)};};
test('own two-line history lookup checks actual owners and uses only the recipient before activation',async()=>{
 const c=cfg(),phone='573001112233',calls=[];
 const t=new Transport(c,async(url,o)=>{calls.push({url,o});const line=c.lines.find(l=>url.includes(l.instance));return {ok:true,json:async()=>url.includes('fetchInstances')?[{name:line.instance,ownerJid:line.phone+'@s.whatsapp.net',connectionStatus:'open'}]:{messages:{total:0,records:[]}}};});
 const r=await t.priorHistory(phone);assert.equal(r.priorOutgoing,false);assert.equal(r.checks.length,4);assert.equal(calls.length,6);assert.equal(r.guardVersion,'canonical-and-alternate-phone-v2');
 for(const call of calls.filter(v=>v.url.includes('findMessages'))){const q=JSON.parse(call.o.body);assert.equal(q.where.key.remoteJid??q.where.key.remoteJidAlt,phone+'@s.whatsapp.net');assert.equal(q.where.key.fromMe,true);assert.ok(Date.parse(q.where.messageTimestamp.lte)<c.activatedAt);assert.equal(q.offset,1);}
 assert.deepEqual(calls.map(v=>v.o.headers.apikey),[c.lines[0].apiKey,c.lines[0].apiKey,c.lines[0].apiKey,c.lines[1].apiKey,c.lines[1].apiKey,c.lines[1].apiKey]);
});
test('a history response from another number cannot permit an automatic reply',async()=>{
 const c=cfg(),t=new Transport(c,async(url)=>({ok:true,json:async()=>url.includes('fetchInstances')?[{name:c.lines[0].instance,ownerJid:c.lines[0].phone+'@s.whatsapp.net',connectionStatus:'open'}]:{messages:{total:1,records:[{key:{id:'OLDSTAFF',fromMe:true,remoteJid:'573009998877@s.whatsapp.net'},messageTimestamp:Math.floor((c.activatedAt-5000)/1000)}]}}}));
 await assert.rejects(()=>t.priorHistory('573001112233'),/HISTORY_RESULT_OUTSIDE_SCOPE/);
});
test('historical outgoing of unknown authorship preserves attention without assuming it was a bot',async()=>{
 const {c,s,e}=fixture();try{const m=ev(c);s.enqueue(m);let sent=0;
 await drain(s,c,{priorHistory:async()=>({cutoff:c.activatedAt,priorOutgoing:true,checks:[{line:c.lines[1].phone,total:1}]}),verifyLine:async()=>{},understand:async()=>({}),send:async()=>{sent++;return 'MID';}},e);
 assert.equal(s.conversation(m.phone).hold,1);assert.equal(sent,0);assert.equal(s.db.prepare('SELECT state FROM events').get().state,'OBSERVED_HUMAN');assert.equal(s.priorHistory(m.phone).priorOutgoing,true);
 }finally{s.close();}
});
test('new contact with verified absent prior outgoing is handled once without repeating the history check',async()=>{
 const {c,s,e}=fixture();try{let checked=0,sent=0;const t={priorHistory:async()=>{checked++;return {cutoff:c.activatedAt,priorOutgoing:false,checks:[]};},verifyLine:async()=>{},understand:async()=>({}),send:async()=>{sent++;return 'OUTMSG001';}};
 const first=ev(c);s.enqueue(first);await drain(s,c,t,e);const second=ev(c,{id:'NEWMSG002',at:first.at+1,text:'cucarachas'});s.enqueue(second);await drain(s,c,t,e);assert.equal(checked,1);assert.equal(sent,2);assert.equal(s.conversation(first.phone).hold,0);
 }finally{s.close();}
});
test('unavailable or unverifiable history is retained for review without a send or repeated automatic polling',async()=>{
 const {c,s,e}=fixture();try{const m=ev(c);s.enqueue(m);let attempts=0,sent=0;const t={priorHistory:async()=>{attempts++;throw Error('timeout');},send:async()=>{sent++;},understand:async()=>({})};await drain(s,c,t,e);await drain(s,c,t,e);assert.equal(attempts,1);assert.equal(sent,0);assert.equal(s.db.prepare('SELECT state FROM events').get().state,'HISTORY_REVIEW');}finally{s.close();}
});
test('verified explicit release is preserved when first preactivation history check happens later',async()=>{
 const {c,s,e}=fixture();try{const m=ev(c);s.enqueue(m);s.hold(m.phone,'STAFF001');const release=ev(c,{id:'CHIEFREL001',phone:SANDRA,text:'María Ángel, retoma chat de '+m.phone});s.enqueue(release);await e.process(release);assert.equal(s.conversation(m.phone).hold,0);s.savePriorHistory(m.phone,{cutoff:c.activatedAt,priorOutgoing:true,checks:[]},m.id);assert.equal(s.conversation(m.phone).hold,0);
 // A later staff turn continues to hold even with that earlier release marker.
 s.hold(m.phone,'LATERSTAFF');s.savePriorHistory(m.phone,{cutoff:c.activatedAt,priorOutgoing:true,checks:[]},m.id);assert.equal(s.conversation(m.phone).hold,1);
 }finally{s.close();}
});
test('chief natural directed presence has a brief answer and preserves human attention in each company',async()=>{
 for(const company of Object.keys(BUSINESSES)){const c=cfg(company),s=new Store(':memory:',company,randomBytes(32)),e=new Engine(s,c);try{const staff=ev(c,{id:'STAFF001',phone:SANDRA,fromMe:true});s.enqueue(staff);await e.process(staff);const m=ev(c,{phone:SANDRA,at:staff.at+1,text:c.bot+', ¿estás ahí?'});s.enqueue(m);await e.process(m);assert.equal(s.conversation(SANDRA).hold,1);assert.equal(s.db.prepare('SELECT state FROM events WHERE id=?').get(m.id).state,'CHIEF_PRESENCE');const out=s.db.prepare('SELECT body,internal FROM outbox').get();assert.equal(out.internal,1);assert.match(s.open(out.body),/Estoy aquí para ayudarte/);assert.equal(s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);}finally{s.close();}}
});
test('a key exposing more than the own instance is rejected even when its named owner matches',async()=>{
 const c=cfg(),t=new Transport(c,async()=>({ok:true,json:async()=>[{name:c.lines[0].instance,ownerJid:c.lines[0].phone+'@s.whatsapp.net',connectionStatus:'open'},{name:'abogados',ownerJid:'573152819233@s.whatsapp.net',connectionStatus:'open'}]}));
 await assert.rejects(()=>t.verifyLine(c.lines[0].phone),/CHANNEL_OWNER_MISMATCH/);
});
test('production activation cannot bypass the prior-history guard',()=>{
 const c=cfg(),env={BOT_COMPANY:c.company,BOT_LINES_JSON:JSON.stringify(c.lines),BOT_AUTH_TOKEN_HASH:'a'.repeat(64),BOT_WEBHOOK_TOKEN_HASH:'b'.repeat(64),BOT_DATA_KEY:'c'.repeat(64),BOT_DATABASE_PATH:'/data/fumigacion/bot.sqlite',BOT_EVOLUTION_URL:'https://own.example',BOT_ENABLED:'true',BOT_ACTIVATED_AT:new Date(c.activatedAt).toISOString()};
 assert.throws(()=>configFromEnv(env),/PRIOR_HISTORY_GUARD_REQUIRED/);assert.equal(configFromEnv({...env,BOT_PRIOR_HISTORY_CHECK:'true'}).historyCheckRequired,true);
});

test('preactivation staff attention under a verified phone alternative is found even with no canonical outgoing',async()=>{
 const c=cfg(),phone='573001112233',at=Math.floor((c.activatedAt-5000)/1000);
 const t=new Transport(c,async(url,o)=>{const line=c.lines.find(l=>url.includes(l.instance));if(url.includes('fetchInstances'))return {ok:true,json:async()=>[{name:line.instance,ownerJid:line.phone+'@s.whatsapp.net',connectionStatus:'open'}]};const q=JSON.parse(o.body),records=q.where.key.remoteJidAlt&&line===c.lines[0]?[{key:{id:'OLDALTSOURCE',remoteJid:'12345678@lid',remoteJidAlt:phone+'@s.whatsapp.net',fromMe:true},messageTimestamp:at}]:[];return {ok:true,json:async()=>({messages:{total:records.length,records}})};});
 const result=await t.priorHistory(phone);assert.equal(result.priorOutgoing,true);assert.equal(result.checks.find(x=>x.total).lastSourceId,'OLDALTSOURCE');
});

test('current native attention covers both addressing forms and ignores read-only protocol synchronization',async()=>{
 const c=cfg(),phone='573001112233',at=Math.floor(Date.now()/1000);
 const t=new Transport(c,async(url,o)=>{const line=c.lines.find(l=>url.includes(l.instance));if(url.includes('fetchInstances'))return {ok:true,json:async()=>[{name:line.instance,ownerJid:line.phone+'@s.whatsapp.net',connectionStatus:'open'}]};const q=JSON.parse(o.body),records=q.where.key.remoteJidAlt&&line===c.lines[0]?[{key:{id:'STAFFALTERNATE',remoteJid:'12345678@lid',remoteJidAlt:phone+'@s.whatsapp.net',fromMe:true},messageTimestamp:at,message:{conversation:'Te estoy atendiendo.'}},{key:{id:'ONLYREADSYNC',remoteJid:'12345678@lid',remoteJidAlt:phone+'@s.whatsapp.net',fromMe:true},messageTimestamp:at,message:{protocolMessage:{type:'HISTORY_SYNC_NOTIFICATION'}}}]:[];return {ok:true,json:async()=>({messages:{total:records.length,records}})};});
 const result=await t.currentAttention(phone);assert.equal(result.complete,true);assert.equal(result.checks.length,4);assert.equal(result.sources.length,1);assert.equal(result.sources[0].id,'STAFFALTERNATE');
});

test('a partial or mismatched native attention result cannot authorize a reply',async()=>{
 const c=cfg(),phone='573001112233';
 for(const messages of [{total:101,records:[]},{total:1,records:[{key:{id:'OTHERPHONE',remoteJid:'573009998877@s.whatsapp.net',fromMe:true},messageTimestamp:Math.floor(Date.now()/1000),message:{conversation:'Other person'}}]}]){
  const t=new Transport(c,async(url)=>{const line=c.lines.find(l=>url.includes(l.instance));return {ok:true,json:async()=>url.includes('fetchInstances')?[{name:line.instance,ownerJid:line.phone+'@s.whatsapp.net',connectionStatus:'open'}]:{messages}};});
  await assert.rejects(()=>t.currentAttention(phone),/ATTENTION_(?:COVERAGE_UNVERIFIED|SOURCE_OUTSIDE_SCOPE)/);
 }
});
