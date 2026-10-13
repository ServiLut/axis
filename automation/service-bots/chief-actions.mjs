import {createHash} from 'node:crypto';
import {SANDRA,normalize,knownInternalRecipient} from './config.mjs';
import {operationalLineAllowed,operationalCoverage} from './line-scope.mjs';
import {intakeAudit} from './intake-journal.mjs';
import {whatsAppCallActivity} from './chief-readonly.mjs';
import {chiefStatusTopic} from './chief-status.mjs';
import {dailyProgramCross,programSupervisionStatus} from './program-supervision.mjs';
import {bogotaDayWindow,dailyOperationalReportText} from './daily-operational-audit.mjs';
import {MARIA_PROGRAM_URL,MARIA_TENANT,MARIA_COMPANY,programEnabled,registrationStatus} from './maria-program.mjs';
import {planChiefCommand,CHIEF_COMMAND_AI_GUARD} from './chief-command-ai.mjs';

export const CHIEF_ACTIONS_GUARD='own-native-directed-chief-durable-command-and-verified-result-v1';
export const CHIEF_CONVERSATION_RULE_GUARD='own-native-chief-versioned-conversation-rules-only-v1';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const dayAt=at=>new Date(at-5*3600000).toISOString().slice(0,10);
const actions=new Set(['whatsapp-counts','whatsapp-list','whatsapp-calls','program-day','program-contacts','own-receipt','release-one','learn-conversation','unsupported']);
const tableExists=s=>Boolean(s.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chief_commands'").get());
const sourceKey=e=>'chief-command:'+e.id;
const forbiddenReference=text=>/["“”«»]|\b(?:dijo|dice|escribio|comento|segun|me dijeron|un tercero|que harias|si te digo|supongamos|hipotetic\w*|no ejecutes|no hagas|no retomes|no liberes)\b/.test(normalize(text));
function resolvedDay(body,at){
 const match=body.match(/\b\d{4}-\d{2}-\d{2}\b/),today=dayAt(at);
 if(/\b(?:manana|proxim\w*|semana|semanas|mes|meses|desde|hasta|entre|lunes|martes|miercoles|jueves|viernes|sabado|domingo|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/.test(normalize(body))||[...body.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].length>1||/\bhoy\b/.test(normalize(body))&&/\bayer\b/.test(normalize(body)))return null;
 const day=match?.[0]??(/\bayer\b/.test(normalize(body))?dayAt(at-86400000):today);
 try{bogotaDayWindow(day);if(day>today)return null;}catch{return null;}return day;
}
function ownSource(e,c){return c.company==='fumigacion'&&e?.phone===SANDRA&&e.fromMe===false&&e.forwarded!==true&&e.kind==='text'&&typeof e.text==='string'&&e.text.length<=6000&&c.lines?.some(l=>l.phone===e.line)&&operationalLineAllowed(c,e.line)&&Number.isFinite(e.at);}
function communicationCategory(text){
 const t=normalize(text);
 if(text.length>600||/[\n]|https?:\/\/|\b\d{5,}\b|\b(?:precios?|tarifas?|descuentos?|garantias?|gratis|pagos?|bancos?|productos?|veneno|plaguicida|toxic\w*|inocuo|proteccion|tecnicos?|horarios?|credenciales?|tokens?|clave|contrasena|envia a|manda a|reenvia\w*|libera|retoma|cambia|borra|elimina|ignora|omite|obedece|instrucciones|reglas anteriores|sistema|prompt|politicas?|psicologos|abogados|permisos?|autoriz\w*|verific\w*|remitente|identidad|audios?|transcrip\w*|ejecut\w*|autonom\w*|automat\w*|guardias?)\b|segur[oa]s? para/.test(t))return null;
 if(/\b(?:breve|cort[oa]s?|concis[oa]|amable|respetuos[oa]|calid[oa]|tono|comunicacion)\b/.test(t))return 'tone';
 if(/\b(?:no repetir|sin repetir|datos (?:ya |que .*ya )?(?:dio|aportados|indicados)|solo (?:los )?datos (?:que )?faltan|datos faltantes)\b/.test(t))return 'intake-communication';
 if(/\b(?:privacidad|datos personales|no divulgar|no revelar|pasos internos)\b/.test(t))return 'privacy-communication';
 return null;
}
export function parseChiefCommand(e,c,{quotedOwn=false}={}){
 if(!ownSource(e,c))return null;
 if(/^(?:maria angel|mariangel|maria|bot)\s+(?:dijo|dice|respondio|comento|me dijo|le dijo)\b/.test(normalize(e.text)))return null;
 const directed=/^[¿¡ ]*(?:(?:hola|buenos dias|buen dia|buenas tardes|buenas noches)[, :]+)?(?:maria angel|mariangel|maria|bot)(?:[, :¿?!]|$)/i.exec(normalize(e.text));
 if(!directed&&!quotedOwn)return null;
 const body=directed?e.text.slice(directed[0].length).trim():e.text.trim(),t=normalize(body).replace(/^[¿¡]+|[?!.]+$/g,'').trim();
 const plan=(action,params={})=>({action,params,body,directed:Boolean(directed),guard:CHIEF_ACTIONS_GUARD});
 if(!t)return plan('unsupported',{reason:'MISSING_COMMAND'});
 if(forbiddenReference(body)||/^(?:no|nunca|si|quizas|tal vez|en caso de)\b/.test(t))return plan('unsupported',{reason:'NONASSERTED_COMMAND'});
 if(/\b(?:abogados|psicologos|servicio tecnico|s\.tecnico)\b/.test(t))return plan('unsupported',{reason:'FOREIGN_COMPANY'});
 if(chiefStatusTopic(body)||/^(?:gracias|muchas gracias|estas (?:ahi|activa|funcionando|disponible)|sigues ahi|que (?:funciones )?puedes (?:hacer|realizar)(?: en este momento)?|que sabes hacer|como puedes ayudarme)[.! ]*$/.test(t))return null;
 const release=/^retoma (?:el )?chat (?:de )?(?:\+)?(57\d{10})(?:[, ]+por favor)?$/.exec(t);
 if(release)return plan('release-one',{phone:release[1]});
 if(/\b(?:retoma|libera|elimina|borra|paga|cobra|cancela|crea|registra|asigna|programa)\b/.test(t)&&!/^\b(?:revisa|consulta|muestrame|dime|dame|enviame|pasame|verifica|cuantos|cuantas|necesito|quiero)\b/.test(t))return plan('unsupported',{reason:'ACTION_OUTSIDE_CURRENT_ACCESS'});
 const learning=/^(?:aprende(?: a| que)?|recuerda(?: que)?|desde ahora[, :]*)\s+(.+)$/.exec(t);
 if(learning){const original=body.match(/^(?:aprende(?: a| que)?|recuerda(?: que)?|desde ahora[, :]*)\s+(.+)$/iu)?.[1]??body;const category=communicationCategory(original);return category?plan('learn-conversation',{text:original,category}):plan('unsupported',{reason:'RULE_OUTSIDE_CONVERSATION_SCOPE'});}
 const day=resolvedDay(body,e.at);if(!day)return plan('unsupported',{reason:'INVALID_OR_FUTURE_DAY'});
 if(/\b(?:y|ademas|luego)\s+(?:elimina|borra|paga|cobra|cancela|crea|registra|asigna|retoma|libera|envia a|manda a)\b|\b(?:dile a|envia a|manda a|reenvia a|todos los chats)\b/.test(t))return plan('unsupported',{reason:'COMBINED_OR_OTHER_RECIPIENT_ACTION'});
 if(/\b(?:listado|lista)\b/.test(t)&&/\b(?:whatsapps?|telefonos|numeros|contactos|chats)\b/.test(t)&&/\b(?:whatsapp|lineas|recibidos|entrantes|entraron|recibimos)\b/.test(t))return plan('whatsapp-list',{day});
 if(/\b(?:cuantos|numero|conteo|cantidad)\b/.test(t)&&/\b(?:whatsapps?|chats|mensajes|contactos)\b/.test(t)&&/\b(?:recibimos|recibidos|recibiste|entraron|han entrado|entrantes|lineas|whatsapp)\b/.test(t))return plan('whatsapp-counts',{day});
 if(/\b(?:cuantas|numero|conteo|cantidad)\b/.test(t)&&/\bllamadas\b/.test(t)&&/\b(?:whatsapp|lineas)\b/.test(t))return plan('whatsapp-calls',{day});
 const code=/\b(?:recibo|orden|servicio)\s*(?:n[ºo°.]?\s*)?([a-f0-9]{8}(?:-[a-f0-9-]{27})?)\b/i.exec(body)?.[1]?.toUpperCase();
 if(code&&/^(?:revisa|consulta|verifica|muestrame|dime|estado)\b/.test(t))return plan('own-receipt',{orderCode:code});
 if(/\b(?:tenaxis|programa)\b/.test(t)&&/\b(?:telefono|telefonos|contacto|contactos|cliente|clientes)\b/.test(t)){
  const phones=[...new Set(body.match(/\b57\d{10}\b/g)||[])];return phones.length&&phones.length<=10?plan('program-contacts',{phones}):plan('unsupported',{reason:'MISSING_OR_TOO_MANY_CANONICAL_PHONES'});
 }
 if(/\b(?:tenaxis|programa)\b/.test(t)&&/\b(?:revisa|consulta|verifica|muestrame|dime|dame|enviame|pasame|cruza|compara)\b/.test(t)&&/\b(?:servicios|ordenes|dia|diario|cruce|programa)\b/.test(t))return plan('program-day',{day});
 // This literal request marker controls precedence only. It cannot select a
 // tool or parameters; the verified closed planner and read executor do that.
 const sourceReadIntent=/^(?:hazme (?:un|el) (?:balance|resumen|reporte|informe)|(?:quisiera|necesito|quiero) (?:saber|conocer)|(?:podrias|puedes|me puedes|me podrias)(?: por favor)? (?:(?:informar|mostrar|decir)(?:me)?|consultar|revisar|hacer (?:un|el) (?:balance|resumen|reporte|informe)))\b/.test(t);
 return {...plan('unsupported',{reason:'NO_SUPPORTED_COMMAND',modelEligible:true}),sourceReadIntent};
}
function initialize(s,c){if(c.company!=='fumigacion'||s.company!==c.company)throw Error('CHIEF_ACTION_OWN_SCOPE');s.db.exec("CREATE TABLE IF NOT EXISTS chief_commands(id TEXT PRIMARY KEY,source_id TEXT UNIQUE NOT NULL,line TEXT NOT NULL,source_at INTEGER NOT NULL,action TEXT NOT NULL,params_hash TEXT NOT NULL,body TEXT NOT NULL,result TEXT,state TEXT NOT NULL,created INTEGER NOT NULL,updated INTEGER NOT NULL)");}
export function enqueueChiefCommand(s,c,e,plan){
 if(!ownSource(e,c)||!actions.has(plan?.action))throw Error('CHIEF_COMMAND_SOURCE_REQUIRED');initialize(s,c);
 const id=sourceKey(e),existing=s.db.prepare('SELECT state,params_hash,body FROM chief_commands WHERE id=?').get(id),digest=hash({action:plan.action,params:plan.params,source:e});
 if(existing){if(existing.params_hash!==digest)throw Error('CHIEF_COMMAND_SOURCE_CONFLICT');return {id,status:existing.state,created:false};}
 s.db.prepare('INSERT INTO chief_commands VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,e.id,e.line,e.at,plan.action,digest,s.seal({source:e,plan}),null,'PENDING',Date.now(),Date.now());s.audit('CHIEF_COMMAND_QUEUED',e.id,{id,action:plan.action,paramsHash:digest,guard:CHIEF_ACTIONS_GUARD});return {id,status:'PENDING',created:true};
}
export function chiefActionsStatus(s,c){
 if(c.company!=='fumigacion'||s.company!==c.company)return {guard:null,enabled:false};
 const states=tableExists(s)?s.db.prepare('SELECT state,COUNT(*) n FROM chief_commands GROUP BY state').all():[];
 return {guard:CHIEF_ACTIONS_GUARD,enabled:Boolean(c.enabled||c.chiefOnly),states:Object.fromEntries(states.map(r=>[r.state,r.n])),historicalReviewAutoExecuted:false,businessWritesEnabled:false,communicationMemory:chiefConversationRules(s,c).rules.length};
}
export function reviewChiefActions(s,c,{afterRow=0,limit=50}={}){
 if(c.company!=='fumigacion'||s.company!==c.company||!Number.isSafeInteger(afterRow)||afterRow<0||!Number.isSafeInteger(limit)||limit<1||limit>50)throw Error('CHIEF_COMMAND_REVIEW_SCOPE');
 const rows=tableExists(s)?s.db.prepare('SELECT rowid,* FROM chief_commands WHERE rowid>? ORDER BY rowid LIMIT ?').all(afterRow,limit):[];
 const commands=rows.map(r=>{const b=s.open(r.body),result=r.result?s.open(r.result):null,responseIds=result?.responseIds??[];return {row:r.rowid,id:r.id,sourceId:r.source_id,line:r.line,sourceAt:new Date(r.source_at).toISOString(),action:r.action,params:b.plan.params,status:r.state,result,error:result?.error??null,responseIds,delivery:responseIds.map(id=>s.db.prepare('SELECT id,state,mid FROM outbox WHERE id=?').get(id)).filter(Boolean)};});
 const nextRow=rows.at(-1)?.rowid??afterRow,remaining=tableExists(s)?s.db.prepare('SELECT COUNT(*) n FROM chief_commands WHERE rowid>?').get(nextRow).n:0;return {guard:CHIEF_ACTIONS_GUARD,company:'FUMIGACION',commands,afterRow,nextRow,remaining,readOnly:true};
}
export function chiefConversationRules(s,c){
 if(c.company!=='fumigacion'||s.company!==c.company)return {guard:null,version:null,rules:[],modelTrainingPerformed:false};
 const rows=s.db.prepare("SELECT value FROM meta WHERE key LIKE 'chief-conversation-rule:%' ORDER BY rowid").all(),latest=new Map();
 for(const row of rows){const r=s.open(row.value);if(r.guard===CHIEF_CONVERSATION_RULE_GUARD&&r.company==='FUMIGACION'&&r.sender===SANDRA&&communicationCategory(r.text)===r.category)latest.set(r.category,r);}
 const rules=[...latest.values()].map(r=>({id:r.id,text:r.text,sourceId:r.sourceId,line:r.line,at:r.at,scope:'FUMIGACION-conversation-only'}));return {guard:CHIEF_CONVERSATION_RULE_GUARD,version:hash(rules),rules,modelTrainingPerformed:false};
}
function splitReply(text){const parts=[];let current='';for(const line of text.split('\n')){if(current.length+line.length+1>4800){if(current)parts.push(current);current='';}if(line.length>4800)throw Error('CHIEF_RESULT_LINE_TOO_LONG');current+=(current?'\n':'')+line;}if(current)parts.push(current);return parts;}
function finishCommand(s,row,state,result){
 s.tx(()=>{const current=s.db.prepare('SELECT state FROM chief_commands WHERE id=?').get(row.id);if(current?.state!=='RUNNING')return;const responseIds=[];
  for(const [index,text] of splitReply(result.text).entries()){const id=row.id+':result:'+index;s.queue(id,SANDRA,row.line,text,true,0);responseIds.push(id);}
  const recorded={...result,responseIds};s.db.prepare('UPDATE chief_commands SET state=?,result=?,updated=? WHERE id=?').run(state,s.seal(recorded),Date.now(),row.id);s.audit('CHIEF_COMMAND_RESULT',row.source_id,{id:row.id,action:row.action,state,resultHash:hash(recorded),guard:CHIEF_ACTIONS_GUARD,businessWrites:0});
 });
}
async function programRequest(c,t,path,body,ownReceipt=false){
 const p=ownReceipt?c.mariaProgram:c.programSupervision;
 if(ownReceipt?!programEnabled(c):!programSupervisionStatus(c).enabled)throw Error('PROGRAM_ACCESS_UNAVAILABLE');
 const expected=ownReceipt?MARIA_PROGRAM_URL:MARIA_PROGRAM_URL+'/operational-audit';if(p.url!==expected||typeof t.fetcher!=='function')throw Error('PROGRAM_ACCESS_UNAVAILABLE');
 const response=await t.fetcher(expected+path,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+p.token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('PROGRAM_READ_FAILED');const raw=await response.json(),data=raw?.success===true?raw.data:raw;
 if((ownReceipt?!programEnabled(c):!programSupervisionStatus(c).enabled)||c[ownReceipt?'mariaProgram':'programSupervision']!==p||data?.company!=='FUMIGACION'||data.tenantId!==MARIA_TENANT||data.companyId!==MARIA_COMPANY||data.advisorMembershipId!==p.actorId||data.readOnly!==true||data.businessWritesEnabled===true||data.customerNotesWritesEnabled===true)throw Error('PROGRAM_READ_SCOPE_UNVERIFIED');return data;
}
function unsupportedText(reason){return ({MISSING_COMMAND:'Sandra, necesito la consulta o instrucción concreta que quieres que ejecute.',NONASSERTED_COMMAND:'Sandra, ese texto cita, niega o plantea una acción hipotética; no ejecuté cambios.',FOREIGN_COMPANY:'Sandra, este asesor sólo puede consultar sus fuentes de Fumigación.',INVALID_OR_FUTURE_DAY:'Sandra, necesito una fecha válida que no sea futura para hacer ese cruce.',MISSING_OR_TOO_MANY_CANONICAL_PHONES:'Sandra, necesito entre uno y diez teléfonos completos con 57 para consultar esos contactos.',RULE_OUTSIDE_CONVERSATION_SCOPE:'Sandra, puedo recordar pautas de comunicación. Esta instrucción requiere una regla específica con su fuente y alcance antes de aplicarla.',COMBINED_OR_OTHER_RECIPIENT_ACTION:'Sandra, ese mensaje combina una lectura con otra acción o destinatario; no ejecuté esa combinación.',ACTION_OUTSIDE_CURRENT_ACCESS:'Sandra, mi acceso actual no permite modificar pagos, agenda, técnicos, precios ni órdenes existentes.'})[reason]??'Sandra, puedo consultar entradas y llamadas observadas, cruzar un día con Tenaxis, revisar hasta diez teléfonos, consultar mis recibos y recordar pautas de comunicación. Necesito identificar cuál de esas acciones me pides.';}
const fieldValue=value=>value===null||value===undefined||value===''?'sin dato':String(value).replace(/[\r\n]+/g,' ').slice(0,220);
const requestedFields=plan=>/\b(?:formulario|campos|datos|nombre|direccion|municipio|observacion|observaciones)\b/.test(normalize(plan.body));
function contactFormText(a){
 return a.orders.map(o=>{const customer=a.clients.find(c=>c.id===o.clientId),snapshot=o.orderSnapshot??{},address=o.currentAddress;
  return 'Orden '+fieldValue(o.id)+': cliente '+fieldValue([customer?.name?.nombre,customer?.name?.apellido].filter(Boolean).join(' '))+'; dirección guardada en orden: '+fieldValue(snapshot.address)+'; municipio: '+fieldValue(snapshot.municipality)+'; barrio: '+fieldValue(snapshot.neighborhood)+'; tipo de visita: '+fieldValue(o.typeVisit)+'. Dirección actual del cliente: '+fieldValue(address?.address)+'; municipio actual: '+fieldValue(address?.municipality)+'; tipo de ubicación: '+fieldValue(address?.type)+'. Observación (extracto máximo 220 caracteres): '+fieldValue(o.observations)+'.';
 }).join('\n');
}
async function execute(s,c,t,source,plan,now){
 const {action,params}=plan;
 if(action==='unsupported')return {state:'NEEDS_CONTEXT',text:unsupportedText(params.reason),data:{reason:params.reason},scope:'own-current-capabilities'};
 if(action==='release-one'){
  const exists=s.db.prepare('SELECT 1 FROM conversations WHERE phone=?').get(params.phone),ownIncoming=s.db.prepare('SELECT body FROM events WHERE phone=? AND from_me=0 ORDER BY rowid DESC LIMIT 100').all(params.phone).some(row=>{const e=s.open(row.body);return e.phone===params.phone&&e.fromMe===false&&!e.forwarded&&c.lines.some(l=>l.phone===e.line)&&operationalLineAllowed(c,e.line)&&Number.isFinite(e.at)&&e.at>=c.activatedAt;});
  const laterStaff=s.db.prepare('SELECT id,line FROM events WHERE phone=? AND from_me=1 AND at>=? ORDER BY rowid').all(params.phone,source.at).some(e=>!s.db.prepare("SELECT 1 FROM outbox WHERE mid=? AND phone=? AND line=? AND state IN ('ACCEPTED','DELIVERED','READ')").get(e.id,params.phone,e.line));
  if(!c.enabled||knownInternalRecipient(params.phone)||!exists||!ownIncoming||laterStaff||now-source.at>600000)return {state:'BLOCKED',text:'Sandra, no devolví ese chat: necesito un contacto propio existente y una devolución directa vigente que sea posterior a la última intervención del personal.',data:{released:false},scope:'single-own-existing-contact'};
  s.hold(params.phone,source.id,false);return {state:'DONE',text:'Sandra, el chat '+params.phone+' quedó devuelto al bot para el próximo mensaje.',data:{released:true,phone:params.phone},scope:'single-own-existing-contact'};
 }
 if(action==='learn-conversation'){
  if(communicationCategory(params.text)!==params.category)throw Error('CONVERSATION_RULE_SCOPE_UNVERIFIED');
  const rule={id:hash({sourceId:source.id,category:params.category,text:params.text}),guard:CHIEF_CONVERSATION_RULE_GUARD,company:'FUMIGACION',sender:SANDRA,sourceId:source.id,line:source.line,at:source.at,category:params.category,text:params.text,scope:'FUMIGACION-conversation-only'};
  s.db.prepare('INSERT OR IGNORE INTO meta(key,value) VALUES(?,?)').run('chief-conversation-rule:'+rule.id,s.seal(rule));s.audit('CHIEF_CONVERSATION_RULE_LEARNED',source.id,{ruleId:rule.id,category:rule.category,guard:rule.guard,modelTrainingPerformed:false});return {state:'DONE',text:'Sandra, guardé esta pauta de comunicación y la incorporaré al contexto de mis próximas respuestas.',data:{ruleId:rule.id,version:chiefConversationRules(s,c).version,modelTrainingPerformed:false},scope:rule.scope};
 }
 if(['whatsapp-counts','whatsapp-list'].includes(action)){
  let page,afterRow=0,traversed=0;const nativeRows=[];
  for(let i=0;i<200;i++){page=intakeAudit(s,c,{day:params.day,afterRow,limit:500});nativeRows.push(...page.sources);traversed++;if(!page.remaining)break;if(page.nextRow<=afterRow)throw Error('INTAKE_PAGINATION_UNVERIFIED');afterRow=page.nextRow;}
  const complete=page.remaining===0,contacts=page.contacts,unique=new Set(contacts.map(r=>r.phone)).size;
  const details=page.lines.map(l=>'Línea '+l.phone.slice(-4)+': '+l.receivedContacts+' contactos y '+l.receivedMessages+' mensajes recibidos.').join('\n');
  let text='Sandra, registros del '+params.day+' de Colombia: '+unique+' teléfonos distintos.\n'+details+'\nSon entradas observadas desde la instalación del registro; no equivalen a ventas ni al total garantizado de WhatsApp.';
  if(page.coverage.suspendedLines?.length)text+=' La línea '+page.coverage.suspendedLines.map(p=>p.slice(-4)).join(' y ')+' sigue suspendida y su cobertura es parcial.';
  if(!complete)text+=' La lectura alcanzó el límite del registro y quedan fuentes por revisar; este resultado permanece parcial.';
  if(action==='whatsapp-list')text+='\n'+page.lines.map(l=>'Línea '+l.phone.slice(-4)+':\n'+(contacts.filter(r=>r.line===l.phone).map(r=>r.phone).join('\n')||'Sin teléfonos verificados en este registro.')).join('\n');
  return {state:complete?'DONE':'NEEDS_CONTEXT',text,data:{day:params.day,uniqueContacts:unique,lines:page.lines,contacts:action==='whatsapp-list'?contacts:undefined,coverage:{...page.coverage,journalPagesTraversed:traversed,journalSourceTraversalComplete:complete,remaining:page.remaining},sources:nativeRows},scope:'authenticated-own-intake-journal; partial-WhatsApp-coverage'};
 }
 if(action==='whatsapp-calls'){
  const when=Date.parse(params.day+'T05:00:00Z')+Math.min(86399999,Math.max(0,now-Date.parse(params.day+'T05:00:00Z'))),a=whatsAppCallActivity(s,c,when);
  return {state:'DONE',text:'Sandra, para el '+params.day+' tengo '+a.observedCallRecords+' registros de llamadas observados ('+a.lines.map(l=>'línea '+l.phone.slice(-4)+': '+l.observedCallRecords).join('; ')+'). El historial es parcial; no confirma el total real, entradas, salidas, llamadas contestadas ni duración. No representa cero llamadas reales cuando faltan fuentes.',data:a,scope:a.coverage};
 }
 if(action==='program-day'){
  const fetcher=async(...args)=>{const response=await t.fetcher(...args);if(!response.ok)return response;const raw=await response.json(),data=raw?.success===true?raw.data:raw;if(!programSupervisionStatus(c).enabled||data?.readOnly!==true||data.businessWritesEnabled===true||data.customerNotesWritesEnabled===true)throw Error('PROGRAM_READ_SCOPE_UNVERIFIED');return {ok:true,status:response.status,json:async()=>raw};};
  const a=await dailyProgramCross(c,s,fetcher,{company:'fumigacion',day:params.day},now);return {state:a.programReviewReason?'NEEDS_CONTEXT':'DONE',text:dailyOperationalReportText(a),data:a,scope:'own-day-journal-and-authorized-readonly-Tenaxis'};
 }
 if(action==='program-contacts'){
  const phones=params.phones;if(!Array.isArray(phones)||!phones.length||phones.length>10||phones.some(p=>!/^57\d{10}$/.test(p)))throw Error('PROGRAM_PHONE_SCOPE_UNVERIFIED');
  const a=await programRequest(c,t,'/contact-details',{phones});if(a.detailsGuard!=='own-current-phone-matched-fields-scoped-readonly-v1'||a.scheduleReadGuard!=='explicit-calendar-and-bogota-time-preserving-raw-fields-v1'||a.businessWritesEnabled!==false||!Array.isArray(a.clients)||!Array.isArray(a.searchedContacts)||!Array.isArray(a.orders)||a.searchedContacts.length!==phones.length||a.searchedContacts.some(r=>!phones.includes(r.phone))||new Set(a.searchedContacts.map(r=>r.phone)).size!==phones.length)throw Error('PROGRAM_PHONE_SCOPE_UNVERIFIED');
  const clientIds=new Set(a.searchedContacts.flatMap(r=>r.clientIds??[])),orderIds=new Set(a.searchedContacts.flatMap(r=>r.orderIds??[]));
  if(a.clients.some(r=>!clientIds.has(r.id))||a.orders.some(o=>!clientIds.has(o.clientId)||!orderIds.has(o.id)||o.currentAddress&&(o.currentAddress.id!==o.addressId||o.currentAddress.clientId!==o.clientId)))throw Error('PROGRAM_PHONE_SCOPE_UNVERIFIED');
  const lines=a.searchedContacts.map(r=>r.phone+': '+(r.identityAmbiguous?'identidad ambigua; requiere contraste.':r.orderIds?.length?r.orderIds.length+' registros encontrados.':'Sin coincidencia en los campos de teléfono consultados; no acredita ausencia de servicio.'));
  const states=a.orders.map(o=>String(o.id)+' · estado '+String(o.state??'sin dato')+(o.quoteValueCop!==null&&o.quoteValueCop!==undefined?' · cotización '+o.quoteValueCop+' COP':'')+(o.schedule?.granularity==='DATE_ONLY'?' · fecha registrada sin hora confirmada: '+String(o.schedule.fechaVisita):o.schedule?.timeKnown===true&&o.schedule?.granularity==='DATETIME'?' · fecha y hora registradas: '+String(o.schedule.scheduledAt):o.schedule?.granularity==='CONFLICT'?' · programación con campos contradictorios':' · sin fecha/hora completas verificadas')).join('\n');
  const fields=requestedFields(plan)?contactFormText(a):'';
  return {state:a.coverage?.complete===true?'DONE':'NEEDS_CONTEXT',text:'Sandra, consulta de Tenaxis:\n'+lines.join('\n')+(states?'\n'+states:'')+(fields?'\n'+fields:'')+'\nLa coincidencia de teléfono y el estado del programa no acreditan ejecución, pago ni un servicio omitido; nombres, alias e historia pueden requerir revisión.'+(a.coverage?.complete===true?'':' La cobertura devuelta es parcial.'),data:a,scope:'own-readonly-canonical-phone-field-search-and-current-details'};
 }
 if(action==='own-receipt'){
  const entries=s.db.prepare("SELECT value FROM meta WHERE key LIKE 'maria-registration:%'").all().map(r=>s.open(r.value));
  const found=entries.filter(x=>x.status==='SAVED'&&x.receipt?.persisted===true&&x.receipt?.company==='FUMIGACION'&&x.receipt.tenantId===MARIA_TENANT&&x.receipt.companyId===MARIA_COMPANY&&x.receipt.advisorMembershipId===c.mariaProgram?.actorId&&x.receipt.createdById===c.mariaProgram?.actorId&&x.receipt.caseId===x.payload?.caseId&&x.receipt.acceptanceId===x.payload?.quote?.acceptanceId&&x.receipt.requestHash===x.requestHash&&x.receipt.phone===x.payload?.phone&&((params.orderCode&&x.receipt.orderId?.toUpperCase().startsWith(params.orderCode))||(params.orderId&&x.receipt.orderId===params.orderId)||(params.receiptCaseId&&x.payload.caseId===params.receiptCaseId&&x.payload.quote.acceptanceId===params.receiptAcceptanceId)));
  if(found.length!==1)return {state:'NEEDS_CONTEXT',text:'Sandra, no tengo un recibo propio inequívoco vinculado a ese identificador. No puedo atribuirme ni modificar otra orden.',data:{available:false},scope:'own-persisted-receipt-only'};
  const entry=found[0],a=await programRequest(c,t,'/receipt/current-fields',{caseId:entry.payload.caseId,acceptanceId:entry.payload.quote.acceptanceId},true);
  if(a.currentFieldsGuard!=='own-persisted-receipt-current-fields-readonly-v1'||a.available!==true||a.persisted!==true||a.immutableReceipt?.orderId!==entry.receipt.orderId||a.immutableReceipt?.caseId!==entry.payload.caseId||a.immutableReceipt?.acceptanceId!==entry.payload.quote.acceptanceId||a.immutableReceipt?.requestHash!==entry.requestHash||a.immutableReceipt.originalPhone!==entry.payload.phone||a.immutableReceipt.sourceLine!==entry.payload.line)throw Error('PROGRAM_RECEIPT_SCOPE_UNVERIFIED');
  const o=a.currentRecords?.order,customer=a.currentRecords?.customer,address=a.currentRecords?.address;if(!o||o.id!==entry.receipt.orderId||o.createdBy!==c.mariaProgram.actorId||!customer||o.customerId!==customer.id||address&&(address.id!==o.addressId||address.customerId!==customer.id))throw Error('PROGRAM_RECEIPT_SCOPE_UNVERIFIED');
  const fields=requestedFields(plan)?' Nombre actual: '+fieldValue(customer.name)+'. Dirección guardada en orden: '+fieldValue(o.address)+'; municipio: '+fieldValue(o.municipality)+'; barrio: '+fieldValue(o.neighborhood)+'. Dirección actual del cliente: '+fieldValue(address?.address)+'; tipo de ubicación: '+fieldValue(address?.type)+'. Observación (extracto máximo 220 caracteres): '+fieldValue(o.observations)+'.':'';
  return {state:'DONE',text:'Sandra, recibo propio '+entry.receipt.orderId.slice(0,8).toUpperCase()+': estado actual '+o.state+'. Valor cotizado registrado: '+o.value+' COP. '+(o.technicianId?'Hay un identificador de técnico registrado.':'No hay técnico registrado.')+' '+(o.scheduledDate?'Fecha registrada: '+o.scheduledDate+'. La hora debe verificarse por separado.':'No hay fecha programada registrada.')+fields+' Esta lectura no acredita ejecución ni pago.',data:a,scope:'own-persisted-receipt-current-fields-readonly'};
 }
 throw Error('CHIEF_ACTION_NOT_SUPPORTED');
}
export async function drainChiefActions(s,c,t,{now=Date.now()}={}){
 if(c.company!=='fumigacion'||s.company!==c.company||!tableExists(s))return {processed:0,completed:0,blocked:0,uncertain:0};
 const result={processed:0,completed:0,blocked:0,uncertain:0};
 const running=s.db.prepare("SELECT id,source_id FROM chief_commands WHERE state='RUNNING'").all();for(const old of running){s.db.prepare("UPDATE chief_commands SET state='UNCERTAIN',updated=? WHERE id=? AND state='RUNNING'").run(now,old.id);s.audit('CHIEF_COMMAND_INTERRUPTED_UNCERTAIN',old.source_id,{id:old.id,automaticallyRetried:false});result.uncertain++;}
 for(const row of s.db.prepare("SELECT * FROM chief_commands WHERE state='PENDING' ORDER BY rowid LIMIT 2").all()){
  const reserved=s.db.prepare("UPDATE chief_commands SET state='RUNNING',updated=? WHERE id=? AND state='PENDING'").run(now,row.id);if(!reserved.changes)continue;result.processed++;
  const body=s.open(row.body),source=body.source;
  try{
   const native=typeof t.verifyChiefCommandSource==='function'?await t.verifyChiefCommandSource(source):null;
   const current=s.db.prepare('SELECT body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(source.id,SANDRA,source.line),stored=current&&s.open(current.body);
   if(!ownSource(source,c)||!stored||hash(stored)!==hash(source)||!native||native.verified!==true||native.sourceId!==source.id||native.phone!==SANDRA||native.line!==source.line||native.at!==source.at||now-source.at>86400000)throw Error('CHIEF_NATIVE_SOURCE_UNVERIFIED');
   let plan=body.plan;
   if(plan.action==='unsupported'&&plan.params.reason==='NO_SUPPORTED_COMMAND'&&plan.params.modelEligible){const candidate=await planChiefCommand(c,s,t.fetcher,source,{body:plan.body,sourceVerified:true});if(candidate?.sourceId===source.id&&candidate.guard===CHIEF_COMMAND_AI_GUARD&&actions.has(candidate.action)&&!['release-one','learn-conversation'].includes(candidate.action))plan=candidate;}
   const response=await execute(s,c,t,source,plan,now);finishCommand(s,row,response.state,{...response,executedAction:plan.action,validatedPlan:plan!==body.plan?plan:null,checkedAt:new Date(now).toISOString()});if(response.state==='DONE')result.completed++;else result.blocked++;
  }catch(error){const reason=['PROGRAM_ACCESS_UNAVAILABLE','PROGRAM_READ_FAILED','PROGRAM_READ_SCOPE_UNVERIFIED','PROGRAM_PHONE_SCOPE_UNVERIFIED','PROGRAM_RECEIPT_SCOPE_UNVERIFIED','CHIEF_NATIVE_SOURCE_UNVERIFIED'].includes(error.message)?error.message:'ACTION_RESULT_UNVERIFIED';
   finishCommand(s,row,'BLOCKED',{text:reason==='CHIEF_NATIVE_SOURCE_UNVERIFIED'?'Sandra, no pude verificar la fuente original de esa orden; no ejecuté la acción.':'Sandra, no pude comprobar el resultado con mi acceso actual. La consulta o fuente necesaria sigue pendiente; no afirmo que la acción se completó.',error:reason,data:{businessWritten:false},checkedAt:new Date(now).toISOString(),scope:'own-current-access-only'});result.blocked++;}
 }
 return result;
}
