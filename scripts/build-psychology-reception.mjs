import fs from 'node:fs';
// Values are credential references, never credential secrets.
const header=process.env.PSYCHOLOGY_N8N_HEADER_ID||'REPLACE_WEBHOOK_CREDENTIAL_ID';
const axis=process.env.PSYCHOLOGY_N8N_AXIS_ID||'REPLACE_AXIS_CREDENTIAL_ID';
export const sanitizeCode=String.raw`
const b=$json.body;
const ignore=()=>[{json:{action:'ignore'}}];
if(!b||b.instance!=='psicologos-en-colombia'||b.event!=='messages.upsert')return ignore();
const owner=String(b.sender||'').split('@')[0].split(':')[0];
if(owner!=='573016818845')return ignore();
const d=b.data, k=d?.key;
if(!k||typeof k.id!=='string'||typeof k.fromMe!=='boolean')return ignore();
if(String(k.remoteJid).endsWith('@g.us')||k.remoteJid==='status@broadcast')return ignore();
const jid=[k.remoteJid,k.remoteJidAlt].find(x=>typeof x==='string'&&/^[1-9]\d{7,14}@s\.whatsapp\.net$/.test(x));
if(!jid)return ignore();
const phone=jid.split('@')[0];
const m=d.message||{};
if(m.protocolMessage||m.reactionMessage||m.senderKeyDistributionMessage)return ignore();
const text=m.conversation??m.extendedTextMessage?.text??m.imageMessage?.caption??m.documentMessage?.caption??'';
if(typeof text!=='string')return ignore();
let seconds=Number(d.messageTimestamp?.low??d.messageTimestamp);
if(!Number.isFinite(seconds)||seconds<0||seconds>100000000000)return ignore();
const kind=m.audioMessage?'audio':(m.conversation!==undefined||m.extendedTextMessage?'text':'attachment');
// Preserve only the quoted plain text as untrusted context, never credentials or media.
const q=(m.extendedTextMessage||m.imageMessage||m.documentMessage||m.audioMessage)?.contextInfo?.quotedMessage??d.contextInfo?.quotedMessage;
const quoted=q?.conversation??q?.extendedTextMessage?.text??q?.imageMessage?.caption??q?.documentMessage?.caption;
const quotedText=typeof quoted==='string'?quoted.slice(0,1800):'';
return [{json:{action:'event',instance:b.instance,owner,event:{id:k.id,phone,fromMe:k.fromMe,at:new Date(seconds*1000).toISOString(),kind,text:text.slice(0,8000),...(quotedText?{quotedText}:{})}}}];
`;
const cred={httpHeaderAuth:{id:axis,name:'Axis Psicólogos - recepción'}};
const http=(name,position,body)=>({id:name,name,type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position,credentials:cred,
  parameters:{method:'POST',url:'https://www.servilutioncrm.com/api/integrations/psicologos/automation',authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',sendBody:true,specifyBody:'json',jsonBody:body,options:{timeout:150000}}});
const workflow={name:'Psicólogos | Recepción WhatsApp y Axis',nodes:[
  {id:'92a0bdd6-41c2-483c-994a-7500f392aa53',name:'Webhook',type:'n8n-nodes-base.webhook',typeVersion:2.1,position:[0,0],webhookId:'a696c285-ef54-48fa-9fd6-523b1d85e54d',credentials:{httpHeaderAuth:{id:header,name:'Psicólogos - recepción Evolution'}},parameters:{httpMethod:'POST',path:'a696c285-ef54-48fa-9fd6-523b1d85e54d',authentication:'headerAuth',responseMode:'responseNode',options:{}}},
  {id:'sanitize',name:'Validar y minimizar',type:'n8n-nodes-base.code',typeVersion:2,position:[240,0],parameters:{jsCode:sanitizeCode}},
  http('Guardar en Axis',[480,0],'={{ JSON.stringify($json) }}'),
  {id:'ack',name:'Confirmar recepción',type:'n8n-nodes-base.respondToWebhook',typeVersion:1.4,position:[720,0],parameters:{respondWith:'json',responseBody:'={{ JSON.stringify($json) }}',options:{responseCode:202}}},
  http('Procesar pendientes',[960,0],'{"action":"drain"}'),
  {id:'schedule',name:'Recuperar pendientes',type:'n8n-nodes-base.scheduleTrigger',typeVersion:1.2,position:[720,240],parameters:{rule:{interval:[{field:'minutes',minutesInterval:1}]}}},
],connections:{Webhook:{main:[[{node:'Validar y minimizar',type:'main',index:0}]]},'Validar y minimizar':{main:[[{node:'Guardar en Axis',type:'main',index:0}]]},'Guardar en Axis':{main:[[{node:'Confirmar recepción',type:'main',index:0}]]},'Confirmar recepción':{main:[[{node:'Procesar pendientes',type:'main',index:0}]]},'Recuperar pendientes':{main:[[{node:'Procesar pendientes',type:'main',index:0}]]}},settings:{executionOrder:'v1',timezone:'America/Bogota',saveDataErrorExecution:'none',saveDataSuccessExecution:'none',saveManualExecutions:false,saveExecutionProgress:false,executionTimeout:180}};
if(process.argv[1]?.endsWith('build-psychology-reception.mjs')){
 fs.writeFileSync('automation/n8n/psicologos-recepcion.json',JSON.stringify(workflow,null,2)+'\n');
 console.log('Workflow generado sin secretos.');
}
export default workflow;
