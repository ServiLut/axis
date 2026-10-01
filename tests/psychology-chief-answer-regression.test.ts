import assert from 'node:assert/strict';
import {test} from 'node:test';
import {understandPsychologyMessage,parseUnderstanding,understandingSchema} from '../lib/psychology-ai';
import {semanticReception} from '../lib/psychology-semantic-reception';
import {aiSanitize} from '../scripts/build-psychology-ai.mjs';
const blank=Object.fromEntries(Object.keys(understandingSchema.properties).map(k=>[k,null]));
const u=(patch={})=>parseUnderstanding({...blank,intent:'question',confidence:0.98,explicitConsent:false,additionalServices:[],rentalRequests:[],roomPreferenceChanges:[],...patch});
const q='Sandra, el contacto pide un favor. No tengo una respuesta aprobada para esta solicitud. ¿Qué debemos responderle?';
const e={id:'fixture-chief-answer',phone:'573016803926',kind:'text' as const,fromMe:false,at:'2026-10-01T15:50:27Z',quotedText:q,text:'Lo primero es conocer qué tipo de favor necesita siempre que en mis manos estaré dispuesta a servirte cuéntame qué necesitas y si puedo realizarlo con tanto gusto lo haré'};
const ctx={stage:'HUMAN',chiefDirectedTurn:true,verifiedChiefQuestion:{id:'fixture-request:handoff',content:q},staffObservation:{mode:'observe_without_reply'}};
async function model(outputs:any[],run:(seen:any[])=>Promise<void>){
 const original=globalThis.fetch,url=process.env.PSICOLOGOS_AI_URL,token=process.env.PSICOLOGOS_AI_TOKEN;const seen:any[]=[];
 process.env.PSICOLOGOS_AI_URL='https://abogadosencolombia.app.n8n.cloud/webhook/fixture';process.env.PSICOLOGOS_AI_TOKEN='fixture';
 const validate=new Function('$json',`return (async()=>{${aiSanitize}})()`);
 globalThis.fetch=async(_url,o)=>{const body=JSON.parse(String(o?.body));await validate({body});seen.push(body);return new Response(JSON.stringify({result:outputs[Math.min(seen.length-1,outputs.length-1)]}),{status:200});};
 try{await run(seen);}finally{globalThis.fetch=original;if(url===undefined)delete process.env.PSICOLOGOS_AI_URL;else process.env.PSICOLOGOS_AI_URL=url;if(token===undefined)delete process.env.PSICOLOGOS_AI_TOKEN;else process.env.PSICOLOGOS_AI_TOKEN=token;}
}
test('verified clear answer dropped by model is retried once with the unchanged original source',async()=>{
 await model([u({reply:'Lo primero es conocer qué tipo de favor necesita.'}),u({intent:'admin',adminAction:'learn',instruction:'En este caso, Luisa debe preguntar al contacto qué favor necesita, sin prometer realizarlo.'})],async seen=>{
  const result=await understandPsychologyMessage(e,ctx);assert.equal(result.adminAction,'learn');assert.equal(result.question,null);assert.equal(seen.length,2);assert.equal(seen[0].input,seen[1].input);assert.ok(seen[1].instructions.includes('La salida omitió'));assert.equal(ctx.stage,'HUMAN');
 });
});
test('repeated unresolved interpretation fails internally without fabricating a chief instruction or question',async()=>{
 await model([u({reply:'Lo primero es conocer qué necesita.'})],async seen=>{await assert.rejects(()=>understandPsychologyMessage(e,ctx),/AI_CHIEF_ANSWER_UNRESOLVED/);assert.equal(seen.length,2);});
});
test('actual question, uncertainty and courtesy are not forced into learned instructions',async()=>{
 for(const output of [u({question:'¿La persona ya dijo qué necesita?'}),u({instructionUncertainty:'No explicárselo, que lo entiendan',question:'¿Qué quisiste decir con no explicárselo?'}),u({intent:'courtesy',reply:'Con gusto'})])await model([output],async seen=>{const result=await understandPsychologyMessage(e,ctx);assert.equal(seen.length,1);assert.equal(result.adminAction,null);});
});
test('quote content and chief identity gates remain necessary; observation suppresses output',async()=>{
 for(const [event,context] of [[{...e,phone:'573000000001'},ctx],[{...e,fromMe:true},ctx],[{...e,kind:'audio'},ctx],[e,{...ctx,chiefDirectedTurn:false}]])await model([u({reply:'draft',question:'draft?'})],async seen=>{const result=await understandPsychologyMessage(event as any,context);assert.equal(seen.length,1);assert.equal(result.reply,null);assert.equal(result.question,null);});
 await model([u()],async seen=>{await understandPsychologyMessage({...e,quotedText:'Other question'},ctx);assert.equal(seen.length,1);});
});
test('whole favor opening asks its missing detail without escalating or promising execution',()=>{
 const customer={...e,phone:'573000000001',quotedText:undefined,text:'HOLA ME PUEDES HACER UN FAVOR'};
 const result=semanticReception(customer,'NEW',{},{} as any,'DEPOSIT_20000',u());assert.equal(result.handoff,undefined);assert.equal(result.stage,'NEED');assert.deepEqual(result.messages,['Claro, con mucho gusto. ¿Qué necesitas?']);
 assert.deepEqual(semanticReception(customer,'HUMAN',{},{} as any,'DEPOSIT_20000',u()).messages,[]);
 assert.equal(semanticReception(customer,'NEW',{},{} as any,'DEPOSIT_20000',u({intent:'urgent'})).handoff,'Atención humana urgente');
 for(const text of ['HOLA ME PUEDES HACER UN FAVOR le puedes decir a otra persona que me escriba','necesito un favor con la cita de otra persona'])assert.notDeepEqual(semanticReception({...customer,text},'NEW',{},{} as any,'DEPOSIT_20000',u()).messages,result.messages);
});

