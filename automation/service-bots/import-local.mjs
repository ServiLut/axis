import { readFileSync,writeFileSync,mkdirSync,existsSync } from 'node:fs';
import { randomBytes,createHash } from 'node:crypto';
import { resolve,join } from 'node:path';
import { Store } from './store.mjs';
import { BUSINESSES } from './config.mjs';

const [sourceRoot,outputRoot]=process.argv.slice(2);
if(!sourceRoot||!outputRoot)throw new Error('SOURCE_AND_PRIVATE_OUTPUT_REQUIRED');
const names={'fumigacion':'MARIA_ANGEL','servicio-tecnico':'MIGUEL_ANGEL'};
const result=[];
for(const [company,prefix] of Object.entries(names)) {
  const target=resolve(outputRoot,company);mkdirSync(target,{recursive:true,mode:0o700});
  const keyPath=join(target,'data-key.private');
  if(!existsSync(keyPath))writeFileSync(keyPath,randomBytes(32).toString('hex'),{flag:'wx',mode:0o600});
  const key=Buffer.from(readFileSync(keyPath,'utf8').trim(),'hex');
  const file=join(sourceRoot,prefix+'_CONOCIMIENTO.json'),raw=readFileSync(file,'utf8').replace(/^\uFEFF/,'');
  const k=JSON.parse(raw),expected=BUSINESSES[company].name;
  if(k.company!==expected)throw new Error('LOCAL_KNOWLEDGE_SCOPE');
  const source='sha256:'+createHash('sha256').update(raw).digest('hex');
  const store=new Store(join(target,'bot.sqlite'),company,key);
  try {
    const observations=store.importKnowledge({company,kind:'historical_observations',source,at:k.updatedAt,entries:k.observations,limits:k.exceptions});
    const instructions=store.importKnowledge({company,kind:'instructions',source,at:k.updatedAt,entries:k.directUserInstructions.filter(e=>!e.rule.startsWith('Solo leer y recopilar')),superseded:'Reading-only phase superseded by direct user instruction 2026-10-02; past evidence remains read only.'});
    store.importKnowledge({company,kind:'instructions',source:'direct-user-chat-20261002-create-bots-and-correct-verified-faults',at:'2026-10-02',entries:[{rule:'Create María Ángel/Miguel Ángel, supervise and correct verified faults without waiting for staff. Missing real price, availability, payment receipt or service result must remain pending.'}]});
    store.importKnowledge({company,kind:'reference',source,at:k.updatedAt,entries:[k.referenceManual],limits:'Reference metadata; original manual is not imported or claimed newly read. Historical tariffs and safety claims are not institutional policy.'});
    const qa=JSON.parse(readFileSync(join(sourceRoot,prefix+'_PREGUNTAS_RESPUESTAS.json'),'utf8').replace(/^\uFEFF/,''));
    const pending=store.importPendingQuestions({company,source:'local:'+prefix+'_PREGUNTAS_RESPUESTAS.json',entries:qa.entries.filter(e=>e.answer.status==='PENDIENTE_DE_RESPUESTA_VERIFICADA').map(e=>({id:e.key,caseId:e.application.caseId,topic:e.questionSummary,recipient:e.recipient.phone.replace(/\D/g,''),askedAt:e.askedAt,delivery:e.deliveryStatus,answered:false}))});
    result.push({company,observations:observations.count,instructions:instructions.count,pending:pending.imported,enabled:false,serverDeployed:false,sourceHash:source});
  } finally {store.close();}
}
writeFileSync(join(outputRoot,'import-result.json'),JSON.stringify({at:new Date().toISOString(),companies:result,personalOrSecretValuesPrinted:false},null,2),{mode:0o600});
console.log(JSON.stringify(result));
