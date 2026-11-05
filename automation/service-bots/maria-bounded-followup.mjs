// Repregunta limitada y respuesta a "¿qué consta?" (Claude, 5/11/2026).
// Motivo: en las líneas reales María repetía la misma pregunta sin límite
// cuando el cliente respondía "140", "3" o "5" + "colchones", y repetía el
// precio cuando el cliente preguntaba "que consta". Este módulo solo contiene
// textos fijos y reconocedores; no lee ni escribe estado.
export const MARIA_BOUNDED_FOLLOWUP_GUARD='own-fum-bounded-intake-followup-v1';
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
export function serviceContentText(key,priceCop){
 return SERVICE_CONTENT[key]+'\n\nEl valor cotizado es $'+new Intl.NumberFormat('es-CO').format(priceCop)+' COP. ¿Deseas continuar con esta cotización?';
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
// Textos fijos de este módulo: se envían tal cual, sin llamada de estilo.
const fixed=new Set([...Object.values(VARIANTS).flat(),VARIANTS.mattresses[0]+FURNITURE]);
export function boundedFollowupText(text){
 if(typeof text!=='string')return false;
 if(fixed.has(text))return true;
 if(/^¿Son \d{1,4} (?:habitaciones|metros cuadrados|colchones con chinches)\? Escríbemelo así: «\d{1,4} (?:habitaciones|metros cuadrados|colchones)»\.(?: .{0,120})?$/.test(text))return true;
 if(/^Perfecto\. Para registrarlo bien, escríbeme la cantidad con la unidad en un solo mensaje, por ejemplo «\d{1,4} [a-z0-9 ]{1,20}»\.$/.test(text))return true;
 return Object.keys(SERVICE_CONTENT).some(k=>text.startsWith(SERVICE_CONTENT[k]+'\n\nEl valor cotizado es $'));
}
