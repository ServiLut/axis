import {createHash} from 'node:crypto';
import {normalize} from './config.mjs';
import {ownDeliveredQuoteEntry} from './maria-program.mjs';
import {officeReceptionDeclineText} from './office-reception-snippets.mjs';

export const COMMERCIAL_OBJECTION_GUARD='own-prospective-refusal-optout-and-delivered-price-objection-v1';
const hash=value=>createHash('sha256').update(value).digest('hex');
const sourceHash=e=>hash(JSON.stringify([e.id,e.phone,e.line,e.at,e.kind,e.fromMe,Boolean(e.forwarded),e.quotedId??null,e.text]));
const optoutKey=e=>'commercial-optout:fumigacion:'+hash(e.phone+':'+e.line);
const relayed=/["'“”«»<>]|https?:|www\.|\b(?:dijo|dice|dicen|dijeron|segun|comento|pregunto|preguntan|mi (?:vecin[oa]|mama|papa|espos[oa]|amig[oa]|cliente)|un tercero|otra persona|(?:otro|un|el) cliente|otra empresa|otro proveedor|la competencia|(?:le|les) (?:parece|resulta|sale))\b/i;

function directText(e){return e?.kind==='text'&&e.fromMe===false&&!e.forwarded&&!e.quotedId&&typeof e.text==='string'&&e.text.length<=1200&&!relayed.test(normalize(e.text));}
export function literalCommercialRefusal(e){
 if(!directText(e))return null;
 const t=normalize(e.text).replace(/\s+/g,' ').trim();
 const optout=/\b(?:no (?:me )?(?:(?:vuelvan|vuelva|vuelvas) a )?(?:escriban|escriba|escribas|escribir|contacten|contacte|contactes|contactar|llamen|llame|llames|llamar)(?: (?:mas|nuevamente))?|(?:dejen|deja|deje) de (?:escribirme|contactarme|llamarme)|no quiero (?:que me (?:escriban|contacten|llamen)|recibir (?:mas )?(?:mensajes|llamadas)))\b/.test(t);
 const refused=/\b(?:no (?:quiero|deseo|necesito|me interesa) (?:(?:tomar|contratar) )?(?:(?:el|este|ese|un) )?servicio|no (?:quiero|deseo) (?:continuar|seguir)(?: con (?:la |esta |esa |el |este |ese )?(?:cotizacion|solicitud|servicio))?|no voy a (?:continuar|contratar)|prefiero no (?:continuar|contratar))\b/.test(t)||/^(?:no[, ]+)?(?:muchas )?gracias[,!. ]*(?:por ahora no|no gracias)?[.! ]*$/.test(t)&&/^no\b/.test(t)||/^(?:no[, ]+)?(?:muchas )?gracias[,!. ]*(?:mejor no|lo dejo asi|prefiero no)[.! ]*$/.test(t);
 if(!optout&&!refused)return null;
 if(!optout&&/\b(?:si|a menos que|en caso de|tal vez|quizas)\b/.test(t))return null;
 return {kind:optout?'no-contact':'service-refusal',optout};
}

export function literalPriceObjection(e){
 if(!directText(e))return null;
 const t=normalize(e.text);
 if(/\b(?:garantia|refuerzo|pague|pago|comprobante|transferencia|intoxic|factura|reclamo|ya fumigaron|ya vinieron)\b/.test(t))return null;
 if(/\bno (?:quiero|necesito|busco|solicito|pido) (?:un )?descuento\b/.test(t)||/(?:^|[.!?;]\s*|\bpero\s+)(?:si[, ]+)?(?:acepto|confirmo|quiero contratar|quiero el servicio)\b/.test(t))return null;
 const discount=/\b(?:descuentos?|rebaja|rebajar|promocion|mas barato|(?:pueden|puedes|podrian|podrias) (?:bajar|mejorar)(?:me)? (?:el )?(?:precio|valor))\b/.test(t);
 const concern=/\b(?:car[oa]|costos[oa]|no me alcanza|no acepto (?:ese|el|este) (?:precio|valor)|fuera de (?:mi )?presupuesto|se sale de (?:mi )?presupuesto)\b/.test(t)||/\b(?:precio|valor|costo|tarifa)\b[^.!?]{0,40}\b(?:alto|elevado)\b/.test(t);
 return discount||concern?{discount,budgetSupplied:/\bpresupuesto\b[^.!?]{0,60}\d|\btengo(?: disponibles?)?\s+\$?\s*\d/.test(t)}:null;
}

function literalBudgetResponse(text){
 const t=normalize(text).replace(/\s+/g,' ').trim();
 const numbers='(?:un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|diecinueve|veinte|veintiuno|veintidos|veintitres|veinticuatro|veinticinco|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|ciento|doscientos|doscientas|trescientos|cuatrocientos|quinientos|seiscientos|setecientos|ochocientos|novecientos)';
 const prefix='(?:(?:mi )?presupuesto(?: es| seria| son| de)?|tengo(?: disponibles?)?|cuento con|dispongo de|puedo pagar|puedo gastar)';
 const numeric='\\$?\\s*\\d+(?:[.,]\\d+)*(?:\\s+(?:mil|millones?))?(?:\\s*(?:pesos|cop))?';
 const words=numbers+'(?:\\s+(?:y\\s+)?'+numbers+'){0,4}\\s+(?:mil(?:\\s+pesos)?|pesos|millones?(?: de pesos)?)';
 // A bare quantity needs a closed monetary clause. In particular "tengo 50
 // cucarachas" is an intake fact, even directly after a budget question.
 const end='(?=\\s*(?:$|[.!?;](?!\\d)|(?:para (?:el servicio|este servicio|fumigar)|disponibles?|en total|de presupuesto|nada mas|por ahora)\\b))';
 return new RegExp('\\b'+prefix+'\\s+(?:de\\s+)?(?:'+numeric+'|'+words+')'+end).test(t);
}

function budgetContinuation(store,state,e){
 const marker=state.commercialPriceObjection;
 if(!directText(e)||marker?.guard!==COMMERCIAL_OBJECTION_GUARD||marker.caseId!==state.caseId||marker.line!==e.line||marker.at>=e.at||marker.at<e.at-86400000)return null;
 const t=normalize(e.text);
 if(/\b(?:garantia|refuerzo|pague|pago|comprobante|transferencia|intoxic|factura|reclamo|ya fumigaron|ya vinieron)\b/.test(t))return null;
 if(!literalBudgetResponse(e.text))return null;
 const row=store.db.prepare('SELECT body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(marker.sourceId,e.phone,e.line),original=row&&store.open(row.body);
 const quote=state.quotedPrice,own=ownDeliveredQuoteEntry(store,state,e.phone,e.line);
 if(!original||original.at!==marker.at||sourceHash(original)!==marker.sourceHash||!literalPriceObjection(original)||!own||original.at<own.row.created||marker.quotationSourceId!==quote?.sourceId||marker.quotationOutboxId!==own.row.id||marker.entryId!==own.entry.id||marker.priceCop!==own.entry.priceCop)return null;
 return {discount:true,budgetSupplied:true,budgetContinuation:true,budgetLiteral:e.text.trim()};
}

function prospectiveSource(store,config,e){
 if(config.company!=='fumigacion'||store.company!=='fumigacion'||!config.enabled||e.fromMe!==false||!Number.isSafeInteger(e.at)||!Number.isSafeInteger(config.activatedAt)||e.at<config.activatedAt||e.at<Date.now()-300000||e.at>Date.now()+60000||!config.lines?.some(line=>line.phone===e.line))return false;
 const row=store.db.prepare('SELECT body,state,received_at FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(e.id,e.phone,e.line);
 if(!row||row.state!=='PENDING'||row.received_at<config.activatedAt||Math.abs(row.received_at-e.at)>300000)return false;
 return sourceHash(store.open(row.body))===sourceHash(e);
}
function validMarker(store,marker,e){
 if(marker?.guard!==COMMERCIAL_OBJECTION_GUARD||marker.phone!==e.phone||marker.line!==e.line||marker.at>e.at||!marker.sourceId)return false;
 const row=store.db.prepare('SELECT body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(marker.sourceId,e.phone,e.line);
 const source=row&&store.open(row.body),literal=source&&literalCommercialRefusal(source);
 return Boolean(source&&literal&&source.at===marker.at&&sourceHash(source)===marker.sourceHash&&literal.kind===marker.kind);
}

/** Only the current native inbound source may create these prospective facts. */
export function ownCommercialCustomerTurn(store,config,state,e,{newCase=false,personalPriority=false}={}){
 if(!prospectiveSource(store,config,e))return null;
 const saved=store.db.prepare('SELECT value FROM meta WHERE key=?').get(optoutKey(e));
 const durable=saved&&store.open(saved.value);
 if(validMarker(store,durable,e)&&durable.kind==='no-contact')return {kind:'optout-preserved',state:{...state,closed:true,doNotContact:true,contactDeclined:true,commercialRefusal:durable},reply:null};

 const refusal=literalCommercialRefusal(e);
 if(refusal){
  const marker={guard:COMMERCIAL_OBJECTION_GUARD,kind:refusal.kind,phone:e.phone,line:e.line,sourceId:e.id,at:e.at,sourceHash:sourceHash(e),caseId:state.caseId||'fumigacion:'+e.id};
  const next={...state,caseId:marker.caseId,closed:true,contactDeclined:true,commercialRefusal:marker,...(refusal.optout?{doNotContact:true}:{})};
  // Preserve a saved order's facts. Closing this conversation does not cancel
  // an order or create authority to alter a business record.
  if(!state.programServiceId&&!state.serviceRegistered){
   if(state.quotedPrice)next.quotedPrice={...state.quotedPrice,accepted:false};
   if(state.programIntake&&state.programIntake.stage!=='registered')next.programIntake={...state.programIntake,stage:'declined',preview:null};
  }
  if(refusal.optout)store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(optoutKey(e),store.seal(marker));
  const decline=officeReceptionDeclineText({state:next,courtesy:true,reply:'Entendido, gracias por avisarme.'});
  return {kind:refusal.kind,state:next,reply:refusal.optout?'Entendido. Respetaremos tu decisión de no recibir más mensajes.':decline};
 }
 if(state.closed&&state.commercialRefusal?.caseId===state.caseId&&validMarker(store,state.commercialRefusal,e)&&!newCase)return {kind:'refusal-preserved',state,reply:null};

 const objection=literalPriceObjection(e)||budgetContinuation(store,state,e),quote=state.quotedPrice;
 if(!objection||newCase||personalPriority||state.closed||state.awaitingHumanReview||state.programIntake||quote?.accepted||!quote||!state.caseId?.startsWith('fumigacion:')||state.requestedAfterServiceReview||state.requestedControlReview||state.requestedDocumentReview||state.requestedProductInquiry||state.pendingFaqQuestion||Object.keys(state).some(key=>key.startsWith('requestedPayment')&&state[key]))return null;
 const own=ownDeliveredQuoteEntry(store,state,e.phone,e.line);
 if(!own||own.row.created<e.at-86400000||own.row.created>e.at||own.entry.id!==quote.entryId||own.entry.priceCop!==quote.priceCop)return null;
 const price='$'+own.entry.priceCop.toLocaleString('es-CO')+' COP';
 const question=objection.budgetSupplied?'¿Qué necesidad del servicio es más importante para ti?':'¿Qué presupuesto tienes previsto para el servicio?';
 const reply=objection.budgetContinuation?'Gracias por contarme tu presupuesto. La cotización para el servicio que necesitas es de '+price+'. Consultaré si hay una opción autorizada para tu caso; todavía no hay un cambio de precio aprobado.':'Entiendo tu preocupación por el precio. El valor de la cotización que te compartí es de '+price+'. '+(objection.discount?'Consultaré si hay una opción autorizada; aún no hay un descuento aprobado. ':'')+question;
 const marker={guard:COMMERCIAL_OBJECTION_GUARD,sourceId:objection.budgetContinuation?state.commercialPriceObjection.sourceId:e.id,sourceHash:objection.budgetContinuation?state.commercialPriceObjection.sourceHash:sourceHash(e),at:objection.budgetContinuation?state.commercialPriceObjection.at:e.at,line:e.line,caseId:state.caseId,quotationSourceId:quote.sourceId,quotationOutboxId:own.row.id,entryId:own.entry.id,priceCop:own.entry.priceCop,discountRequested:objection.discount,...(objection.budgetContinuation?{budgetLiteral:objection.budgetLiteral,budgetSourceId:e.id,budgetSourceAt:e.at,budgetSourceHash:sourceHash(e)}:{})};
 const reference={...store.priceReplyReference(own.row),finalText:reply,referenceKind:'prior-quotation-clarification',quotationOutboxId:own.row.id,...(own.version?{scheduleHash:own.version.scheduleHash,issuedAt:own.version.issuedAt}:{})};
 return {kind:'price-objection',state:{...state,commercialPriceObjection:marker},reply,quotationReference:reference,
  ...(objection.discount?{question:{topic:'commercial-discount-review',conditions:{kind:'customer-discount-request',caseId:state.caseId,quotationOutboxId:own.row.id,entryId:own.entry.id,priceCop:own.entry.priceCop},text:'María Ángel · consulta comercial. El cliente del contacto terminado en '+e.phone.slice(-4)+' solicita '+(objection.budgetContinuation?'una opción para su presupuesto':'un descuento')+' sobre su cotización vigente de '+price+'. Petición literal: '+e.text.slice(0,500)+'. ¿Autorizas alguna opción para esta cotización o debemos mantener el valor indicado?'}}:{})};
}
