import {createHash} from 'node:crypto';
import {normalize,publicTextSafe} from './config.mjs';
import {getTesaConfig} from './tesa-config.mjs';
import {tesaOutboxScopeSafe} from './tesa-operations.mjs';
import {selectBusinessPrice,BUSINESS_PRICE_HASH} from './business-prices.mjs';
import {priceText,selectPrice} from './prices.mjs';

export const MARIA_UNREGISTERED_TESA_GUARD='own-prospective-native-tesa-closed-unregistered-answer-v1';
export const MARIA_UNREGISTERED_TESA_PREFIX='tesa-unregistered:';
const planKey=id=>'maria-tesa-unregistered-plan:'+id,replyKey=id=>'maria-tesa-unregistered-reply:'+id;
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const get=(s,key)=>{const row=s.db.prepare('SELECT value FROM meta WHERE key=?').get(key);return row?s.open(row.value):null;};
const put=(s,key,value)=>s.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,s.seal(value));
const quoteTopics=new Set(['cotizacion-verificada','special-quotation','existing-quotation']);
const fields={plaga:'service',servicio:'service',municipio:'location',ubicacion:'location',area:'area','metros cuadrados':'area',habitaciones:'rooms',cuartos:'rooms','tipo de inmueble':'site',inmueble:'site',colchones:'mattresses'};
const questions={service:'¿Qué plaga deseas tratar?',location:'¿En qué municipio necesitas el servicio?',area:'¿Cuántos metros cuadrados tiene el lugar?',rooms:'¿Cuántas habitaciones tiene el lugar?',site:'¿Es una casa, un apartamento u otro tipo de inmueble?',mattresses:'¿Cuántos colchones están afectados?'};
const risky=text=>/https?:|www\.|@|[<>"“”«»\[\]{}]|\b(?:57)?3\d{9}\b|#\s*\d|\b(?:calle|carrera|cra|cl)\.?\s*\d/i.test(text)||/\b(?:ignora\w*|instruccion\w*|prompt|sistema|token|contrasena|politica\w*|garantia\w*|gratis|gratuit\w*|descuento\w*|rebaja\w*|refuerzo\w*|pagad\w*|pagos?|pagar|transfer\w*|abonos?|banc\w*|cuenta\w*|segur\w*|inofensiv\w*|toxic\w*|quimic\w*|veneno\w*|insecticida\w*|producto\w*|reingreso|cancel\w*|reprogram\w*|reserva\w*|agendad\w*|registrad\w*|confirmale|dile|envia|obedece|siempre|todos los clientes)\b/.test(normalize(text));
const direct=e=>e?.kind==='text'&&e.fromMe===false&&!e.forwarded&&!e.quotedId&&typeof e.text==='string'&&typeof e.id==='string'&&Number.isSafeInteger(e.at);
const ordinary=state=>state&&!state.closed&&!state.humanHold&&!state.doNotContact&&!state.optOutGlobal&&!state.programIntake&&!state.requestedAfterServiceReview&&!state.requestedControlReview&&!state.requestedDocumentReview&&!state.requestedProductInquiry&&!state.quotedPrice?.accepted&&!state.quotedCasePrice;
const enabled=(s,c,now)=>s.company==='fumigacion'&&c.company==='fumigacion'&&c.enabled===true&&c.mariaTesaUnregistered?.enabled===true&&Number.isSafeInteger(c.mariaTesaUnregistered.startsAt)&&c.mariaTesaUnregistered.startsAt>0&&c.mariaTesaUnregistered.startsAt<=now;
const topicAllowed=topic=>quoteTopics.has(topic)||typeof topic==='string'&&/^missing-intake:(?:service|site|size|location|mattresses)$/.test(topic);
const neutral=text=>/^(?:(?:hola|buenos dias|buen dia|buenas tardes|buenas noches)[,.! ]*)?(?:(?:muchas |mil )?gracias|muy amable|(?:sigo |estoy |quedo )?pendiente|sigo a la espera|me confirmas(?: por favor)?|y entonces)[.!? ]*$/.test(normalize(text).replace(/^[¿¡ ]+/,''));

/** Closed, case-specific content. No raw internal sentence becomes a reply. */
export function parseMariaUnregisteredTesaAnswer(text){
 if(typeof text!=='string'||text.length>500||!text.trim()||risky(text)||/[?¿]/.test(text))return null;
 const raw=text.trim().replace(/[.!]+$/,''),missing=normalize(raw).match(/^falta\s*:?\s*(.+)$/);
 if(missing){const field=fields[missing[1].trim()];return field?{kind:'missing-field',field,reply:questions[field]}:null;}
 const match=raw.match(/^valor\s*:?\s*\$?\s*([1-9]\d*|[1-9]\d{0,2}(?:\.\d{3})+)(?:\s*(?:COP|pesos))?\s*[;\n]\s*incluye\s*:?\s*(.+)$/iu);
 if(!match)return null;
 const priceCop=Number(match[1].replace(/\./g,'')),scope=match[2].replace(/\s+/g,' ').trim();
 if(!Number.isSafeInteger(priceCop)||priceCop<1000||priceCop>100000000||scope.length<5||scope.length>180||!publicTextSafe(scope)||/[;\n]|\b\d{7,}\b/.test(scope)||!/^\p{L}[\p{L}\p{N} ,.:()²/-]*$/u.test(scope))return null;
 return {kind:'case-quote',priceCop,scope};
}

function genericOwnScope(scope,slots){
 const service=normalize(slots.service),site=normalize(slots.site),t=normalize(scope);
 const bases=[service,'control de '+service,'tratamiento de '+service,'servicio de control de '+service,'fumigacion para '+service];
 return bases.some(base=>t===base||t===base+' en '+site||t===base+' en el '+site||t===base+' en la '+site);
}
function scopeMatchesCurrent(scope,slots){
 const t=normalize(scope),service=normalize(slots.service);
 if(!service||!t.includes(service))return false;
 const other=['cucarachas','chinches','comejen','roedores','ratas','ratones','pulgas','hormigas'].filter(p=>t.includes(p)&&!service.includes(p));
 return other.length===0;
}
function question(s,id){return s.db.prepare('SELECT q.*,o.state delivery,o.mid,o.created outbox_created,o.body outbox_body,o.native_proof FROM tesa_questions q JOIN tesa_outbox o ON o.id=q.outbox_id WHERE q.id=? AND q.company=?').get(id,'fumigacion');}

/** Called only in the same synchronous path that created this NEW question. */
export function prepareMariaUnregisteredTesaPlan(s,c,request,result,{now=Date.now()}={}){
 if(!enabled(s,c,now)||!result?.created||!result.id||get(s,planKey(result.id)))return {prepared:false};
 const q=question(s,result.id),conv=s.conversation(request?.phone),t=getTesaConfig(c,now);
 if(!q||!t||q.state!=='PENDING'||q.delivery!=='READY'||q.outbox_id!==result.outboxId||!topicAllowed(q.topic)||q.outbox_created<c.mariaTesaUnregistered.startsAt||q.outbox_created>now+1000||now-q.outbox_created>1000||!conv||conv.hold||!ordinary(conv.state)||conv.state.caseId!==request.caseId||q.case_id!==request.caseId||q.customer_phone!==request.phone||q.source_line!==request.line||q.sender_line!==t.senderLine||q.group_jid!==t.groupJid)return {prepared:false};
 const body=s.open(q.body),nativeRow=s.db.prepare('SELECT body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(body.source,request.phone,request.line),native=nativeRow&&s.open(nativeRow.body);
 if(body.source!==request.source||body.caseId!==request.caseId||body.customerPhone!==request.phone||body.sourceLine!==request.line||body.senderLine!==q.sender_line||body.groupJid!==q.group_jid||digest(body.conditions)!==digest(request.conditions)||!direct(native)||native.at<c.mariaTesaUnregistered.startsAt||native.at>now+60000||!tesaOutboxScopeSafe(s,c,{question_id:q.id,source_line:q.source_line,sender_line:q.sender_line,customer_phone:q.customer_phone,case_id:q.case_id,created:q.outbox_created}))return {prepared:false};
 const plan={guard:MARIA_UNREGISTERED_TESA_GUARD,questionId:q.id,caseId:q.case_id,phone:q.customer_phone,line:q.source_line,senderLine:q.sender_line,sourceId:body.source,sourceHash:digest(native),sourceAt:native.at,questionHash:digest(body),conditionsHash:q.conditions_hash,slotsHash:digest(conv.state.slots),createdAt:q.outbox_created,revision:conv.revision,customerAt:conv.at,startsAt:c.mariaTesaUnregistered.startsAt};
 put(s,planKey(q.id),plan);s.audit('MARIA_UNREGISTERED_TESA_PLAN_PREPARED',body.source,{guard:plan.guard,questionId:q.id,caseId:plan.caseId,historicalReplayed:false,businessWritten:false});return {prepared:true,plan};
}

function local(s,c,plan,{now=Date.now(),queued=false}={}){
 if(!enabled(s,c,now)||plan?.guard!==MARIA_UNREGISTERED_TESA_GUARD||plan.startsAt!==c.mariaTesaUnregistered.startsAt||plan.createdAt<plan.startsAt||now-plan.createdAt>1800000)return null;
 const q=question(s,plan.questionId),conv=s.conversation(plan.phone),t=getTesaConfig(c,now);
 if(!q||!conv||conv.hold||conv.state.closed||conv.state.humanHold||conv.state.doNotContact||conv.state.optOutGlobal||conv.state.programIntake||conv.state.requestedAfterServiceReview||conv.state.requestedControlReview||conv.state.requestedDocumentReview||conv.state.requestedProductInquiry||conv.state.caseId!==plan.caseId||q.case_id!==plan.caseId||q.customer_phone!==plan.phone||q.source_line!==plan.line||q.sender_line!==plan.senderLine||q.outbox_created!==plan.createdAt||q.conditions_hash!==plan.conditionsHash||q.state!=='ANSWERED'||q.valid_until<=now||!['DELIVERED','READ'].includes(q.delivery)||!q.mid||!q.native_proof||!t||q.group_jid!==t.groupJid||!topicAllowed(q.topic)||digest(conv.state.slots)!==plan.slotsHash)return null;
 if(!queued&&(conv.state.quotedPrice?.accepted||conv.state.quotedCasePrice||conv.state.pendingTesaQuestionId!==q.id))return null;
 const body=s.open(q.body),answer=s.open(q.answer),proof=s.open(q.native_proof),sourceRow=s.db.prepare('SELECT body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(plan.sourceId,plan.phone,plan.line),source=sourceRow&&s.open(sourceRow.body);
 if(digest(body)!==plan.questionHash||!source||digest(source)!==plan.sourceHash||!direct(source)||body.source!==plan.sourceId||answer.sourceId!==q.source_id||answer.at!==q.answer_at||answer.caseId!==plan.caseId||answer.customerPhone!==plan.phone||answer.groupJid!==q.group_jid||answer.receivingLine!==q.sender_line||answer.questionMid!==q.mid||answer.at<q.outbox_created-1000||now-answer.at>600000||answer.at>now+60000||!proof.nativeVerified||proof.mid!==q.mid||proof.text!==s.open(q.outbox_body)||proof.senderLine!==q.sender_line||proof.groupJid!==q.group_jid||!['DELIVERED','READ'].includes(proof.state)||!t.allowedParticipantPhones.includes(answer.participant?.phone)||!t.verifiedMembership.participantPhones.includes(answer.participant?.phone)||!tesaOutboxScopeSafe(s,c,{question_id:q.id,source_line:q.source_line,sender_line:q.sender_line,customer_phone:q.customer_phone,case_id:q.case_id,created:q.outbox_created}))return null;
 const event=s.db.prepare('SELECT * FROM tesa_events WHERE id=?').get(answer.sourceKey),native=event&&s.open(event.body);
 if(!event||event.state!=='CASE_ANSWER'||event.at!==answer.at||native.id!==answer.sourceId||native.company!=='fumigacion'||native.groupJid!==q.group_jid||native.kind!=='text'||native.forwarded||native.text!==answer.text||native.participantKey!==answer.participant.phone||native.quote?.mid!==q.mid||native.quote?.participantJid!==q.sender_line+'@s.whatsapp.net')return null;
 const delta=conv.revision-plan.revision;if(delta<0||delta>32)return null;
 const later=s.db.prepare('SELECT body,revision,state FROM events WHERE phone=? AND from_me=0 AND revision>? AND revision<=? ORDER BY revision').all(plan.phone,plan.revision,conv.revision);
 if(later.length!==delta||later.some(row=>{const e=s.open(row.body);return ['PENDING','PROCESSING'].includes(row.state)||!direct(e)||e.line!==plan.line||e.at<plan.customerAt||!neutral(e.text);}))return null;
 if(s.db.prepare("SELECT 1 FROM events WHERE phone=? AND state IN ('PENDING','PROCESSING')").get(plan.phone))return null;
 const parsed=parseMariaUnregisteredTesaAnswer(answer.text);if(!parsed||parsed.kind==='case-quote'&&(!quoteTopics.has(q.topic)||!scopeMatchesCurrent(parsed.scope,conv.state.slots))||parsed.kind==='missing-field'&&conv.state.slots?.[parsed.field])return null;
 return {q,conv,answer,parsed,plan};
}

async function verified(s,c,t,plan,verifiers,{queued=false}={}){
 let current=local(s,c,plan,{queued});if(!current)return null;
 if(typeof verifiers?.verifyQuestionDelivery!=='function'||typeof verifiers?.verifyHumanAnswer!=='function'||typeof t?.currentAttention!=='function'||typeof t.currentCustomerActivity!=='function')return null;
 const revision=current.conv.revision,answerHash=digest(current.answer),own=s.db.prepare('SELECT * FROM tesa_outbox WHERE question_id=?').get(plan.questionId);
 if(!await verifiers.verifyQuestionDelivery(s,c,t,own)||!await verifiers.verifyHumanAnswer(c,t,current.q,current.answer))return null;
 const attention=await t.currentAttention(plan.phone);if(!attention?.complete)return null;
 if(attention.sources.some(item=>!s.db.prepare('SELECT 1 FROM outbox WHERE mid=? AND phone=? AND line=?').get(item.id,plan.phone,item.line))){s.audit('MARIA_UNREGISTERED_TESA_NATIVE_ATTENTION_REVIEW',current.answer.sourceId,{questionId:plan.questionId,caseId:plan.caseId,customerReplyQueued:false});return null;}
 const activity=await t.currentCustomerActivity(plan.phone,plan.customerAt);
 if(!activity?.complete||!Array.isArray(activity.sources)||!activity.sources.length||activity.sources.some(item=>{const row=s.db.prepare('SELECT line,at,revision FROM events WHERE id=? AND phone=? AND from_me=0').get(item.id,plan.phone);return !row||row.line!==plan.line||row.at!==item.at||row.revision>revision;}))return null;
 if(!await verifiers.verifyHumanAnswer(c,t,current.q,current.answer))return null;
 current=local(s,c,plan,{queued});return current&&current.conv.revision===revision&&digest(current.answer)===answerHash?current:null;
}

/** Consumes only the new prospective plan; native verification is supplied by transport. */
export async function continueMariaUnregisteredTesaCustomer(s,c,t,accepted,verifiers={}){
 const plan=get(s,planKey(accepted?.questionId));if(!plan)return {prepared:false,queued:false};
 if(accepted.caseId!==plan.caseId||accepted.customerPhone!==plan.phone)return {prepared:true,queued:false,review:true};
 const id=MARIA_UNREGISTERED_TESA_PREFIX+plan.questionId;
 if(s.db.prepare('SELECT 1 FROM outbox WHERE id=?').get(id))return {prepared:true,queued:false,duplicate:true};
 let current;try{current=await verified(s,c,t,plan,verifiers);}catch{s.audit('MARIA_UNREGISTERED_TESA_NATIVE_READ_PENDING',accepted?.id,{questionId:plan.questionId,caseId:plan.caseId,customerReplyQueued:false});return {prepared:true,queued:false,nativeReadPending:true};}
 if(!current||accepted.id!==current.answer.sourceKey)return {prepared:true,queued:false,review:true};
 const {parsed,answer}=current;
 let text,entry=null;
 if(parsed.kind==='missing-field')text=parsed.reply;
 else{
  const own=selectBusinessPrice(current.conv.state.slots).entry,approved=own&&selectPrice(current.conv.state.slots,s.approvedPriceCatalogs(),own.id).entry;
  if(own&&approved?.id===own.id&&approved.priceCop===own.priceCop&&own.priceCop===parsed.priceCop&&own.source.scheduleHash===BUSINESS_PRICE_HASH&&genericOwnScope(parsed.scope,current.conv.state.slots)){entry=own;text=priceText(entry);}
  else text='Para este caso, la cotización es de $'+parsed.priceCop.toLocaleString('es-CO')+' COP e incluye '+parsed.scope+'. ¿Deseas continuar con esta cotización? Esta cotización no confirma una reserva ni un horario.';
 }
 if(!publicTextSafe(text))return {prepared:true,queued:false,review:true};
 return s.tx(()=>{
  const latest=local(s,c,plan);if(!latest||latest.conv.revision!==current.conv.revision||digest(latest.answer)!==digest(answer))return {prepared:true,queued:false,review:true};
  const ref={guard:MARIA_UNREGISTERED_TESA_GUARD,questionId:plan.questionId,plan,sourceId:answer.sourceId,answerHash:digest(answer),text,revision:latest.conv.revision,kind:parsed.kind,ordinaryPrice:Boolean(entry),entryId:entry?.id??null};
  put(s,replyKey(id),ref);const queued=s.queue(id,plan.phone,plan.line,text,false,latest.conv.revision,plan.caseId);
  const next={...latest.conv.state,awaitingHumanReview:false,pendingTesaQuestionId:null,verifiedTesaAnswerSource:answer.sourceId};
  if(entry){s.savePriceReplyReference(id,{entryId:entry.id,priceCop:entry.priceCop,context:{...next.slots},finalText:text});next.quotedPrice={entryId:entry.id,priceCop:entry.priceCop,sourceId:plan.sourceId,replyId:id,accepted:false};}
  else if(parsed.kind==='case-quote')next.quotedCasePrice={guard:MARIA_UNREGISTERED_TESA_GUARD,caseId:plan.caseId,phone:plan.phone,line:plan.line,questionId:plan.questionId,sourceId:answer.sourceId,questionSourceId:plan.sourceId,replyId:id,priceCop:parsed.priceCop,scope:parsed.scope,accepted:false,ordinaryRegistrationEligible:false};
  else next.pendingTesaCustomerField={guard:MARIA_UNREGISTERED_TESA_GUARD,field:parsed.field,questionId:plan.questionId,sourceId:answer.sourceId,replyId:id};
  s.saveConversation(plan.phone,next);s.audit('MARIA_UNREGISTERED_TESA_CUSTOMER_REPLY_PREPARED',answer.sourceId,{guard:MARIA_UNREGISTERED_TESA_GUARD,questionId:plan.questionId,caseId:plan.caseId,kind:parsed.kind,ownApprovedPrice:Boolean(entry),casePriceOnly:parsed.kind==='case-quote'&&!entry,customerReplyQueued:queued,businessWritten:false,humanHoldReleased:false,policyChanged:false});
  return {prepared:true,queued,id,kind:parsed.kind,ordinaryPrice:Boolean(entry)};
 });
}

/** A new edit, customer fact or takeover also stops an already queued reply. */
export async function mariaUnregisteredTesaReplyStillValid(s,c,t,outbox,verifiers={}){
 if(!outbox?.id?.startsWith(MARIA_UNREGISTERED_TESA_PREFIX))return true;
 const ref=get(s,replyKey(outbox.id));if(ref?.guard!==MARIA_UNREGISTERED_TESA_GUARD||ref.text!==s.open(outbox.body)||ref.revision!==outbox.revision||outbox.phone!==ref.plan?.phone||outbox.line!==ref.plan.line||outbox.case_id!==ref.plan.caseId)return false;
 const current=await verified(s,c,t,ref.plan,verifiers,{queued:true});
 return Boolean(current&&current.conv.revision===outbox.revision&&current.conv.state.verifiedTesaAnswerSource===ref.sourceId&&!current.conv.state.awaitingHumanReview&&digest(current.answer)===ref.answerHash&&(!ref.ordinaryPrice||s.priceReplyStillValid(outbox)));
}

const caseYes=text=>/^(?:si|confirmo|si confirmo|acepto|si acepto|de acuerdo|correcto|todo correcto|esta bien|perfecto)(?: gracias| por favor)?$/.test(normalize(text).replace(/[.!¡,;]+/g,' ').replace(/\s+/g,' ').trim());
const caseNo=text=>/^(?:no|no gracias|no acepto|no quiero|no me interesa|no deseo continuar)[.! ]*$/.test(normalize(text));

/** A special case price can be accepted commercially, never auto-registered. */
export function mariaCaseQuoteCustomerTurn(s,c,state,event){
 const quote=state?.quotedCasePrice,conv=event?.phone&&s.conversation(event.phone),now=Date.now();
 if(!enabled(s,c,now)||quote?.guard!==MARIA_UNREGISTERED_TESA_GUARD||quote.ordinaryRegistrationEligible!==false||!conv||conv.hold||conv.state.caseId!==state.caseId||digest(conv.state.quotedCasePrice??null)!==digest(quote)||state.humanHold||state.closed||state.doNotContact||state.optOutGlobal||state.programIntake||state.requestedAfterServiceReview||state.requestedControlReview||state.requestedDocumentReview||state.requestedProductInquiry||state.caseId!==quote.caseId||event.phone!==quote.phone||event.line!==quote.line||event.kind!=='text'||event.fromMe!==false||event.forwarded||typeof event.text!=='string'||!Number.isSafeInteger(event.at)||event.at>now+60000)return null;
 const ref=get(s,replyKey(quote.replyId)),plan=ref?.plan,q=plan&&question(s,plan.questionId);
 if(ref?.guard!==MARIA_UNREGISTERED_TESA_GUARD||ref.ordinaryPrice!==false||ref.kind!=='case-quote'||ref.sourceId!==quote.sourceId||quote.questionId!==plan?.questionId||quote.questionSourceId!==plan.sourceId||quote.replyId!==MARIA_UNREGISTERED_TESA_PREFIX+plan.questionId||quote.caseId!==plan.caseId||quote.phone!==plan.phone||quote.line!==plan.line||plan.startsAt!==c.mariaTesaUnregistered.startsAt||digest(state.slots)!==plan.slotsHash||!q||q.state!=='ANSWERED'||q.valid_until<=now||q.case_id!==plan.caseId||q.customer_phone!==plan.phone||q.source_line!==plan.line||q.sender_line!==plan.senderLine||q.conditions_hash!==plan.conditionsHash||digest(s.open(q.body))!==plan.questionHash)return null;
 const original=s.db.prepare('SELECT body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(plan.sourceId,plan.phone,plan.line);
 if(!original||digest(s.open(original.body))!==plan.sourceHash)return null;
 const answer=s.open(q.answer),parsed=parseMariaUnregisteredTesaAnswer(answer.text),nativeAnswer=s.db.prepare('SELECT state,body,at FROM tesa_events WHERE id=?').get(answer.sourceKey),nativeHuman=nativeAnswer&&s.open(nativeAnswer.body),tesa=getTesaConfig(c,now),questionDelivery=q.native_proof&&s.open(q.native_proof);
 if(!tesa||!['DELIVERED','READ'].includes(q.delivery)||!q.mid||!questionDelivery?.nativeVerified||questionDelivery.mid!==q.mid||questionDelivery.text!==s.open(q.outbox_body)||questionDelivery.senderLine!==plan.senderLine||questionDelivery.groupJid!==q.group_jid||!['DELIVERED','READ'].includes(questionDelivery.state)||answer.sourceId!==quote.sourceId||answer.sourceId!==q.source_id||answer.at!==q.answer_at||answer.caseId!==plan.caseId||answer.customerPhone!==plan.phone||answer.receivingLine!==plan.senderLine||answer.questionMid!==q.mid||answer.groupJid!==q.group_jid||!tesa.allowedParticipantPhones.includes(answer.participant?.phone)||!tesa.verifiedMembership.participantPhones.includes(answer.participant?.phone)||digest(answer)!==ref.answerHash||parsed?.kind!=='case-quote'||parsed.priceCop!==quote.priceCop||parsed.scope!==quote.scope||nativeAnswer?.state!=='CASE_ANSWER'||nativeAnswer.at!==answer.at||nativeHuman?.text!==answer.text||nativeHuman.id!==answer.sourceId||nativeHuman.company!=='fumigacion'||nativeHuman.groupJid!==q.group_jid||nativeHuman.kind!=='text'||nativeHuman.fromMe||nativeHuman.forwarded||nativeHuman.participantKey!==answer.participant.phone||nativeHuman.quote?.mid!==q.mid||nativeHuman.quote?.participantJid!==q.sender_line+'@s.whatsapp.net')return null;
 const out=s.db.prepare("SELECT * FROM outbox WHERE id=? AND phone=? AND line=? AND case_id=? AND internal=0 AND state IN ('DELIVERED','READ') AND mid IS NOT NULL").get(quote.replyId,event.phone,event.line,state.caseId),delivery=out&&get(s,'first-delivery:'+out.id);
 const row=s.db.prepare('SELECT body,revision FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(event.id,event.phone,event.line),native=row&&s.open(row.body);
 if(!out||s.open(out.body)!==ref.text||!delivery||delivery.mid!==out.mid||delivery.line!==event.line||!['DELIVERED','READ'].includes(delivery.state)||!Number.isFinite(delivery.verifiedAt)||event.at<Math.floor(delivery.verifiedAt/1000)*1000||!native||row.revision!==conv.revision||native.text!==event.text||native.at!==event.at||native.kind!==event.kind||native.forwarded||native.fromMe!==false||(native.quotedId??null)!==(event.quotedId??null)||event.quotedId&&event.quotedId!==out.mid)return null;
 const history=s.db.prepare('SELECT body,revision FROM events WHERE phone=? AND from_me=0 AND revision>? AND revision<=? ORDER BY revision').all(event.phone,out.revision,conv.revision),events=history.map(r=>s.open(r.body));
 if(!events.length||events.length>32||events.at(-1)?.id!==event.id||events.some(e=>e.line!==event.line||e.forwarded||e.kind!=='text'||e.quotedId&&e.quotedId!==out.mid||e.at<Math.floor(delivery.verifiedAt/1000)*1000))return null;
 const priorKnown=new Set([...(quote.acceptanceSources||[]),...(quote.followupSources||[]),...(quote.declineSources||[])].map(source=>source.id));
 if(events.slice(0,-1).some(e=>!priorKnown.has(e.id)&&!neutral(e.text)))return null;
 const source={id:event.id,text:event.text,at:event.at,phone:event.phone,line:event.line,fromMe:false,forwarded:false,...(event.quotedId?{quotedId:event.quotedId}:{})};
 const next={...state,quotedCasePrice:{...quote},lastText:event.text,lastHandledSourceId:event.id},qNext=next.quotedCasePrice;
 const remember=key=>{qNext[key]=[...(qNext[key]||[]).filter(s=>s.id!==event.id),source].slice(-32);};
 if(caseNo(event.text)){
  remember('declineSources');qNext.accepted=false;qNext.declined=true;qNext.status='DECLINED';
  return {state:next,reply:'Entendido. No continuaré con esta cotización. No he creado una orden ni confirmado un horario.'};
 }
 if(qNext.declined&&(caseYes(event.text)||neutral(event.text))){remember('followupSources');return {state:next,reply:'Esa cotización quedó rechazada. Para continuar necesitamos revisar una nueva propuesta.'};}
 if(caseYes(event.text)){
  remember('acceptanceSources');qNext.accepted=true;qNext.status='REGISTRATION_REVIEW';qNext.acceptanceSourceId||=event.id;qNext.acceptedAt??=event.at;next.awaitingHumanReview=true;
  const amount=quote.priceCop.toLocaleString('es-CO');
  const result={state:next,reply:'Recibí tu aceptación de la cotización de $'+amount+' COP. Falta validar el registro del servicio; aún no he creado la orden ni confirmado un horario.'};
  if(!quote.accepted)Object.assign(result,{reviewTopic:'case-quotation-registration',reviewConditions:{kind:'accepted-case-only-quotation',caseId:quote.caseId,quoteQuestionId:quote.questionId,quoteSourceId:quote.sourceId,priceCop:quote.priceCop,scopeHash:digest(quote.scope),acceptanceSourceId:qNext.acceptanceSourceId},reviewSource:event.id,
   review:'El cliente aceptó la cotización específica de este caso por $'+amount+' COP. Incluye: '+quote.scope+'. El precio no corresponde al contrato de registro automático. No he creado una orden ni reservado horario.',reviewQuestion:'¿Cómo debemos registrar esta cotización aceptada y quién hará el registro conservando este valor y alcance?'});
  return result;
 }
 if(quote.accepted&&(neutral(event.text)||/^(?:nombre|direcci[oó]n|tel[eé]fono|correo)\s*:/imu.test(event.text))){
  remember('followupSources');return {state:next,reply:(neutral(event.text)?'Tu cotización aceptada':'Recibí los datos que enviaste. La cotización aceptada')+' sigue pendiente de validación para registrar el servicio. Aún no he creado la orden ni confirmado un horario.'};
 }
 return null;
}
