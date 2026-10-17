// A reopening is prospective. This optional own-business boundary neither
// mutates historical rows nor changes the original installation/attention cut.
export const PUBLIC_RESPONSE_WINDOW_GUARD='own-fum-prospective-public-source-and-queue-v1';
const validTime=value=>Number.isSafeInteger(value)&&value>=0;
export function publicResponseWindowConfig(env,company,activatedAt){
  if(company!=='fumigacion'||env.BOT_PUBLIC_RESPONSE_STARTS_AT===undefined)return null;
  const value=env.BOT_PUBLIC_RESPONSE_STARTS_AT;
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))throw Error('PUBLIC_RESPONSE_CUTOFF_REQUIRED');
  const startsAt=Date.parse(value);
  if(!validTime(startsAt)||new Date(startsAt).toISOString()!==value||!validTime(activatedAt)||startsAt<activatedAt)throw Error('PUBLIC_RESPONSE_CUTOFF_REQUIRED');
  return startsAt;
}
export function publicResponseWindow(config){
  const configured=config?.company==='fumigacion'&&config.publicResponseStartsAt!=null;
  const valid=!configured||(validTime(config.publicResponseStartsAt)&&validTime(config.activatedAt)&&config.publicResponseStartsAt>=config.activatedAt);
  return {guard:PUBLIC_RESPONSE_WINDOW_GUARD,configured,active:configured&&config.enabled===true,valid,
    startsAt:configured&&valid?config.publicResponseStartsAt:null,historicalRowsReplayed:false};
}
export function publicOperationAllowed(config,{sourceAt,createdAt=sourceAt}={},now=Date.now()){
  const window=publicResponseWindow(config);
  if(!window.active)return true;
  return window.valid&&validTime(now)&&validTime(sourceAt)&&validTime(createdAt)&&
    sourceAt>=window.startsAt&&createdAt>=window.startsAt&&sourceAt<=now+60000&&createdAt<=now+60000;
}
// SQL filters precede LIMIT so preserved old rows cannot starve fresh work.
// -1 retains historical behavior when the optional boundary is absent/paused;
// MAX_SAFE_INTEGER closes malformed direct configurations without replay.
export function publicResponseSqlCutoff(config){
  const window=publicResponseWindow(config);
  return !window.active?-1:window.valid?window.startsAt:Number.MAX_SAFE_INTEGER;
}
export function publicEventAllowed(config,row,now=Date.now()){
  return publicOperationAllowed(config,{sourceAt:row?.at,createdAt:row?.received_at},now);
}
export function publicOutboxAllowed(store,config,row,now=Date.now()){
  if(!publicResponseWindow(config).active)return true;
  if(!publicOperationAllowed(config,{sourceAt:row?.created,createdAt:row?.created},now))return false;
  // Internal reports have their own source/authority guards. Reopening must
  // not dispatch a READY report created before the cut, regardless of its TTL.
  if(row.internal)return true;
  let source;
  if(typeof row.id==='string'&&row.id.endsWith(':reply'))source=store.db.prepare('SELECT at,received_at FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(row.id.slice(0,-6),row.phone,row.line);
  // Program/follow-up/continuation responses retain a conversation revision.
  // Require a real incoming event at that same revision, not a fresh row time
  // on a response whose only customer source is historical.
  if(!source)source=store.db.prepare('SELECT at,received_at FROM events WHERE phone=? AND line=? AND from_me=0 AND revision=? AND at<=? ORDER BY at DESC,rowid DESC LIMIT 1').get(row.phone,row.line,row.revision,row.created);
  return Boolean(source&&publicEventAllowed(config,source,now));
}
export function publicTesaOutboxAllowed(store,config,row,now=Date.now()){
  if(!publicResponseWindow(config).active)return true;
  if(!publicOperationAllowed(config,{sourceAt:row?.created,createdAt:row?.created},now))return false;
  const question=store.db.prepare('SELECT body FROM tesa_questions WHERE id=? AND company=?').get(row.question_id,config.company);
  if(!question)return false;
  let body;try{body=store.open(question.body);}catch{return false;}
  const source=store.db.prepare('SELECT at,received_at FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(body.source,row.customer_phone,row.source_line);
  return Boolean(source&&publicEventAllowed(config,source,now));
}
