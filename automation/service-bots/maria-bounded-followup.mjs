// Repregunta limitada y respuesta a "¿qué consta?" (Claude, 5/11/2026).
// Motivo: en las líneas reales María repetía la misma pregunta sin límite
// cuando el cliente respondía "140", "3" o "5" + "colchones", y repetía el
// precio cuando el cliente preguntaba "que consta". Este módulo solo contiene
// textos fijos y reconocedores; no lee ni escribe estado.
import {normalize} from './config.mjs';
export const MARIA_BOUNDED_FOLLOWUP_GUARD='own-fum-bounded-intake-followup-v1';
// Aceptación coloquial del precio (12/11/2026): "ok listo", "dale de una", "sí,
// perfecto", "listo, hágale". Solo la etapa de precio en María; no amplía la
// gramática del backend ni acepta condiciones, preguntas o negaciones.
// Revisión de Codex (12/11): solo expresiones inequívocas de consentimiento;
// "ok", "claro", "perfecto", "gracias" solos o juntos son acuses, no un sí.
const CONSENT=['si','listo','dale','de una','hagale','hagamosle','de acuerdo','acepto','confirmo','me parece bien','quiero el servicio','lo quiero','lo tomo','tomo el servicio','agendemos','agendalo','agendame','programemos','programalo','hagamoslo','vamos con eso','adelante'];
const FILLER=['ok','okay','okey','perfecto','claro','bueno','gracias','muchas gracias','por favor','senora','senor','senorita'];
const PHRASES=[...CONSENT,...FILLER].sort((a,b)=>b.split(' ').length-a.split(' ').length);
export function acceptsColloquialQuotation(text){
 if(typeof text!=='string'||text.length>80||/[?¿]|https?:|\d/.test(text))return false;
 const t=normalize(text).replace(/[.!¡,;:)(\-]+/g,' ').replace(/\s+/g,' ').trim();
 if(!t||/\b(?:no|pero|si es|si hay|si tiene|si puede|si pueden|cuando|depende|quizas|tal vez|despues|luego|pensarlo|pienso|consulto|caro|descuento|rebaja)\b/.test(t))return false;
 // Tokenise into whole known phrases separated by spaces ("oklisto" is not two words).
 const words=t.split(' ');let i=0,consent=0,count=0;
 while(i<words.length){
  const phrase=PHRASES.find(p=>{const w=p.split(' ');return w.every((x,k)=>words[i+k]===x);});
  if(!phrase)return false;
  if(CONSENT.includes(phrase))consent++;
  i+=phrase.split(' ').length;count++;
 }
 return consent>=1&&count<=4;
}
export const MARIA_SERVICE_CONTENT_GUARD='own-fum-quoted-service-content-answer-v1';

const FURNITURE=' Si también hay chinches en bases u otros muebles, cuéntame cuáles.';
// Variantes sin cifras: el cliente que no sabe la medida no recibe números inventados.
const VARIANTS={
 size:['Para cotizarte necesito el tamaño aproximado: ¿cuántas habitaciones o metros cuadrados tiene el lugar? Por ejemplo: «dos habitaciones».',
  'No te preocupes si no sabes la medida exacta: con el número de habitaciones es suficiente. ¿Cuántas habitaciones o metros cuadrados tiene, aproximadamente?'],
 site:['¿Qué tipo de inmueble es: casa, apartamento, local u oficina?',
  'Para cotizarte necesito saber el tipo de inmueble: ¿es casa, apartamento, local u otro?'],
 location:['¿En qué municipio y barrio es el servicio? Por ejemplo: «Medellín, Laureles».',
  'Para cotizarte necesito el municipio del servicio, por ejemplo Medellín, Bello, Itagüí o Envigado. ¿Dónde es?'],
 locationKnownDetails:['¿En qué municipio es el servicio? Por ejemplo: «Medellín», «Bello» o «Envigado».',
  'Para cotizarte necesito el municipio del servicio, por ejemplo Medellín, Bello, Itagüí o Envigado. ¿Dónde es?'],
 mattresses:['Para cotizarte necesito el número de colchones con chinches. Escríbeme, por ejemplo, «dos colchones».',
  '¿Cuántos colchones tienen chinches? Con ese dato te doy el valor enseguida.'],
 service:['¿Qué plaga quieres tratar? Por ejemplo: cucarachas, chinches, ratones o comején.',
  'Para cotizarte necesito saber la plaga: ¿son cucarachas, chinches, ratones, comején u otra?']
};
export function followupVariant(missing,index,{locationDetails=false,furniture=true}={}){
 const list=VARIANTS[missing==='location'&&locationDetails?'locationKnownDetails':missing];
 if(!list)return null;
 const text=list[Math.min(index,list.length-1)];
 return missing==='mattresses'&&furniture&&index===0?text+FURNITURE:text;
}
export function numberConfirmation(missing,n,{furniture=true}={}){
 if(missing==='size')return Number(n)<=10
  ?'¿Son '+n+' habitaciones? Escríbemelo así: «'+n+' habitaciones». Si son metros, escríbeme por ejemplo «80 metros cuadrados».'
  :'¿Son '+n+' metros cuadrados? Escríbemelo así: «'+n+' metros cuadrados». Si prefieres darme habitaciones, escríbeme por ejemplo «3 habitaciones».';
 if(missing==='mattresses')return '¿Son '+n+' colchones con chinches? Escríbemelo así: «'+n+' colchones».'+(furniture?FURNITURE:'');
 return null;
}
export function splitNumberUnit(n,unit){return 'Perfecto. Para registrarlo bien, escríbeme la cantidad con la unidad en un solo mensaje, por ejemplo «'+n+' '+unit+'».';}
export function bareNumber(t){return String(t??'').trim().match(/^(\d{1,4})[.! ]*$/)?.[1];}
export function unitOnly(t){return /^(?:colchon(?:es)?|habitaciones?|cuartos?|alcobas?|metros?(?: cuadrados?)?|m2|mts?2?)[.! ]*$/.test(String(t??'').trim());}

