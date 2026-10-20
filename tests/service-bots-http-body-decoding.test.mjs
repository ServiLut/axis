import {test} from 'node:test';
import assert from 'node:assert/strict';
import {request as httpRequest} from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {BUSINESSES,configFromEnv} from '../automation/service-bots/config.mjs';
import {createBotServer} from '../automation/service-bots/server.mjs';
import {intakeAudit,intakeJournalStatus} from '../automation/service-bots/intake-journal.mjs';
const admin='a'.repeat(43),webhook='w'.repeat(43);
async function fixture(company,run){
 const lines=BUSINESSES[company].phones.map((phone,i)=>({phone,instance:company+'-'+i,apiKey:String(i).repeat(32)}));
 const c=configFromEnv({BOT_COMPANY:company,BOT_LINES_JSON:JSON.stringify(lines),BOT_AUTH_TOKEN_HASH:createHash('sha256').update(admin).digest('hex'),BOT_WEBHOOK_TOKEN_HASH:createHash('sha256').update(webhook).digest('hex'),BOT_DATA_KEY:'b'.repeat(64),BOT_DATABASE_PATH:'/data/'+company+'/bot.sqlite',BOT_EVOLUTION_URL:'https://fake.invalid',BOT_ENABLED:'false',BOT_CHIEF_ONLY:'true',BOT_ACTIVATED_AT:new Date(Date.now()-3600000).toISOString()});
 const s=new Store(':memory:',c.company,randomBytes(32));
 const verify=async phone=>{const line=c.lines.find(l=>l.phone===phone);return {phone,instance:line.instance,ownerVerified:true,open:true};};
 const server=createBotServer(c,s,{verifyLine:verify,verifyLineBinding:verify},{});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const post=(path,body,auth=webhook)=>fetch(base+path,{method:'POST',headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:typeof body==='string'?body:JSON.stringify(body)});
 try{await run({s,c,server,base,post});}finally{await new Promise(r=>server.close(r));s.close();}
}
async function splitPost(server,url,body,split,auth){
 const bytes=Buffer.from(JSON.stringify(body),'utf8');
 let firstChunk;const firstObserved=new Promise(r=>{firstChunk=r;});
 const observer=req=>req.once('data',()=>firstChunk());server.once('request',observer);
 return new Promise((resolve,reject)=>{
  const req=httpRequest(url,{method:'POST',headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json','Content-Length':String(bytes.length),Connection:'close'}},res=>{
   const chunks=[];res.on('data',b=>chunks.push(b));res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks).toString('utf8'))}));
  });req.on('error',reject);req.write(bytes.subarray(0,split));
  firstObserved.then(()=>req.end(bytes.subarray(split))).catch(reject);
 });
}
test('fragmented UTF-8 keeps the exact chief report and hash without replacement characters',()=>fixture('fumigacion',async({s,c,server,base})=>{
 const text='Doña Sandra: José pidió revisión en Itagüí; habitación y colchón.',body={key:'utf8-synthetic-report-01',sourceHash:'a'.repeat(64),line:c.lines[0].phone,text};
 const bytes=Buffer.from(JSON.stringify(body)),split=bytes.indexOf(Buffer.from('ñ'))+1;
 const result=await splitPost(server,base+'/notify-chief-report',body,split,admin);assert.equal(result.status,200);
 const row=s.db.prepare('SELECT * FROM outbox WHERE id=?').get(result.body.id);
 assert.equal(s.open(row.body),text);assert.equal(createHash('sha256').update(s.open(row.body)).digest('hex'),createHash('sha256').update(text).digest('hex'));assert.ok(!s.open(row.body).includes('\uFFFD'));
}));
test('fragmented UTF-8 preserves native literal source before owner checks and decoding',()=>fixture('fumigacion',async({s,c,server,base})=>{
 const text='Necesito atención en Itagüí para un colchón.',body={instance:c.lines[0].instance,event:'messages.upsert',data:{key:{id:'SYNTHETIC_UTF8_NATIVE_01',remoteJid:'573001112233@s.whatsapp.net',fromMe:false},messageTimestamp:Math.floor(Date.now()/1000),message:{conversation:text}}};
 const bytes=Buffer.from(JSON.stringify(body)),split=bytes.indexOf(Buffer.from('ü'))+1;
 const result=await splitPost(server,base+'/webhook',body,split,webhook);assert.equal(result.status,202);
 const day=new Date(Date.now()-5*3600000).toISOString().slice(0,10),a=intakeAudit(s,c,{company:c.company,day});assert.equal(a.sources[0].literalText,text);assert.ok(!a.sources[0].literalText.includes('\uFFFD'));
 assert.equal(s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
}));
test('Fumigacion admits a bounded valid provider envelope larger than twenty kilobytes',()=>fixture('fumigacion',async({s,c,post})=>{
 const body={instance:c.lines[0].instance,event:'messages.upsert',providerMetadata:'x'.repeat(64000),data:{key:{id:'SYNTHETIC_LARGE_NATIVE_01',remoteJid:'573001112233@s.whatsapp.net',fromMe:false},messageTimestamp:Math.floor(Date.now()/1000),message:{conversation:'Hola, necesito cotizar un servicio.'}}};
 const result=await post('/webhook',body);assert.equal(result.status,202);assert.equal(intakeJournalStatus(s,c).originals,1);assert.equal(s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
}));
test('webhook byte cap, administrative cap, authentication and own instance remain mandatory',()=>fixture('fumigacion',async({s,c,post})=>{
 assert.equal((await post('/webhook','{}','bad-auth')).status,401);assert.equal(intakeJournalStatus(s,c).entries,0);
 assert.equal((await post('/webhook','x'.repeat(2*1024*1024+1))).status,413);assert.equal(intakeJournalStatus(s,c).originals,0);
 assert.equal((await post('/status','x'.repeat(20001),admin)).status,413);
 assert.equal((await post('/webhook',{instance:'foreign-instance',event:'messages.upsert',providerMetadata:'x'.repeat(64000),data:{}})).status,400);assert.equal(intakeJournalStatus(s,c).originals,0);
}));
test('status and newsletter callbacks receive a fast acknowledgement without creating customer work',()=>fixture('fumigacion',async({s,c,post})=>{
 for(const [id,remoteJid] of [['STATUS_CALLBACK_01','status@broadcast'],['NEWSLETTER_CALLBACK_01','120363001@newsletter']]){
  const body={instance:c.lines[0].instance,event:'MESSAGES_UPSERT',data:{key:{id,remoteJid,fromMe:false},messageTimestamp:Math.floor(Date.now()/1000),message:{conversation:'Provider metadata'}}};
  const response=await post('/webhook',body);assert.equal(response.status,202);const result=await response.json();assert.equal(result.accepted,0);assert.equal(result.duplicates,0);
 }
 assert.equal(intakeJournalStatus(s,c).originals,0);assert.equal(s.db.prepare('SELECT COUNT(*) n FROM events').get().n,0);assert.equal(s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
}));
test('Servicio Tecnico keeps its existing provider envelope byte limit',()=>fixture('servicio-tecnico',async({s,c,post})=>{
 assert.equal((await post('/webhook','x'.repeat(20001))).status,413);assert.equal(intakeJournalStatus(s,c).originals,0);
}));
