import {normalize,SANDRA} from './config.mjs';
import {projectCurrentMariaLocationDetails} from './current-location-projection.mjs';
import {literalTermiteFurnitureScope,termiteFurnitureMention,MARIA_TERMITE_FURNITURE_SCOPE_GUARD} from './maria-furniture-scope.mjs';

// Presentation only. The existing question store owns routing, deduplication,
// source history and authority. Rendering a question grants no business action.
export const MARIA_CHIEF_QUESTION_WORDING_GUARD='own-fum-chief-one-readable-question-with-literal-case-facts-v1';
const compact=value=>typeof value==='string'?value.replace(/\s+/g,' ').trim():'';
const short=(value,max)=>{const text=compact(value);return text.length>max?text.slice(0,max-1).trimEnd()+'…':text;};
const privateExcerpt=value=>compact(value)
 .replace(/https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w.-]+/gi,'[referencia reservada]')
 .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|\b[0-9a-f]{32,}\b/gi,'[referencia interna]')
 .replace(/\b(?:api.?key|bearer|token|contrase[nñ]a|clave)\s*(?:(?:es|era|es:|de acceso es)\s+|[:=]\s*)?\S+/gi,'[dato reservado]')
 .replace(/\+?\b(?:57[ .()-]*)?3(?:[ .()-]*\d){9}\b/g,'[teléfono reservado]')
 .replace(/\b(?:calle|carrera|avenida|transversal|diagonal|circular|cl|cra|cr|kr|av|trv|tv|dg)\.?\s*\d[^;!?]*|#\s*\d[^;!?]*/gi,'[dirección reservada]')
 .replace(/\b\d{6,}\b/g,'[referencia reservada]');
const placeholder=value=>/^(?:cotizacion(?: tecnica)?|solicitud de cotizacion|consulta de precio|desconocid[oa]|no informad[oa]|sin dato)[.! ]*$/.test(normalize(value));
const labels={service:'Servicio',location:'Municipio',locationContext:'Ubicación indicada',site:'Inmueble',scope:'Alcance indicado',detail:'Detalle indicado'};

function decision(topic,kind){
 if(topic==='adviser-assistance')return {title:'Atención de asesor solicitada',question:'El cliente pide hablar con una persona. ¿Quién puede contactarlo? Para comunicar una indicación concreta, responde citando este mensaje con «Para el cliente:» y el texto que deba recibir.'};
 if(kind==='ambiguous-followup')return {title:'Solicitud que necesita aclaración',question:'¿Debemos atender una solicitud nueva o revisar el servicio anterior en este caso?'};
 if(topic==='warranty-review'||kind==='warranty'||kind==='warranty-claim')return {title:'Solicitud de garantía',question:'¿Aplica una visita de garantía para este caso? Para comunicar una indicación concreta, responde citando este mensaje con «Para el cliente:» y el texto que deba recibir.'};
 if(topic==='service-documents'||topic==='documents-review')return {title:'Documento solicitado',question:'¿Qué documento debemos entregarle para atender su solicitud?'};
 if(topic==='payment-instructions')return {title:'Consulta sobre pago',question:'¿Qué indicación de pago debemos darle para este servicio?'};
 if(topic==='charge-review'||kind==='charge-dispute')return {title:'Cobro por aclarar',question:'¿Qué valor y condición de cobro debemos comunicar para este caso?'};
 if(/payment|receipt|bank|support/.test(kind||'')||topic==='payment-review')return {title:'Pago por revisar',question:'¿Qué respuesta debemos darle sobre el pago de este servicio?'};
 if(['cotizacion-verificada','special-quotation','existing-quotation','price-review'].includes(topic))return {title:'Precio y alcance por confirmar',question:'¿Qué valor total y alcance podemos ofrecer para esta solicitud?'};
 if(topic==='service-followup'){
  if(kind==='reinforcement')return {title:'Solicitud de refuerzo',question:'¿Qué condiciones y valor aplican al refuerzo solicitado?'};
  if(kind==='arrival')return {title:'Consulta sobre la visita',question:'¿Qué estado y hora de llegada verificados debemos comunicarle?'};
  return {title:'Revisión de un servicio anterior',question:'¿Qué revisión debemos ofrecer para este servicio?'};
 }
 if(/cancel/.test(kind||''))return {title:'Solicitud de cancelación',question:'¿Cómo debemos atender esta solicitud de cancelación?'};
 if(/complaint|threat|safety|personal-priority/.test(kind||''))return {title:'Situación que requiere tu revisión',question:'¿Cómo debemos atender esta situación del cliente?'};
 return {title:'Respuesta al cliente por confirmar',question:'¿Qué respuesta confirmada debemos darle a este mensaje?'};
}

/** Pure renderer; facts are supplied only by the read-only own-source adapter. */
export function formatMariaChiefQuestion({topic,kind,last4,lineLast4,facts=[],sourceText}={}){
 if(!/^\d{4}$/.test(last4||'')||!Array.isArray(facts))return null;
 const request=decision(topic,kind),rows=[];
 for(const fact of facts){
  if(!fact||!Object.hasOwn(labels,fact.field)||typeof fact.value!=='string'||placeholder(fact.value)||fact.field==='detail'&&/^\d+(?:[.,]\d+)?$/.test(compact(fact.value))||rows.some(row=>row.field===fact.field))continue;
  rows.push({field:fact.field,text:'• '+labels[fact.field]+': '+short(privateExcerpt(fact.value),fact.field==='locationContext'?240:135)});
  if(rows.length===4)break;
 }
 const literal=short(privateExcerpt(sourceText),230);
 const text=['Sandra, '+request.title.toLowerCase()+'.','Cliente …'+last4+(/^\d{4}$/.test(lineLast4||'')?' · línea …'+lineLast4:'')+'.',...rows.map(row=>row.text),literal?'Mensaje del cliente: «'+literal+'».':'',request.question,'María Ángel'].filter(Boolean).join('\n');
 return text.length<=1200?text:null;
}

function eventInScope(store,row,request){
 if(!row)return null;
 const e=store.open(row.body);
 return e?.id===row.id&&e.phone===request.phone&&e.line===request.line&&e.fromMe===false&&Number.isSafeInteger(e.at)&&e.at===row.at&&!e.forwarded&&!e.quotedId?e:null;
}

/** Read-only adapter. A missing or inconsistent source keeps the old fallback. */
export function ownMariaChiefQuestionText(store,config,request,extractLiteralFacts){
 try{return ownSourceText(store,config,request,extractLiteralFacts);}catch{return null;}
}
function ownSourceText(store,config,request,extractLiteralFacts){
 if(config.company!=='fumigacion'||store.company!=='fumigacion'||typeof extractLiteralFacts!=='function'||!Array.isArray(request.recipients)||request.recipients.length!==1||request.recipients[0]!==SANDRA||!request.caseId?.startsWith('fumigacion:'))return null;
 const state=store.conversation(request.phone)?.state;
 if(state?.caseId!==request.caseId)return null;
 const read=id=>store.db.prepare('SELECT rowid,id,at,body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(id,request.phone,request.line);
 const sourceRow=read(request.source),anchorRow=read(request.caseId.slice(11)),source=eventInScope(store,sourceRow,request),anchor=eventInScope(store,anchorRow,request);
 if(!source||!anchor||anchorRow.rowid>sourceRow.rowid||anchor.at>source.at)return null;
 let through=sourceRow;
 const handled=state.lastHandledSourceId&&read(state.lastHandledSourceId);
 if(handled&&eventInScope(store,handled,request)&&handled.rowid>through.rowid)through=handled;
 const parsedSources=new Map(),parsed=e=>{if(!parsedSources.has(e.id))parsedSources.set(e.id,extractLiteralFacts(e.text,'fumigacion'));return parsedSources.get(e.id);};
 const latest=through.id===source.id?source:eventInScope(store,through,request);
 const contradicted=(field,value)=>[source,latest].some(e=>e?.kind==='text'&&typeof parsed(e)?.[field]==='string'&&normalize(parsed(e)[field])!==normalize(value));
 const literalFor=field=>{
  const value=state.slots?.[field];if(typeof value!=='string'||!compact(value)||placeholder(value)||field==='detail'&&/^\d+(?:[.,]\d+)?$/.test(compact(value)))return null;
  // A verified old reference cannot overrule a literal correction in the
  // actual request or latest handled source. Omit the stale presentation only;
  // this formatter never resolves the conflict or rewrites the stored slots.
  if(contradicted(field,value))return null;
  const reference=state.intakeSources?.[field],refs=Array.isArray(reference?.sources)?reference.sources:reference?[reference]:[];
  if(field==='treatmentScope'&&reference?.guard===MARIA_TERMITE_FURNITURE_SCOPE_GUARD){
   const row=read(reference.sourceId),e=eventInScope(store,row,request),scope=e&&literalTermiteFurnitureScope(e);
   if(!e||e.kind!=='text'||reference.at!==e.at||row.rowid<anchorRow.rowid||row.rowid>through.rowid||e.at<anchor.at||e.at>through.at||scope?.guard!==reference.guard||scope.sourceId!==e.id||scope.at!==e.at||scope.literalScope!==value)return null;
   // A later explicit change or nonasserted mention cannot be overruled by
   // the old item reference. Only omit the presentation; retain all history.
   if([source,latest].some(current=>current?.kind==='text'&&current.id!==e.id&&termiteFurnitureMention(current)&&literalTermiteFurnitureScope(current)?.literalScope!==value))return null;
   return value;
  }
  const candidates=[source,...refs.flatMap(ref=>{
   const row=read(ref.sourceId),e=eventInScope(store,row,request);
   return e&&row.rowid>=anchorRow.rowid&&row.rowid<=through.rowid&&e.at>=anchor.at&&e.at<=through.at&&(ref.at===undefined||ref.at===e.at)?[e]:[];
  })].filter(e=>e.kind==='text'&&typeof e.text==='string');
  return candidates.some(e=>typeof parsed(e)?.[field]==='string'&&normalize(parsed(e)[field])===normalize(value)&&normalize(e.text).includes(normalize(value)))?value:null;
 };
 // Preserve the customer's scoped neighborhood and qualifiers, rather than
 // reducing a multipart answer to just its parsed city and room count. The
 // original spans must have the exact own native references for this case.
 const locationContext=(()=>{
  const parts=state.intakeLocationParts,ref=state.intakeSources?.locationDetails;
  if(!Array.isArray(parts)||!parts.length||parts.length>3||ref?.sourceCoverageComplete!==true||!Array.isArray(ref.sources)||ref.sources.length!==parts.length||parts.map(p=>p.text).join(' | ')!==state.slots?.locationDetails||state.slots?.location&&contradicted('location',state.slots.location))return null;
  const originals=[];
  for(const [i,part] of parts.entries()){
   if(typeof part.text!=='string'||!compact(part.text)||ref.sources[i]?.sourceId!==part.sourceId||ref.sources[i]?.at!==part.at)return null;
   const row=read(part.sourceId),e=eventInScope(store,row,request);
   if(!e||e.kind!=='text'||e.at!==part.at||row.rowid<anchorRow.rowid||row.rowid>through.rowid||e.at<anchor.at||e.at>through.at||!e.text.includes(part.text))return null;
   originals.push(e);
  }
  for(const field of ['rooms','area','mattresses']){const id=state.intakeSources?.[field]?.sourceId,row=id&&read(id),e=eventInScope(store,row,request);if(e&&e.at>=anchor.at&&e.at<=through.at)originals.push(e);}
  const projection=projectCurrentMariaLocationDetails(state,{phone:request.phone,line:request.line,at:through.at,sources:[anchor,...originals]});
  if(projection.review||!projection.locationDetails)return null;
  // A whole service request is already quoted below as the client's message.
  // Do not duplicate it under "location" merely because the intake retained
  // that source as location context. A pure location/neighborhood stays here.
  const pureLocationLabel=source.kind==='text'&&/^(?:barrio|sector|vereda|urbanizaci[oó]n|municipio|ciudad)\b[^\r\n.!?;¿]{0,100}[.!]?$/iu.test(source.text.trim());
  if(source.kind==='text'&&projection.locationDetails===source.text.trim()&&!pureLocationLabel&&typeof parsed(source)?.service==='string')return null;
  return projection.locationDetails.split(' | ').map(part=>short(part,75)).join(' | ');
 })();
 const facts=[],service=literalFor('service'),city=literalFor('location'),site=literalFor('site');
 if(service)facts.push({field:'service',value:service});
 if(locationContext)facts.push({field:'locationContext',value:city&&!normalize(locationContext).includes(normalize(city))?city+'; '+locationContext:locationContext});
 else if(city)facts.push({field:'location',value:city});
 if(site)facts.push({field:'site',value:site});
 const scope=[['rooms','Habitaciones'],['mattresses','Colchones'],['area','Área'],['dimensions','Medidas'],['treatmentScope','Alcance']].flatMap(([field,label])=>{const value=literalFor(field),itemScope=field==='treatmentScope'&&state.intakeSources?.[field]?.guard===MARIA_TERMITE_FURNITURE_SCOPE_GUARD;return value&&(itemScope||!locationContext||!normalize(locationContext).includes(normalize(value)))?[itemScope?value:label+': '+value]:[];});
 if(scope.length)facts.push({field:'scope',value:scope.join('; ')});
 if(facts.length<4){const value=literalFor('detail');if(value)facts.push({field:'detail',value});}
 return formatMariaChiefQuestion({topic:request.topic,kind:typeof request.conditions?.kind==='string'?request.conditions.kind:undefined,last4:request.phone.slice(-4),lineLast4:request.line.slice(-4),facts,sourceText:source.kind==='text'?source.text:''});
}
