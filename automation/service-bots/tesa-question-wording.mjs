// Presentation only. Routing, source verification, minimization and authority
// remain with the existing TESA guards; a formatted question grants none.
export const MARIA_TESA_QUESTION_WORDING_GUARD='own-fum-numbered-case-questions-with-explicit-format-examples-v1';
const MAX_LENGTH=1200;
const compact=value=>typeof value==='string'?value.replace(/\s+/g,' ').trim():'';
const short=(value,max)=>{const text=compact(value);return text.length>max?text.slice(0,max-1).trimEnd()+'…':text;};
const exampleNotice='Los corchetes son ejemplos de formato, no datos ni asignaciones reales.';
const closing='Respondan citando este mensaje y siguiendo los números. Si falta un dato, indiquen cuál sigue pendiente.';
const normalized=value=>compact(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const quotationTopics=['cotizacion-verificada','special-quotation','existing-quotation'];
const detailPlaceholder=value=>/^(?:cotizacion(?: tecnica)?|solicitud de cotizacion|consulta de precio)[.! ]*$/.test(normalized(value));
const unreportedMeasure=value=>!compact(value)||/^(?:no (?:se|sabe|informad[oa])|sin (?:dato|medida)|desconocid[oa])\b/.test(normalized(value));

function readableContext(facts,contextFacts){
  const raw=compact(Array.isArray(facts)?facts.filter(value=>typeof value==='string').join('; '):facts);
  const keys=['service','location','site','rooms','area','mattresses','detail','preference','question'];
  const supplied=Object.fromEntries(keys.filter(key=>typeof contextFacts?.[key]==='string').map(key=>[key,contextFacts[key].trim()]));
  const labels={Servicio:'service',Municipio:'location',Inmueble:'site','Área':'area',Habitaciones:'rooms',Colchones:'mattresses',Falla:'detail','Horario solicitado':'preference','Petición literal':'question'};
  const matches=[...raw.matchAll(/(?:^|;\s*)(Servicio|Municipio|Inmueble|Área|Habitaciones|Colchones|Falla|Horario solicitado|Petición literal)\s*:\s*/g)];
  const questionIndex=matches.findIndex(match=>match[1]==='Petición literal');
  const found=questionIndex<0?matches:matches.slice(0,questionIndex+1),values={};
  for(let i=0;i<found.length;i++)values[labels[found[i][1]]]=raw.slice(found[i].index+found[i][0].length,found[i+1]?.index??raw.length).trim();
  // Only the caller's named, minimized text fields can reach the group.
  const selected=Object.keys(supplied).length?supplied:values;
  if(detailPlaceholder(selected.detail))delete selected.detail;
  return {values:selected,raw:found.length||Object.keys(selected).length?'':raw};
}

function purposeFor(topic,conditions){
  if(conditions?.kind==='reported-existing-schedule')return {purpose:'comprobar una cita que el cliente dice tener',request:'El cliente relata una cita previa.'};
  if(conditions?.kind==='technical-painting')return {purpose:'confirmar si ofrecemos el trabajo solicitado',request:'Consulta el alcance de un trabajo.'};
  if(quotationTopics.includes(topic))return {purpose:'cotizar este servicio',request:'Solicita una cotización.'};
  if(topic==='disponibilidad-y-cotizacion')return {purpose:'consultar disponibilidad y cotización',request:'Solicita disponibilidad y cotización.'};
  if(topic==='disponibilidad-y-tecnico')return {purpose:'consultar disponibilidad para este servicio',request:'Necesita conocer la disponibilidad del servicio.'};
  if(topic==='requested-technician-contact')return {purpose:'confirmar qué contacto del técnico podemos compartir',request:'Solicita el contacto del técnico.'};
  if(topic==='service-followup')return {purpose:'verificar la llegada de esta visita',request:'Consulta la llegada del servicio.'};
  return {purpose:'aclarar un dato de esta solicitud',request:'Falta aclarar un dato para continuar.'};
}

function knownFacts({values,raw}){
  if(raw)return [raw];
  const rows=[];
  for(const [key,label]of [['service','Servicio indicado'],['location','Municipio'],['site','Inmueble indicado'],['rooms','Habitaciones'],['area','Medida'],['mattresses','Colchones informados'],['detail','Detalle indicado'],['preference','Preferencia del cliente']]){
    if(compact(values[key])&&!(key==='area'&&unreportedMeasure(values[key])))rows.push(label+': '+compact(values[key]));
    if(key==='area'&&compact(values.rooms)&&unreportedMeasure(values.area))rows.push('Medida: no informada');
  }
  return rows.length?rows:['No hay otros datos informados en este contexto.'];
}

function fitContext(text,limit,marker){
  if(text.length<=limit)return text;
  if(limit<=marker.length)return '';
  return text.slice(0,limit-marker.length).trimEnd()+marker;
}

function availabilityQuestions(existing=false){
  return [
    existing?'Registro: ¿Existe una cita registrada para esta visita? Ej.: [sí/no; qué falta confirmar].':'Disponibilidad: ¿Se puede atender este caso? Ej.: [sí/no; qué falta confirmar].',
    existing?'Técnico: ¿Quién figura asignado en Tenaxis? Ej.: [nombre completo en Tenaxis].':'Técnico: ¿Qué técnico puede atenderlo? Ej.: [nombre completo en Tenaxis].',
    existing?'Día: ¿Qué fecha figura registrada? Ej.: [fecha].':'Día: ¿Qué fecha se puede ofrecer? Ej.: [fecha disponible].',
    existing?'Horario: ¿Qué inicio y fin figuran registrados? Ej.: inicio [hora]; fin [hora].':'Horario: ¿Qué inicio y fin se pueden ofrecer? Ej.: inicio [hora]; fin [hora].'
  ];
}

function questionsFor(topic,conditions,values){
  if(conditions?.kind==='reported-existing-schedule')return availabilityQuestions(true);
  if(conditions?.kind==='technical-painting')return ['Servicio solicitado: ¿Ofrecemos este trabajo y con qué alcance? Ej.: [sí/no; trabajo que se puede realizar].'];
  const quotation='Cotización: ¿Qué valor y alcance están autorizados para este caso? Ej.: [valor; qué incluye].';
  if(quotationTopics.includes(topic)){
    if(compact(values?.rooms)&&unreportedMeasure(values?.area))return [
      'Dato para cotizar: ¿Qué dato falta consultar al cliente sobre este espacio? Ej.: [dato concreto o ninguno].',
      'Cotización: Si estos datos bastan, ¿qué valor y alcance están autorizados? Ej.: [valor; qué incluye].'
    ];
    return [quotation];
  }
  if(topic==='requested-technician-contact')return ['Contacto: ¿Qué contacto del técnico está autorizado para compartir en este caso? Ej.: [contacto autorizado].'];
  if(topic==='service-followup')return [
    'Llegada: ¿Cuál es el estado comprobado de la visita? Ej.: [estado verificado].',
    'Hora de llegada: ¿Qué hora se ha comprobado? Ej.: [hora; estimada o confirmada].'
  ];
  if(typeof topic==='string'&&topic.startsWith('missing-intake:')){
    const fields={service:'la plaga o el servicio solicitado',site:'el tipo de inmueble',size:'el área o la cantidad de habitaciones',mattresses:'la cantidad de colchones',detail:'el detalle de la solicitud',location:'el municipio y barrio',preference:'el día y la franja que prefiere el cliente'};
    const field=fields[topic.slice('missing-intake:'.length)]||'el dato pendiente';
    return ['Dato pendiente: ¿Qué información verificada tenemos sobre '+field+'? Ej.: [dato confirmado o dato que falta consultar al cliente].'];
  }
  if(topic==='disponibilidad-y-cotizacion')return [...availabilityQuestions(),quotation];
  if(topic==='disponibilidad-y-tecnico')return availabilityQuestions();
  return ['Consulta: ¿Qué información verificada falta para continuar este caso? Ej.: [dato pendiente y quién debe confirmarlo].'];
}

/**
 * FUM wording only. `facts` and `contextFacts` are already minimized by the caller;
 * never serialize conditions or infer a price, identity, date or assignment.
 * The caller selects this formatter for María; Miguel keeps its old wording.
 */
export function formatMariaTesaQuestion({bot,name,reference,last4,lineLast4,facts,contextFacts,topic,conditions}={}){
  const context=readableContext(facts,contextFacts),description=purposeFor(topic,conditions);
  const header='Equipo TESA, necesito ayuda para '+description.purpose+'.';
  const identity='Caso: '+(/^\d{4}$/.test(last4||'')?'cliente …'+last4:'cliente sin terminación disponible')+
    (/^\d{4}$/.test(lineLast4||'')?' · línea azul …'+lineLast4:'')+'.';
  const footer=(short(bot,24)||'María Ángel')+' · '+(short(name,32)||'Fumigación')+'. Referencia interna: '+(short(reference,32)||'[referencia]')+'.';
  const numbered=questionsFor(topic,conditions,context.values).map((question,index)=>(index+1)+'. '+question).join('\n');
  const render=(quote,known)=>[header,identity,'Qué pide el cliente:\n'+description.request+(quote?'\n'+quote:''),'Qué sabemos:\n'+known,'Qué falta confirmar:\n'+exampleNotice+'\n'+numbered,closing,footer].join('\n');
  const room=MAX_LENGTH-render('','').length;
  const known=knownFacts(context).map(value=>'- '+value).join('\n');
  const question=typeof context.values.question==='string'?context.values.question:'';
  const fullQuote=question?'Referencia textual del cliente: «'+question+'».':'';
  const quoteRoom=fullQuote?Math.max(0,Math.min(fullQuote.length,Math.floor(room*0.5))):0;
  // An abbreviated quote is labelled as a fragment rather than passed off as
  // the full original. The current source itself is never changed.
  const fragmentPrefix='Fragmento textual del cliente: «',fragmentEnd='» [cita abreviada]';
  const quote=fullQuote.length<=quoteRoom?fullQuote:quoteRoom>fragmentPrefix.length+fragmentEnd.length?fragmentPrefix+fitContext(question,quoteRoom-fragmentPrefix.length-fragmentEnd.length,'…')+fragmentEnd:'';
  return render(quote,fitContext(known,Math.max(0,room-quote.length-(quote?1:0)),' … [contexto abreviado]'));
}
