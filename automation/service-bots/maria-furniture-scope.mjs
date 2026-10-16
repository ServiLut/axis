import {normalize} from './config.mjs';

export const MARIA_TERMITE_FURNITURE_SCOPE_GUARD='own-direct-literal-termite-furniture-quotation-scope-v1';

// A reference alone is not an asserted item scope. It prevents an unrelated
// room-count price from answering an unresolved furniture quotation.
export function termiteFurnitureMention(event){
 const t=event?.kind==='text'&&typeof event.text==='string'?normalize(event.text):'';
 return /\bcomejen\b/.test(t)&&/\bmuebles?\b/.test(t);
}

// A named item is the requested treatment scope; the surrounding apartment is
// location context. This never supplies a price, method or service acceptance.
export function literalTermiteFurnitureScope(event){
 if(event?.kind!=='text'||event.fromMe!==false||event.forwarded||event.quotedId||typeof event.text!=='string')return null;
 const text=event.text,t=normalize(text);
 // An explicit lack of the item's measurements negates only that datum.
 // Remove only that closed statement for classification, retaining the full
 // native message and the literal positive item fragment below unchanged.
 const asserted=t.replace(/(?:^|[.!?;]\s*)(?:aun |todavia )?no se cuanto mide(?:n)? (?:el|los|mi|mis|ese|esos) muebles?(?=\s*[.!?;]|$)/g,'.');
 if(!/\bcomejen\b/.test(t)||/["“”]/.test(text)||/\bsi\b(?!\s*[,!.])/iu.test(text)||/\b(?:no|sin|nunca|ni|cuando|quizas|tal vez|supongamos|hipotetic\w*|podria|habia|tuve|tuvimos|tenia|tenian|antes|anterior|ayer|pasad[oa]|hace|dijo|dice|dijeron|dicen|segun|vecin[oa]|amig[oa]|tercero)\b/.test(asserted))return null;
 const item='((?:(?:un|una|unos|unas|el|la|los|las|mi|mis|nuestro|nuestros)\\s+)?muebles?)';
 const patterns=[
  new RegExp('\\b(?:tengo|tenemos|hay)\\s+comej[eé]n\\s+en\\s+'+item+'\\b','iu'),
  new RegExp('\\b'+item+'\\s+(?:tiene|tienen|presenta|presentan)\\s+comej[eé]n\\b','iu'),
  new RegExp('\\b(?:quiero|necesito|deseo|quisiera)\\s+(?:tratar|cotizar|fumigar)\\s+'+item+'\\s+(?:con|por)\\s+comej[eé]n\\b','iu')
 ];
 const match=patterns.map(pattern=>text.match(pattern)).find(Boolean);
 if(!match)return null;
 const structural=text.match(/\b(?:y(?:\s+tambi[eé]n)?|tambi[eé]n)\s+(?:en\s+)?(?:(?:el|la|los|las|un|una|unos|unas)\s+)?(paredes?|pisos?|techos?|vigas?|estructuras?)\b/iu),whole=text.match(/\b(?:quiero|necesito|deseo)\s+tratar\s+((?:toda|todo|entera|entero)\s+(?:(?:mi|el|la|su|una|un)\s+)?(?:casa|apartamento|vivienda|inmueble))\b/iu);
 const additional=structural||whole,itemStart=match.index+match[0].lastIndexOf(match[1]),scopeEnd=additional?additional.index+additional[0].length:null;
 const literalScope=additional&&scopeEnd>itemStart&&scopeEnd-itemStart<=220?text.slice(itemStart,scopeEnd):match[1];
 return {guard:MARIA_TERMITE_FURNITURE_SCOPE_GUARD,kind:additional?'mixed-furniture-property':'furniture-item',text:match[1],literalScope,...(additional?{additionalScope:additional[1]}:{}),plural:/\bmuebles\b/iu.test(match[1]),sourceId:event.id,at:event.at};
}
