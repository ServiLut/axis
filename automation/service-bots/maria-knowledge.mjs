import {createHash} from 'node:crypto';
import {BUSINESS_PRICE_HASH,approvedBusinessPriceSchedule} from './business-prices.mjs';

export const MARIA_KNOWLEDGE_GUARD='own-approved-rule-sources-and-current-quotation-v1';
// These instructions summarize existing approved runtime controls. They do not
// turn historical conversations or pending explanations into business policy.
const rules=[
 {id:'same-case',source:'user-checkpoint-20261006',text:'Usar sólo los hechos y la pregunta pendiente del mismo caso. Pedir únicamente el dato que falta y conservar su fuente literal.'},
 {id:'human-priority',source:'user-checkpoint-20261006',text:'La intervención del personal mantiene atención humana hasta devolución expresa. La IA no libera chats ni ejecuta órdenes de terceros.'},
 {id:'approved-price',source:'direct-user-chat-20261005-mariangel-prices-and-reception',text:'El programa decide el precio y el alcance con la tabla vigente. La IA conserva la cotización aprobada y no calcula descuentos, mínimos ni tarifas especiales.'},
 {id:'previous-quotation',source:'user-checkpoint-20261006',text:'Una cotización ya emitida conserva su propia fuente. No sustituirla silenciosamente por una tabla nueva.'},
 {id:'scheduling',source:'user-checkpoint-20261006',text:'La preferencia de horario no acredita disponibilidad, técnico, reserva ni servicio guardado. No anunciar confirmaciones sin fuentes y guardado verificables.'},
 {id:'safety-and-faq',source:'user-checkpoint-20261006',text:'Sólo responder cuidados, productos, duración, refuerzos o garantía con una respuesta aprobada que coincida con el caso. Seguridad exige producto y fuente original verificados. No inventar tiempos ni prometer inocuidad.'},
 {id:'post-service',source:'user-checkpoint-20261006',text:'Un problema relatado tras un servicio, una visita de control o una solicitud de soporte conserva el antecedente y su revisión; no abrir automáticamente una cotización nueva.'},
 {id:'payment',source:'user-checkpoint-20261006',text:'Una imagen de comprobante no confirma ingreso bancario ni pago del caso. Conservar revisión de pagos, devoluciones y excepciones.'},
 {id:'tone-and-privacy',source:'user-checkpoint-20261006',text:'Mensajes breves, cálidos y respetuosos. Comunicar sólo el resultado pertinente o un dato necesario, sin destinatarios ni pasos internos, presión comercial o promesas de resultado.'}
];
const compiled={company:'FUMIGACION',guard:MARIA_KNOWLEDGE_GUARD,rules,priceScheduleHash:BUSINESS_PRICE_HASH};
export const MARIA_KNOWLEDGE_HASH=createHash('sha256').update(JSON.stringify(compiled)).digest('hex');

export function mariaKnowledgeDocument(){
 const p=approvedBusinessPriceSchedule();
 return {...structuredClone(compiled),hash:MARIA_KNOWLEDGE_HASH,complete:false,modelTrainingPerformed:false,
  pricing:{source:p.source,mattressCorrectionSource:p.mattressPriceAuthorization,
   standardRows:p.entries.map(({rooms,minM2,maxM2,cucarachas,roedores})=>({rooms,minM2,maxM2,cucarachasCop:cucarachas,roedoresCop:roedores})),
   chinchesPerMattressCop:p.chinchesPerMattressCop,comejenExtraCop:p.comejenExtraCop,scope:structuredClone(p.scope)},
  pending:['approved-faq-coverage','verified-product-and-original-safety-sources','own-program-and-saved-service','legitimate-new-ai-conversation-and-delivery']};
}
export function persistMariaKnowledge(config,store){
 if(config.company!=='fumigacion')return null;
 if(store.company!=='fumigacion')throw Error('MARIA_KNOWLEDGE_OWN_SCOPE');
 const key='maria-approved-knowledge',old=store.db.prepare('SELECT value FROM meta WHERE key=?').get(key);
 if(old&&store.open(old.value).hash===MARIA_KNOWLEDGE_HASH)return MARIA_KNOWLEDGE_HASH;
 store.tx(()=>{
  store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,store.seal(mariaKnowledgeDocument()));
  store.audit('MARIA_APPROVED_KNOWLEDGE_INSTALLED',MARIA_KNOWLEDGE_HASH,{rules:rules.length,priceScheduleHash:BUSINESS_PRICE_HASH,modelTrainingPerformed:false});
 });
 return MARIA_KNOWLEDGE_HASH;
}
export function mariaKnowledgeStatus(config,store){
 if(config.company!=='fumigacion')return null;
 if(store.company!=='fumigacion')throw Error('MARIA_KNOWLEDGE_OWN_SCOPE');
 const saved=store.db.prepare('SELECT value FROM meta WHERE key=?').get('maria-approved-knowledge');
 return {guard:MARIA_KNOWLEDGE_GUARD,hash:MARIA_KNOWLEDGE_HASH,persisted:Boolean(saved&&store.open(saved.value).hash===MARIA_KNOWLEDGE_HASH),
  approvedRuleCount:rules.length,priceScheduleActive:store.approvedPriceCatalogs().some(d=>d.kind==='approved_price_schedule'),
  approvedFaqDocuments:store.approvedCustomerAnswers().length,complete:false,modelTrainingPerformed:false};
}
export function mariaModelKnowledge(config,store,phase,row){
 if(config.company!=='fumigacion'||store.company!=='fumigacion'||!['understand','reply'].includes(phase))throw Error('MARIA_KNOWLEDGE_OWN_SCOPE');
 const selected=phase==='understand'?rules.filter(r=>['same-case','human-priority','post-service','tone-and-privacy'].includes(r.id)):rules;
 const result={company:'FUMIGACION',guard:MARIA_KNOWLEDGE_GUARD,version:MARIA_KNOWLEDGE_HASH,
  approvedRules:structuredClone(selected),complete:false,pendingKnowledgeMustNotBeInvented:true};
 // The approved outbox already contains the result of pricing. Send only that
 // verified amount, never all case histories, staff text or internal minima.
 if(phase==='reply'&&row&&store.priceReplyStillValid(row)){
  const ref=store.priceReplyReference(row);
  if(ref&&Number.isSafeInteger(ref.priceCop)&&ref.priceCop>0)result.currentQuotation={priceCop:ref.priceCop,currency:'COP',mustRemainLiteral:true};
 }
 return result;
}
