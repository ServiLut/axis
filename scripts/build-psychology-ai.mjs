import fs from 'node:fs';
export const aiSanitize=String.raw`
const b=$json.body;
if(!b||!['understand','transcribe'].includes(b.action))throw Error('INVALID_ACTION');
if(b.action==='understand'){
 if(typeof b.instructions!=='string'||b.instructions.length>18000||typeof b.input!=='string'||b.input.length>50000||!b.schema||JSON.stringify(b.schema).length>16000)throw Error('INVALID_TEXT');
 return [{json:{action:b.action,instructions:b.instructions,input:b.input,schema:b.schema}}];
}
if(typeof b.base64!=='string'||b.base64.length<40||b.base64.length>14000000||!(/^[A-Za-z0-9+/=]+$/).test(b.base64)||!['audio/mp4','audio/ogg','audio/mpeg','audio/wav','audio/x-wav','audio/webm'].includes(b.mimeType))throw Error('INVALID_AUDIO');
const names={'audio/mp4':'voice.mp4','audio/ogg':'voice.ogg','audio/mpeg':'voice.mp3','audio/wav':'voice.wav','audio/x-wav':'voice.wav','audio/webm':'voice.webm'};
return [{json:{action:b.action},binary:{data:await this.helpers.prepareBinaryData(Buffer.from(b.base64,'base64'),names[b.mimeType],b.mimeType)}}];
`;
export function buildPsychologyAi(headerId,path){
 const node=(name,type,version,position,parameters,extra={})=>({id:name,name,type,typeVersion:version,position,parameters,...extra});
 const ai={credentials:{openAiApi:{id:null,name:'',__aiGatewayManaged:true}}};
 const response=node('Respuesta','n8n-nodes-base.respondToWebhook',1.4,[1150,0],{respondWith:'json',responseBody:'={{ JSON.stringify($json) }}',options:{}});
 const nodes=[
  node('Entrada privada','n8n-nodes-base.webhook',2.1,[0,0],{httpMethod:'POST',path,authentication:'headerAuth',responseMode:'responseNode',options:{}},{webhookId:path,credentials:{httpHeaderAuth:{id:headerId,name:'Psicólogos - inteligencia privada'}}}),
  node('Validar solicitud','n8n-nodes-base.code',2,[240,0],{jsCode:aiSanitize}),
  node('Tipo de solicitud','n8n-nodes-base.if',2.2,[460,0],{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:2},conditions:[{id:'text',leftValue:'={{ $json.action }}',rightValue:'understand',operator:{type:'string',operation:'equals'}}],combinator:'and'},options:{}}),
  node('Comprender','@n8n/n8n-nodes-langchain.openAi',2.3,[700,-100],{modelId:{__rl:true,value:'gpt-5.4-mini',mode:'id'},responses:{values:[{type:'text',role:'system',content:'={{ $json.instructions + "\\nResponde JSON estricto conforme a este esquema: " + JSON.stringify($json.schema) }}'},{type:'text',role:'user',content:'={{ $json.input }}'}]},builtInTools:{},options:{}},ai),
  node('Transcribir','@n8n/n8n-nodes-langchain.openAi',2.3,[700,140],{resource:'audio',operation:'transcribe',binaryPropertyName:'data',options:{language:'es'}},ai),
  node('Normalizar respuesta','n8n-nodes-base.code',2,[930,0],{jsCode:`if(typeof $json.text==='string')return [{json:{text:$json.text}}]; const text=($json.output||[]).flatMap(o=>o.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join(''); if(!text)throw Error('EMPTY_MODEL_OUTPUT'); return [{json:{result:JSON.parse(text.replace(/^\x60\x60\x60(?:json)?\\s*|\\s*\x60\x60\x60$/g,''))}}];`}),response];
 const edge=n=>[{node:n,type:'main',index:0}];
 return {name:'Psicólogos | Comprensión y audios privados',nodes,connections:{'Entrada privada':{main:[edge('Validar solicitud')]},'Validar solicitud':{main:[edge('Tipo de solicitud')]},'Tipo de solicitud':{main:[edge('Comprender'),edge('Transcribir')]},Comprender:{main:[edge('Normalizar respuesta')]},Transcribir:{main:[edge('Normalizar respuesta')]},'Normalizar respuesta':{main:[edge('Respuesta')]}},settings:{executionOrder:'v1',timezone:'America/Bogota',saveDataErrorExecution:'none',saveDataSuccessExecution:'none',saveManualExecutions:false,saveExecutionProgress:false,executionTimeout:100}};
}
if(process.argv[1]?.endsWith('build-psychology-ai.mjs'))fs.writeFileSync('automation/n8n/psicologos-inteligencia.json',JSON.stringify(buildPsychologyAi('CONFIGURE_PRIVATE_HEADER_CREDENTIAL','CONFIGURE_PRIVATE_PATH'),null,2)+'\n');
