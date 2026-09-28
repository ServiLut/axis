import assert from 'node:assert/strict';
import {test} from 'node:test';
import {sanitizeCode} from '../scripts/build-psychology-reception.mjs';
import {validateReceptionEvent,decideReception} from '../lib/psychology-reception';
import {ensurePsychologyConversation} from '../lib/psychology-chatwoot';

test('a bare unknown phone, without saved name or CRM ID, is accepted and receives the welcome',()=>{
 const now=Date.now();
 for(const key of [{remoteJid:'573009876543@s.whatsapp.net'},{remoteJid:'9123456789@lid',remoteJidAlt:'573009876543@s.whatsapp.net'}]){
  const event=new Function('$json',sanitizeCode)({body:{event:'messages.upsert',instance:'psicologos-en-colombia',sender:'573016818845@s.whatsapp.net',data:{key:{...key,id:'unsaved-new-number',fromMe:false},messageTimestamp:Math.floor(now/1000),message:{conversation:'hola'}}}})[0].json.event;
  assert.equal(event.phone,'573009876543');assert.ok(validateReceptionEvent(event,now,now-60000));
  const result=decideReception(event,'NEW',{},{} as never,'DEPOSIT_20000');assert.equal(result.stage,'NEED');assert.ok(result.messages[0].includes('Luisa Fernanda'));assert.equal(result.handoff,undefined);
 }
});
test('Chatwoot creates a scoped contact and conversation when an unsaved number is absent',async()=>{
 const previousFetch=globalThis.fetch;const previousToken=process.env.PSICOLOGOS_CHATWOOT_TOKEN;const calls:{path:string;method:string;body:any}[]=[];
 process.env.PSICOLOGOS_CHATWOOT_TOKEN='fixture-token';
 globalThis.fetch=async(input,options)=>{
  const url=new URL(String(input));assert.equal(url.origin,'https://chatwoot.servilutioncrm.cloud');assert.ok(url.pathname.startsWith('/api/v1/accounts/2/'));
  const method=options?.method||'GET';const body=options?.body?JSON.parse(String(options.body)):null;calls.push({path:url.pathname,method,body});
  let result;
  if(url.pathname.endsWith('/contacts/search'))result={payload:[]};
  else if(url.pathname.endsWith('/contacts')&&method==='POST'){
   assert.equal(body.phone_number,'+573009876543');assert.equal(body.inbox_id,10);assert.equal(body.name,'WhatsApp 573009876543');
   result={payload:{contact:{id:100,phone_number:body.phone_number,contact_inboxes:[{inbox:{id:10},source_id:'source-test'}]}}};
  }else if(url.pathname.endsWith('/contacts/100/conversations'))result={payload:[]};
  else if(url.pathname.endsWith('/conversations')&&method==='POST'){
   assert.equal(body.contact_id,100);assert.equal(body.inbox_id,10);assert.equal(body.source_id,'source-test');result={id:200,inbox_id:10};
  }else throw Error('Unexpected path');
  return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
 };
 try{assert.deepEqual(await ensurePsychologyConversation('573009876543'),{id:200,contactId:100});assert.equal(calls.filter(c=>c.method==='POST').length,2);assert.ok(calls.every(c=>!c.path.endsWith('/messages')));}
 finally{globalThis.fetch=previousFetch;if(previousToken===undefined)delete process.env.PSICOLOGOS_CHATWOOT_TOKEN;else process.env.PSICOLOGOS_CHATWOOT_TOKEN=previousToken;}
});