const SERVICE_CONTENT={
 chinches:'Aplicamos 3 técnicas para el control de chinches:\n1️⃣ Vaporización en colchones: tratamiento con vapor para eliminar las chinches del colchón.\n2️⃣ Aspersión en toda el área: aplicación líquida en pisos, paredes, muebles y base de la cama.\n3️⃣ Inyección de colchones: tratamiento en costuras y zonas internas donde suelen esconderse.',
 cucarachas:'El servicio incluye, en una sola sesión:\n1️⃣ Insecticida líquido en aspersión, de acción rápida y residual.\n2️⃣ Polvo ecológico en grietas y zonas estratégicas.\n3️⃣ Gel con atrayente para áreas donde el líquido no llega.\n4️⃣ Trampas adhesivas para monitorear la infestación.\nTratamos toda el área.',
 roedores:'El control de roedores incluye: inspección minuciosa del lugar, estaciones de cebado, cebos anticoagulantes y sistemas de monitoreo.',
 comejen:'Aplicamos 3 técnicas para el comején:\n1️⃣ Vaporización en áreas afectadas, para penetrar grietas y galerías.\n2️⃣ Aspersión general en marcos, pisos y estructuras de madera.\n3️⃣ Inyección directa en la madera para eliminar y prevenir nuevas colonias.'
};
export function serviceContentKey(service){
 return service==='chinches'?'chinches':service==='cucarachas'?'cucarachas':/^(?:ratas|ratones|roedores|ratas y ratones|ratones y ratas)$/.test(service??'')?'roedores':service==='comejen'||service==='comején'?'comejen':null;
}
// "¿Incluye la cocina?" (interior areas only; patio/garage stay outside, since
// the approved table treats a patio as extra scope).
const INTERIOR_AREA=/^(?:y\s+)?(?:eso\s+|el servicio\s+|la fumigacion\s+)?(?:tambien\s+)?(?:incluye|cubre)\s+(?:(?:la|el|los|las|toda la|todo el)\s+)?(cocina|bano|banos|habitaciones|cuartos|alcobas|sala|comedor|closets?|armarios|toda la casa|todo el apartamento|todo el apto|todo)[\s?.!]*$/;
export function serviceAreaQuestion(t){const s=String(t??'').replace(/^[¿¡\s]+/,'').trim();return s.length<=80?(s.match(INTERIOR_AREA)?.[1]??null):null;}
const AREA_PHRASE={cocina:'incluida la cocina',sala:'incluida la sala',comedor:'incluido el comedor',bano:'incluido el baño',banos:'incluidos los baños',habitaciones:'incluidas las habitaciones',cuartos:'incluidos los cuartos',alcobas:'incluidas las alcobas',closet:'incluido el clóset',closets:'incluidos los clósets',armarios:'incluidos los armarios'};
export function serviceContentText(key,priceCop,{area=null}={}){
 const keys=Array.isArray(key)?key:[key];
 // "Toda el área" viene solo de la respuesta rápida de cucarachas; el
 // tratamiento de chinches cotizado es por colchón y se dice por separado.
 const cover=AREA_PHRASE[area]?'toda el área del inmueble, '+AREA_PHRASE[area]+'.':'toda el área del inmueble.';
 const lead=!area?'':(keys.includes('chinches')?'Sí, el control de cucarachas cubre '+cover+' El tratamiento de chinches se aplica a los colchones cotizados.':'Sí, el servicio cubre '+cover)+'\n\n';
 return lead+keys.map(k=>SERVICE_CONTENT[k]).join('\n\n')+'\n\nEl valor cotizado es $'+new Intl.NumberFormat('es-CO').format(priceCop)+' COP. ¿Deseas continuar con esta cotización?';
}
// t: texto normalizado (minúsculas, sin tildes). Solo preguntas EXCLUSIVAMENTE
// explicativas: todo el mensaje debe ser la pregunta (más un objeto opcional como
// "el servicio" o "eso"). Aplazamientos, cambios de alcance o mezclas no entran.
export function serviceContentQuestion(t){
 const s=String(t??'').replace(/^[¿¡\s]+/,'').trim();
 const ask='(?:(?:que|q|en que|de que)\\s+(?:consta|incluye|contiene|comprende|abarca|consiste|se trata)|como es el (?:proceso|servicio|tratamiento|procedimiento)|que (?:le |les |me )?(?:hacen|aplican|echan|usan|utilizan)|que (?:proceso|procedimiento|tratamiento|productos?|tecnicas?|metodos?) (?:usan|aplican|hacen|utilizan|es|seria|llevan))';
 const object='(?:\\s+(?:eso|esto|(?:el|la|ese|esa|este|esta)\\s+(?:servicio|tratamiento|proceso|procedimiento|fumigacion|cotizacion|paquete)))?';
 return s.length<=80&&new RegExp('^(?:y\\s+)?'+ask+object+'(?:\\s+(?:por favor|porfa))?[\\s?.!]*$').test(s);
}
// Estado del descuento en consulta con la jefe (sin reofrecer el precio de tabla).
export function discountStatusText(communicated){
 return communicated
  ?'Sobre el valor: es el que te confirmó mi jefe en el mensaje anterior. Si te parece bien, respóndeme «sí» y una asesora agenda el servicio contigo.'
  :'Sobre el valor: mi jefe todavía está revisando tu solicitud de descuento. En cuanto me responda te confirmo el valor final.';
}
export function serviceContentWithDiscountStatus(text,communicated){
 return String(text).replace(/\n\nEl valor cotizado es \$[\d.]{3,12} COP\. ¿Deseas continuar con esta cotización\?$/,'')+'\n\n'+discountStatusText(communicated);
}
// Textos fijos de este módulo: se envían tal cual, sin llamada de estilo.
const fixed=new Set([...Object.values(VARIANTS).flat(),VARIANTS.mattresses[0]+FURNITURE]);
export function boundedFollowupText(text){
 if(typeof text!=='string')return false;
 if(fixed.has(text))return true;
 if(/^¿Son \d{1,4} (?:habitaciones|metros cuadrados|colchones con chinches)\? Escríbemelo así: «\d{1,4} (?:habitaciones|metros cuadrados|colchones)»\.(?: .{0,120})?$/.test(text))return true;
 if(/^Perfecto\. Para registrarlo bien, escríbeme la cantidad con la unidad en un solo mensaje, por ejemplo «\d{1,4} [a-z0-9 ]{1,20}»\.$/.test(text))return true;
 const body=text.replace(/^Sí, el (?:servicio|control de cucarachas) cubre toda el área del inmueble(?:, [a-záéíóúñ ]{3,40})?\.(?: El tratamiento de chinches se aplica a los colchones cotizados\.)?\n\n/,'');
 const tail=body.match(/\n\nEl valor cotizado es \$[\d.]{3,12} COP\. ¿Deseas continuar con esta cotización\?$/)||[true,false].map(c=>'\n\n'+discountStatusText(c)).map(s=>body.endsWith(s)?{index:body.length-s.length}:null).find(Boolean);
 if(!tail)return false;
 const blocks=body.slice(0,tail.index).split('\n\n');
 const known=new Set(Object.values(SERVICE_CONTENT));
 // Each content block itself may contain blank-line-free lines only.
 return blocks.length>=1&&blocks.length<=2&&blocks.every(b=>known.has(b));
}
