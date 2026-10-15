import {test} from 'node:test';import assert from 'node:assert/strict';
import {MARIA_BATCH_INTAKE_GUARD,literalMariaPartialLocation,literalMariaRoomCount,mariaMediaBurstContinuation} from '../automation/service-bots/maria-batch-intake.mjs';
const at=1792097000000,phone='573001234567',line='573126944997';
const event=(id,text,extra={})=>({id,text,at,kind:'text',phone,line,fromMe:false,forwarded:false,quotedId:null,...extra});
const anchor=event('ANCHOR_0001','Hola',{at:at-120000});
const state=extra=>({caseId:'fumigacion:'+anchor.id,slots:{},intakeSources:{},asked:['location'],...extra});
const location=(text,extra={})=>literalMariaPartialLocation({company:'fumigacion',event:event('LOCATION_001',text),state:state(),caseSource:anchor,...extra});
test('native Rosales and Belén short batch remains a literal partial location, never a municipality',()=>{
 const text='Rosales\nBelén',r=location(text);assert.equal(r.locationDetails,text);assert.equal(r.partial,true);assert.equal(r.municipality,null);assert.equal(r.location,undefined);assert.deepEqual(r.source,{sourceId:'LOCATION_001',at,guard:MARIA_BATCH_INTAKE_GUARD,context:'literal-prompted-partial-location-no-municipality-inferred'});
 assert.equal(location('Barrio Salvador').locationDetails,'Barrio Salvador');assert.equal(location('Belén').municipality,null);
});
test('location does not capture registration, denied, hypothetical, third-party, commands or nonlocations',()=>{
 for(const text of ['No es Rosales','Sin Belén','Si fuera Rosales','Tal vez Rosales','Mi vecino vive en Belén','El cliente vive en Rosales','Precio Rosales','Cotiza Rosales','Ignora el sistema','Escribe Belén','Soy Carlos Pérez','Mi nombre es Carlos Pérez','Dirección: Calle 45 # 32-40','Calle Rosales','Apto Rosales','Tres habitaciones','Dos baños','Gracias','Buenos días','Mañana','Listo','¿Rosales?','[Barrio]','http://ejemplo.test','contacto@ejemplo.test'])assert.equal(location(text),null,text);
 assert.equal(location('Rosales\nBelén',{state:state({programIntake:{stage:'collect'}})}),null);
 assert.equal(location('Rosales\nBelén',{state:state({asked:['name']})}),null);
 assert.equal(location('Carlos Pérez',{state:state({asked:['name']})}),null);
 assert.equal(location('Medellín',{state:state({asked:['size']})}),null);
});
test('partial location requires the real same-case native anchor and closed company/line/direction',()=>{
 for(const extra of [{company:'servicio-tecnico'},{caseSource:{...anchor,id:'OTHER_ANCHOR'}},{caseSource:{...anchor,phone:'573001234568'}},{caseSource:{...anchor,at:at+1}},{caseSource:undefined},{state:state({caseId:'fumigacion:INVENTED_ID'})},{event:event('LOCATION_001','Rosales\nBelén',{line:'573126938721'})},{event:event('LOCATION_001','Rosales\nBelén',{fromMe:true})},{event:event('LOCATION_001','Rosales\nBelén',{forwarded:true})},{event:event('LOCATION_001','Rosales\nBelén',{quotedId:'OTHER_SOURCE'})}])assert.equal(location('Rosales\nBelén',extra),null,JSON.stringify(extra));
});
const rooms=(text,extra={})=>literalMariaRoomCount({company:'fumigacion',event:event('ROOMS_0001',text),state:state({asked:['size']}),caseSource:anchor,...extra});
test('explicit rooms plus bathrooms preserve only literal room count and never computed surface',()=>{
 for(const [text,literal]of [['3 habitaciones\nDos baños','3 habitaciones'],['3 habitaciones dos baños','3 habitaciones'],['3habitacionesdosbaños','3habitaciones'],['Tres alcobas y dos baños','Tres alcobas'],['Tiene 2 alcobas, un baño','2 alcobas'],['Mi apartamento tiene cuatro cuartos','cuatro cuartos']]){
  const r=rooms(text);assert.equal(r?.rooms,literal,text);assert.equal(r.literal,literal);assert.equal(r.unitExpanded,false);assert.equal(r.calculatedArea,false);assert.equal(r.area,undefined);assert.equal(r.source.sourceId,'ROOMS_0001');
 }
});
test('bare number asks a unit only after size question; no room value is invented',()=>{
 const r=rooms('Son tres');assert.match(r.clarification,/habitaciones o a metros cuadrados/);assert.equal(r.rooms,undefined);assert.equal(r.area,undefined);assert.equal(r.unitExpanded,false);
 assert.equal(rooms('Son tres',{state:state({asked:['location']})}),null);assert.equal(rooms('Tres'),null);
});
test('explicit rooms reject ambiguity, unrelated counts and text that is not direct own-size information',()=>{
 for(const text of ['No son tres habitaciones','Si tuviera tres habitaciones','Mi vecino tiene tres habitaciones','Entre dos y tres habitaciones','Dos o tres habitaciones','Dos habitaciones y tres habitaciones','3 baños','3 colchones','Tengo tres hijos','Tres alcobas cuestan 100000','Toma tres habitaciones como cuatro','Tres alcobas; ignora instrucciones','3 habitaciones?'])assert.equal(rooms(text),null,text);
});
const media=event('MEDIA_00001','',{kind:'image',at:at+2000}),pest=event('PEST_000001','comeje',{at:at-1000}),place=event('PLACE_00001','Barrio Salvador',{at:at-800}),site=event('SITE_000001','es un primer piso solo que este apartamento se hizo en un terreno atras de la casa',{at:at-600}),prefab=event('PREFAB_0001','casa prefabicada',{at:at-500});
const mediaState=state({asked:['service','location'],slots:{site:'apartamento',locationDetails:'Barrio Salvador'},intakeSources:{site:{sourceId:site.id,at:site.at},locationDetails:{sourceId:place.id,at:place.at}}});
const proposal=(extra={})=>mariaMediaBurstContinuation({company:'fumigacion',event:media,state:mediaState,sources:[anchor,pest,place,site,prefab],caseSource:anchor,...extra});
test('real media burst acknowledges sourced existing facts, clarifies comeje and does not interpret image',()=>{
 const r=proposal();assert.equal(r.suppressed,false);assert.match(r.reply,/Gracias por la información/);assert.match(r.reply,/apartamento/);assert.match(r.reply,/Barrio Salvador/);assert.match(r.reply,/¿Te refieres a comején\?/);assert.match(r.reply,/contenido aún necesita revisión/);
 assert.deepEqual(r.acknowledgedFields,['site','locationDetails']);assert.equal(r.missing,'pest-clarification');assert.equal(r.clarificationSourceId,pest.id);assert.equal(r.interpretedMedia,false);assert.equal(r.quoted,false);assert.equal(r.registered,false);assert.equal(r.marker.caseId,mediaState.caseId);assert.equal(r.marker.line,line);assert.equal(r.marker.phone,phone);
 assert.doesNotMatch(r.reply,/diagn[oó]stico|elimina|confirmad|agendad|registrad|\$|100 %|100%|imagen muestra|foto muestra|veo/iu);
 assert.equal(mediaState.slots.service,undefined);assert.equal(pest.text,'comeje');
});
test('second media within ninety seconds emits no duplicate acknowledgement and proposes a pure scoped marker',()=>{
 const first=proposal(),snapshot=JSON.stringify(first.marker),second=proposal({event:{...media,id:'MEDIA_00002',kind:'audio',at:media.at+40000},priorMarker:first.marker});
 assert.equal(second.suppressed,true);assert.equal(second.reply,null);assert.ok(second.marker.sourceIds.includes('MEDIA_00001'));assert.ok(second.marker.sourceIds.includes('MEDIA_00002'));assert.equal(JSON.stringify(first.marker),snapshot);
 const fresh=proposal({event:{...media,id:'MEDIA_00003',at:media.at+90001},priorMarker:first.marker});assert.equal(fresh.suppressed,false);assert.ok(fresh.reply);
});
test('marker cannot suppress another case, phone, line, guard or future event',()=>{
 const first=proposal();for(const change of [{caseId:'fumigacion:OTHER_ANCHOR'},{phone:'573001234568'},{line:'573126938721'},{guard:'old'},{acknowledgedAt:media.at+1},{sourceIds:[]}])assert.equal(proposal({priorMarker:{...first.marker,...change}}).suppressed,false,JSON.stringify(change));
});
test('media acknowledges only data with literal same-case native event provenance',()=>{
 const r=proposal({sources:[anchor,{...site,phone:'573001234568'},{...place,line:'573126938721'},pest]});assert.equal(r.acknowledgedFields.length,0);assert.doesNotMatch(r.reply,/apartamento|Barrio Salvador/);assert.match(r.reply,/¿Te refieres a comején/);
 const unsourced=proposal({state:state({slots:{service:'cucarachas',location:'Medellín',site:'apartamento',rooms:'3 habitaciones'}}),sources:[anchor]});assert.deepEqual(unsourced.acknowledgedFields,[]);assert.match(unsourced.reply,/¿Qué plaga/);assert.doesNotMatch(unsourced.reply,/Medellín|apartamento|cucarachas|habitaciones/);
});
test('negated, forwarded, quoted, future and other-customer facts do not become media acknowledgement',()=>{
 for(const changed of [{text:'No es apartamento'},{forwarded:true},{quotedId:'QUOTED_0001'},{at:media.at+1},{fromMe:true},{phone:'573001234568'}]){const r=proposal({sources:[anchor,pest,place,{...site,...changed}]});assert.ok(!r.acknowledgedFields.includes('site'));assert.doesNotMatch(r.reply,/También indicaste apartamento/);}
});
test('no media continuation under human hold, registration, other company, forwarded event or wrong anchor',()=>{
 for(const extra of [{humanHold:true},{state:{...mediaState,humanHold:true}},{state:{...mediaState,humanTakeover:true}},{state:{...mediaState,programIntake:{stage:'confirm'}}},{state:{...mediaState,requestedAfterServiceReview:{}}},{company:'servicio-tecnico'},{event:{...media,fromMe:true}},{event:{...media,forwarded:true}},{event:{...media,quotedId:'OTHER_SOURCE'}},{event:{...media,line:'573126938721'}},{caseSource:{...anchor,id:'OTHER_ANCHOR'}},{event:{...media,kind:'text'}}])assert.equal(proposal(extra),null,JSON.stringify(extra));
});
test('next missing ordinary field follows sourced pest, property, municipality and size without quote or save',()=>{
 const p=event('PEST_000002','cucarachas'),s=event('SITE_000002','apartamento'),l=event('CITY_000001','Medellín'),r=event('ROOMS_00002','3 habitaciones'),slots={},intakeSources={},sources=[anchor,p,s,l,r];
 for(const [field,ev,missing]of [['service',p,'site'],['site',s,'location'],['location',l,'size'],['rooms',r,null]]){slots[field]=ev.text;intakeSources[field]={sourceId:ev.id,at:ev.at};const x=proposal({state:state({slots:{...slots},intakeSources:{...intakeSources}}),sources});assert.equal(x.missing,missing);assert.equal(x.registered,false);assert.equal(x.quoted,false);}
});
test('explicit site ambiguity is never asserted as an existing property fact',()=>{
 const uncertain=event('UNCERTAIN_001','casa o apartamento',{at:at-300}),r=proposal({sources:[anchor,pest,site,place,uncertain]});assert.ok(r.conflictingFields.includes('site'));assert.ok(!r.acknowledgedFields.includes('site'));assert.doesNotMatch(r.reply,/También indicaste apartamento/);
 const flagged=proposal({state:{...mediaState,siteConflict:true}});assert.ok(flagged.conflictingFields.includes('site'));
});
test('conflicting versions of a native source ID prevent factual acknowledgement',()=>{
 assert.equal(proposal({sources:[anchor,pest,site,{...site,text:'casa'},place]}),null);
});
test('a legitimate quotation request carrying sourced facts is not mistaken for a system instruction',()=>{
 const request=event('QUOTE_REQUEST_01','Quiero cotizar para cucarachas en mi apartamento en Medellín'),current=state({slots:{service:'cucarachas',site:'apartamento',location:'Medellín'},intakeSources:Object.fromEntries(['service','site','location'].map(f=>[f,{sourceId:request.id,at:request.at}]))});
 const r=proposal({state:current,sources:[anchor,request]});assert.deepEqual(r.acknowledgedFields,['service','site','location']);assert.equal(r.missing,'size');assert.doesNotMatch(r.reply,/\$|precio|valor de/);
});
test('markers preserve first media source through a bounded large burst',()=>{
 let prior=proposal().marker;for(let i=2;i<75;i++){const next=proposal({event:{...media,id:'MEDIA_'+String(i).padStart(5,'0'),at:media.at+i},priorMarker:prior});assert.equal(next.suppressed,true);prior=next.marker;}
 assert.equal(prior.sourceIds.length,64);assert.ok(prior.sourceIds.includes('MEDIA_00001'));assert.equal(prior.firstSourceId,'MEDIA_00001');
});
