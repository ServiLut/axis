import test from 'node:test';
import assert from 'node:assert/strict';
import {request as httpRequest} from 'node:http';
import {createHash,randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,SANDRA,configFromEnv} from '../automation/service-bots/config.mjs';
import {createBotServer} from '../automation/service-bots/server.mjs';
import {parseChiefCommand,enqueueChiefCommand} from '../automation/service-bots/chief-actions.mjs';

const admin='synthetic_chief_admin_token_not_a_real_secret_001',webhook='synthetic_chief_webhook_not_a_real_secret_00002';
async function fixture(company,fn){
 const lines=BUSINESSES[company].phones.map((phone,i)=>({phone,instance:'chief-http-'+company+'-'+i,apiKey:'synthetic-instance-key-'+i}));
 const c=configFromEnv({BOT_COMPANY:company,BOT_LINES_JSON:JSON.stringify(lines),BOT_AUTH_TOKEN_HASH:createHash('sha256').update(admin).digest('hex'),BOT_WEBHOOK_TOKEN_HASH:createHash('sha256').update(webhook).digest('hex'),BOT_DATA_KEY:'b'.repeat(64),BOT_DATABASE_PATH:'/data/'+company+'/bot.sqlite',BOT_EVOLUTION_URL:'https://synthetic.invalid',BOT_ENABLED:'false',BOT_CHIEF_ONLY:'true',BOT_ACTIVATED_AT:new Date(Date.now()-60000).toISOString()});
 const s=new Store(':memory:',company,randomBytes(32)),engine=new Engine(s,c),server=createBotServer(c,s,{fetcher:()=>{throw Error('EXTERNAL_NETWORK_FORBIDDEN');},send:()=>{throw Error('REAL_SEND_FORBIDDEN');}},engine);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const post=(route,body,token=admin)=>new Promise((resolve,reject)=>{const bytes=Buffer.from(JSON.stringify(body)),req=httpRequest({host:'127.0.0.1',port:server.address().port,path:route,method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','Content-Length':bytes.length}},res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks).toString('utf8'))}));});req.on('error',reject);req.end(bytes);});
 try{await fn({s,c,post});}finally{await new Promise(resolve=>server.close(resolve));s.close();}
}
function seedCommand(s,c,i){const e={id:'CHIEF_HTTP_SYNTHETIC_SOURCE_'+i,phone:SANDRA,line:c.lines[0].phone,at:Date.now()-1000+i,kind:'text',fromMe:false,forwarded:false,text:'María Ángel, dime cuántos chats han entrado hoy de las dos líneas de WhatsApp.',quotedId:null};s.enqueue(e);const plan=parseChiefCommand(e,c);assert.ok(plan);enqueueChiefCommand(s,c,e,plan);s.db.prepare("UPDATE events SET state='DONE' WHERE id=?").run(e.id);}

test('chief command review requires the own admin token and keeps other companies outside the endpoint scope',async()=>{
 await fixture('fumigacion',async({s,c,post})=>{seedCommand(s,c,1);const before=s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n;assert.equal((await post('/review-chief-actions',{},webhook)).status,401);assert.equal((await post('/review-chief-actions',{},'synthetic_foreign_admin_token_not_real_secret')).status,401);assert.equal((await post('/review-chief-actions',{})).status,200);assert.equal(s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,before);});
 await fixture('servicio-tecnico',async({post})=>{assert.equal((await post('/review-chief-actions',{})).status,403);});
});

test('chief command review rejects free fields, fractional cursors and limits outside one to fifty',()=>fixture('fumigacion',async({post})=>{
 for(const body of [{afterRow:-1},{afterRow:0.5},{limit:0},{limit:51},{limit:1.5},{limit:'1'},{afterRow:'0'},{company:'servicio-tecnico'},{sourceId:'FREE_SOURCE'},{token:'FREE_TOKEN'}])assert.equal((await post('/review-chief-actions',body)).status,400,JSON.stringify(body));
}));

test('review pagination is read-only and does not execute a command, alter its state or enqueue a new response',()=>fixture('fumigacion',async({s,c,post})=>{
 for(let i=1;i<=3;i++)seedCommand(s,c,i);
 const before=Object.fromEntries(['chief_commands','outbox','audit'].map(table=>[table,JSON.stringify(s.db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all())]));
 const first=await post('/review-chief-actions',{afterRow:0,limit:1});assert.equal(first.status,200);assert.equal(first.body.readOnly,true);assert.equal(first.body.commands.length,1);assert.ok(first.body.nextRow>0);assert.ok(first.body.remaining>0);
 const second=await post('/review-chief-actions',{afterRow:first.body.nextRow,limit:50});assert.equal(second.status,200);assert.equal(second.body.commands.length,2);assert.equal(second.body.remaining,0);assert.ok(!second.body.commands.some(row=>row.id===first.body.commands[0].id));
 const after=Object.fromEntries(['chief_commands','outbox','audit'].map(table=>[table,JSON.stringify(s.db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all())]));assert.deepEqual(after,before);
 assert.ok(!JSON.stringify(first.body).includes(admin));assert.ok(!JSON.stringify(first.body).includes(webhook));
}));
