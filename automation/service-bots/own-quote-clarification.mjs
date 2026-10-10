import {normalize} from './config.mjs';
import {selectPrice} from './prices.mjs';

export const OWN_QUOTE_CLARIFICATION_GUARD='literal-same-service-current-delivered-own-quote-v1';
export function ownQuoteClarification(store,config,state,event){
 if(config.company!=='fumigacion'||store.company!=='fumigacion'||event.kind!=='text'||event.fromMe||event.forwarded||state.requestedAfterServiceReview||state.requestedControlReview||state.awaitingHumanReview)return null;
 // Only a complete literal clarification qualifies. Additional questions,
 // negations, another pest or a changed scope retain their normal route.
 const text=normalize(event.text).replace(/\s+/g,' ').trim();
 const match=text.match(/^(?:(?:maria(?: angel)?|mariangel)[, ]+)?(?:(?:hola|buenos dias|buenas tardes|buenas noches)[,!. ]+)?[¿ ]*(?:(?:el precio|la cotizacion|el servicio) )?es para (?:el control de |tratar )?(comejen|cucarachas?|chinches?|roedores|ratas?|ratones|hormigas?|avispas?)(?:[, ]+(?:cierto|verdad|correcto))?[?!., ]*$/);
 const quote=state.quotedPrice;
 if(!match||!quote||normalize(quote.slots?.service)!==match[1]||normalize(state.slots?.service)!==match[1])return null;
 const entry=selectPrice(state.slots,store.approvedPriceCatalogs(),quote.entryId).entry;
 if(!entry||entry.id!==quote.entryId||entry.priceCop!==quote.priceCop)return null;
 const row=store.db.prepare("SELECT * FROM outbox WHERE id=? AND phone=? AND line=? AND internal=0 AND case_id=? AND mid IS NOT NULL AND state IN ('DELIVERED','READ')").get(quote.sourceId+':reply',event.phone,event.line,state.caseId);
 if(!row||row.created<Date.now()-86400000||!store.priceReplyReference(row)||!store.priceReplyStillValid(row))return null;
 return {entry,quotationSource:quote.sourceId,quotationMid:row.mid,
  decision:{state:{...state,slots:{...state.slots},lastText:event.text},quoteClarification:true,
   reply:'Sí, la cotización de $'+entry.priceCop.toLocaleString('es-CO')+' COP es para el control de '+state.slots.service+'.'}};
}
