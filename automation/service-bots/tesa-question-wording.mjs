// Presentation only. Routing, source verification, minimization and authority
// remain with the existing TESA guards; a formatted question grants none.
export const MARIA_TESA_QUESTION_WORDING_GUARD='own-fum-one-case-one-decision-with-explicit-presentation-stage-v2';
const MAX_LENGTH=1200;
const compact=value=>typeof value==='string'?value.replace(/\s+/g,' ').trim():'';
const short=(value,max)=>{const text=compact(value);return text.length>max?text.slice(0,max-1).trimEnd()+'…':text;};
const normalized=value=>compact(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const quotationTopics=['cotizacion-verificada','special-quotation','existing-quotation'];
const workflowTopics=[...quotationTopics,'disponibilidad-y-cotizacion','disponibilidad-y-tecnico'];
const presentationStages=new Set(['quote-needed','accepted-unregistered','saved-awaiting-schedule','reported-existing-schedule']);
const detailPlaceholder=value=>/^(?:cotizacion(?: tecnica)?|solicitud de cotizacion|consulta de precio)[.! ]*$/.test(normalized(value));
const unreportedMeasure=value=>!compact(value)||/^(?:no (?:se|sabe|informad[oa])|sin (?:dato|medida)|desconocid[oa])\b/.test(normalized(value));

function readableContext(facts,contextFacts){
  const raw=compact(Array.isArray(facts)?facts.filter(value=>typeof value==='string').join('; '):facts);
  const keys=['service','location','locationDetails','site','rooms','area','dimensions','roomScale','siteScale','floors','patio','treatmentScope','mattresses','detail','preference','question'];
  const supplied=Object.fromEntries(keys.filter(key=>typeof contextFacts?.[key]==='string').map(key=>[key,contextFacts[key].trim()]));
  const labels={Servicio:'service',Municipio:'location','Ubicación indicada':'locationDetails',Inmueble:'site','Área':'area','Dimensiones':'dimensions','Tamaño de las habitaciones':'roomScale','Tamaño del inmueble':'siteScale',Pisos:'floors',Patio:'patio','Alcance informado':'treatmentScope',Habitaciones:'rooms',Colchones:'mattresses',Falla:'detail','Horario solicitado':'preference','Petición literal':'question'};
  const matches=[...raw.matchAll(/(?:^|;\s*)(Servicio|Municipio|Ubicación indicada|Inmueble|Área|Dimensiones|Tamaño de las habitaciones|Tamaño del inmueble|Pisos|Patio|Alcance informado|Habitaciones|Colchones|Falla|Horario solicitado|Petición literal)\s*:\s*/g)];
  // Customer text may contain labels; none become facts after this boundary.
  const questionIndex=matches.findIndex(match=>match[1]==='Petición literal');
  const found=questionIndex<0?matches:matches.slice(0,questionIndex+1),values={};
  for(let i=0;i<found.length;i++)values[labels[found[i][1]]]=raw.slice(found[i].index+found[i][0].length,found[i+1]?.index??raw.length).trim();
  // Structured context is exclusive; arbitrary conditions are never fallback.
  const selected=Object.keys(supplied).length?supplied:values;
  if(detailPlaceholder(selected.detail))delete selected.detail;
  return {values:selected,raw:found.length||Object.keys(selected).length?'':raw};
}

function knownFacts({values,raw}){
  if(raw)return raw;
  const rows=[];
  for(const [key,label]of [['service','Servicio'],['location','Municipio'],['locationDetails','Ubicación indicada'],['site','Inmueble'],['rooms','Habitaciones'],['roomScale','Tamaño de las habitaciones'],['siteScale','Tamaño del inmueble'],['area','Área informada'],['dimensions','Dimensiones literales'],['floors','Pisos informados'],['patio','Patio informado'],['treatmentScope','Alcance informado'],['mattresses','Colchones'],['detail','Detalle'],['preference','Preferencia del cliente']]){
    if(compact(values[key])&&!(key==='area'&&unreportedMeasure(values[key])))rows.push(label+': '+compact(values[key]));
  }
  if((compact(values.rooms)||compact(values.dimensions))&&unreportedMeasure(values.area))rows.push(values.dimensions?'Área total: no informada':'Medida: no informada');
  return rows.join('; ');
}

function requestFor(topic,conditions,presentationStage){
  // Only this closed argument describes a workflow stage. A conditions object,
  // order identifier or price is not evidence of that stage.
  const stage=presentationStages.has(presentationStage)&&workflowTopics.includes(topic)?presentationStage:null;
  if(conditions?.kind==='technical-painting')return {
    purpose:'confirmar si ofrecemos este trabajo',
    question:'¿Ofrecemos el trabajo solicitado? Indiquen el alcance disponible o qué falta aclarar.',
    format:'ofrecemos [sí/no]; alcance [trabajo que se puede realizar].'
  };
  if(stage==='reported-existing-schedule')return {
    purpose:'comprobar una visita que el cliente dice tener',
    question:'¿Existe esa visita en Tenaxis? Indiquen el técnico, la fecha y la franja registrados, o qué sigue sin confirmar.',
    format:'registro [sí/no]; técnico [nombre]; fecha [día]; inicio [hora]; fin [hora].'
  };
  if(stage==='saved-awaiting-schedule')return {
    purpose:'coordinar una solicitud ya registrada; faltan técnico y horario',
    question:'¿Qué técnico, fecha y franja de inicio y fin pueden confirmar para esta solicitud?',
    format:'técnico: [nombre completo en Tenaxis]; fecha: [AAAA-MM-DD]; inicio: [HH:mm]; fin: [HH:mm]. Usen hora de Colombia y reloj de 24 horas; si falta un dato, indiquen cuál.'
  };
  if(stage==='accepted-unregistered')return {
    purpose:'coordinar un servicio aceptado por el cliente, todavía sin registrar',
    question:'¿Qué disponibilidad verificada pueden ofrecer para este caso? Indiquen técnico, fecha y franja, o qué falta confirmar.',
    format:'técnico [nombre en Tenaxis]; fecha [día]; inicio [hora]; fin [hora].'
  };
  if(stage==='quote-needed'||quotationTopics.includes(topic))return {
    purpose:'cotizar este caso',
    question:'¿Pueden cotizar con estos datos? Indiquen valor y qué incluye, o el dato concreto que falta.',
    format:'valor [importe]; incluye [alcance] / falta [dato para cotizar].'
  };
  if(topic==='disponibilidad-y-cotizacion')return {
    purpose:'preparar una propuesta para este caso',
    question:'¿Qué propuesta verificada podemos ofrecer? Indiquen valor, alcance, técnico, fecha y franja, o qué falta confirmar.',
    format:'valor [importe]; incluye [alcance]; técnico [nombre]; fecha [día]; franja [inicio-fin].'
  };
  if(topic==='disponibilidad-y-tecnico')return {
    purpose:'confirmar disponibilidad para este caso',
    question:'¿Se puede atender este caso? Indiquen técnico, fecha y franja disponibles, o qué falta confirmar.',
    format:'disponible [sí/no]; técnico [nombre en Tenaxis]; fecha [día]; franja [inicio-fin].'
  };
  if(topic==='requested-technician-contact')return {
    purpose:'confirmar qué contacto del técnico podemos compartir',
    question:'¿Qué contacto del técnico está autorizado para compartir con este cliente?',
    format:'contacto autorizado [dato] / pendiente [qué falta confirmar].'
  };
  if(topic==='service-followup')return {
    purpose:'comprobar el estado de esta visita',
    question:'¿Cuál es el estado comprobado de la visita y la hora de llegada verificada, si existe?',
    format:'estado [hecho comprobado]; llegada [hora y si es estimada o confirmada / pendiente].'
  };
  if(typeof topic==='string'&&topic.startsWith('missing-intake:')){
    const fields={service:'la plaga o el servicio solicitado',site:'el tipo de inmueble',size:'el área o la cantidad de habitaciones',mattresses:'la cantidad de colchones',detail:'el detalle de la solicitud',location:'el municipio y barrio',preference:'el día y la franja que prefiere el cliente'};
    const field=fields[topic.slice('missing-intake:'.length)]||'el dato pendiente';
    return {purpose:'aclarar un dato de esta solicitud',question:'¿Qué información verificada tenemos sobre '+field+'?',format:'dato confirmado [información] / falta consultar al cliente [dato concreto].'};
  }
  return {purpose:'aclarar esta solicitud',question:'¿Qué información verificada falta para continuar este caso?',format:'falta [dato concreto]; debe confirmarlo [responsable].'};
}

function fitContext(text,limit,marker){
  if(text.length<=limit)return text;
  if(limit<=marker.length)return '';
  return text.slice(0,limit-marker.length).trimEnd()+marker;
}

/**
 * FUM wording only. Facts are named literal fields already minimized by the
 * caller. presentationStage is an optional closed value supplied by the engine
 * after its own checks, never an execution or authority grant. Conditions are
 * not serialized. Miguel keeps its own wording and routing.
 */
export function formatMariaTesaQuestion({bot,name,reference,last4,lineLast4,facts,contextFacts,topic,conditions,presentationStage}={}){
  const context=readableContext(facts,contextFacts),request=requestFor(topic,conditions,presentationStage);
  const header='Equipo TESA, necesito '+request.purpose+'.';
  const identity=(/^\d{4}$/.test(last4||'')?'Cliente …'+last4:'Cliente sin terminación disponible')+
    (/^\d{4}$/.test(lineLast4||'')?' · línea azul …'+lineLast4:'')+'.';
  const footer=(short(bot,24)||'María Ángel')+' · '+(short(name,32)||'Fumigación')+'. Referencia interna: '+(short(reference,32)||'[referencia]')+'.';
  const render=(known,quote)=>[header,identity,known?'Datos: '+known:'',quote,request.question,'Ejemplo de formato (por completar): '+request.format,'Respondan citando este mensaje.',footer].filter(Boolean).join('\n');
  const known=knownFacts(context),literal=compact(context.values.question);
  const fullQuote=literal?'Cliente: «'+literal+'».':'';
  const room=MAX_LENGTH-render('','').length;
  // The decision, example, quote instruction and reference are never cut.
  const quoteRoom=fullQuote?Math.max(0,Math.min(fullQuote.length,Math.floor(room*0.5))):0;
  const prefix='Fragmento del cliente: «',end='» [cita abreviada]';
  const quote=fullQuote.length<=quoteRoom?fullQuote:quoteRoom>prefix.length+end.length?prefix+fitContext(literal,quoteRoom-prefix.length-end.length,'…')+end:'';
  const knownRoom=Math.max(0,room-quote.length-(quote?1:0)-('Datos: '.length+1));
  return render(fitContext(known,knownRoom,' … [contexto abreviado]'),quote);
}
