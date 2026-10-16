import {createHash} from 'node:crypto';
import {normalize} from './config.mjs';

export const MARIA_LITERAL_RECEPTION_GUARD='own-context-free-literal-greeting-with-native-attention-v1';
export function literalGreetingText(text){return /^[!¡ ]*(?:hola|buenos dias|buen dia|buenas tardes|buenas noches|hola buenos dias|hola buen dia|hola buenas dias|hola buenas tardes|hola buenas noches)[.!¡, ]*$/.test(normalize(text));}
export function literalGreetingEligible(config,event,state={}){
 if(config.company!=='fumigacion'||event.kind!=='text'||event.fromMe||event.forwarded||event.quotedId||!event.id||!Number.isSafeInteger(event.at))return false;
 if(!literalGreetingText(event.text))return false;
 if(Object.values(state.slots||{}).some(Boolean)||state.programIntake||state.quotedPrice||state.pendingFaqQuestion||state.pendingTesaQuestionId||state.awaitingHumanReview||state.requestedAfterServiceReview||state.requestedProductInquiry||state.requestedControlReview)return false;
 return true;
}
export function literalGreetingReplyProof(config,event,state,text){
 if(!literalGreetingEligible(config,event,state)||typeof text!=='string'||text.length>350||/\$|confirmad|reservad|agendad|registrad|garant|producto|pendiente/i.test(text))return null;
 const brief=/^(?:Hola|Buen día|Buenas tardes|Buenas noches)[.!]$/;
 const intake=/^(?:Hola|Buen día|Buenas tardes|Buenas noches), soy María Ángel\. Para cotizarte, cuéntame qué plaga deseas tratar o si buscas prevención; el municipio y barrio o vereda donde necesitas el servicio\.$/;
 const listedIntake=/^(?:Hola|Buen día|Buenas tardes|Buenas noches), soy María Ángel\.\n\nPara cotizarte, cuéntame:\n1\. Qué plaga deseas tratar o si buscas prevención\.\n2\. El municipio y barrio o vereda donde necesitas el servicio\.$/;
 if(!brief.test(text)&&!intake.test(text)&&!listedIntake.test(text))return null;
 return {guard:MARIA_LITERAL_RECEPTION_GUARD,sourceId:event.id,at:event.at,caseId:state.caseId??null,sourceTextHash:createHash('sha256').update(event.text,'utf8').digest('hex'),textHash:createHash('sha256').update(text,'utf8').digest('hex')};
}
export function literalGreetingReplyStillValid(config,store,outbox,text){
 if(config.company!=='fumigacion'||outbox.internal||!outbox.id.endsWith(':reply'))return false;
 const current=store.conversation(outbox.phone),proof=current?.state.literalGreetingReply;
 if(current?.hold||current?.revision!==outbox.revision||proof?.guard!==MARIA_LITERAL_RECEPTION_GUARD||(current.state.caseId??null)!==proof.caseId||outbox.case_id!=null&&outbox.case_id!==proof.caseId||current.state.lastHandledSourceId!==proof.sourceId||outbox.id!==proof.sourceId+':reply'||proof.textHash!==createHash('sha256').update(text,'utf8').digest('hex'))return false;
 const row=store.db.prepare('SELECT body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(proof.sourceId,outbox.phone,outbox.line);
 if(!row)return false;
 const event=store.open(row.body);
 return event.id===proof.sourceId&&event.at===proof.at&&event.phone===outbox.phone&&event.line===outbox.line&&proof.sourceTextHash===createHash('sha256').update(event.text,'utf8').digest('hex')&&Boolean(literalGreetingReplyProof(config,event,current.state,text));
}
