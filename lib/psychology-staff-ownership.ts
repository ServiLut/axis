import type {Prisma} from '@/prisma/generated/prisma/client';
import {pauseForStaff,resumeReception,SANDRA_PHONE,type ReceptionEvent,type ReceptionState} from './psychology-reception';

type Tx=Prisma.TransactionClient;

/** A shared staff/chief chat is not automatically addressed to the assistant. */
export function chiefAddressesBot(event:ReceptionEvent){
 if(event.fromMe||event.phone!==SANDRA_PHONE||event.kind!=='text')return false;
 const text=event.text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
 if(/^(estado bot|ayuda bot)$/.test(text))return true;
 const greeting='(?:(?:hola|buenos dias|buenas tardes|buenas noches|buen dia|oye|disculpa)[,!: ]+)?';
 const name='(?:luisa(?: fernanda)?|bot)';
 // A vocative or a direct request, not a third-person mention or a quoted example.
 return new RegExp('^'+greeting+name+'(?:$|[,!:;¿?])').test(text)
  ||new RegExp('^'+name+' +(?:hola|buenos dias|buenas tardes|buenas noches|buen dia)(?:$|[,!:;.¿?]| +(?:hoy|por favor|necesito|quiero|puedes|me ayudas|tratemos|revisa|retoma)\\b)').test(text)
  ||new RegExp('^'+greeting+name+' +(?:por favor|me ayudas|te pido|tu puedes|necesito|quiero|puedes|podrias|revisa|mira|dime|ayudame|confirma|cuentame|recuerda|guarda|ten en cuenta|retoma|reanuda|vuelve a atender|estas|estan funcionando|sigues|me escuchas|me lees|que puedes hacer|con que me puedes ayudar|explicame)(?:[ ?!]|$)').test(text);
}

/** A presence question needs no model inference and makes no claim about other functions. */
export function chiefPresenceQuestion(event:ReceptionEvent){
 if(!chiefAddressesBot(event))return false;
 const s=event.text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[¿?¡!,.;:]/g,' ').replace(/\s+/g,' ').trim();
 return /^(?:(?:hola|buenos dias|buenas tardes|buenas noches|buen dia|oye|disculpa) )?(?:luisa(?: fernanda)?|bot) (?:(?:estas|estan|sigues) (?:funcionando|activa|activo|ahi|conectada|conectado)|me escuchas|me lees)$/.test(s);
}

/** The chief may answer a question from a recorded bot message without repeating its name. */
export async function chiefMessageAddressesBot(tx:Tx,event:ReceptionEvent){
 if(chiefAddressesBot(event))return true;
 return !!await verifiedChiefQuestion(tx,event);
}

/** Keep the exact verified question available to interpretation, not just its authorization. */
export async function verifiedChiefQuestion(tx:Tx,event:ReceptionEvent){
 if(event.fromMe||event.phone!==SANDRA_PHONE||event.kind!=='text'||!event.quotedText?.trim())return null;
 const quote=event.quotedText.trim();
 // The inbound transport limits quotes to 1,800 chars. Short fragments are ambiguous.
 if(quote.length<40)return null;
 const matches=await tx.$queryRaw<{id:string;content:string}[]>`SELECT id,content FROM "PsicologiaBotOutbox"
  WHERE "tenantId"=4 AND phone=${SANDRA_PHONE} AND status='ACCEPTED'
   AND "attemptedAt"<=${new Date(event.at)}
   AND (content=${quote} OR (length(${quote})>=1700 AND left(content,length(${quote}))=${quote})) LIMIT 2`;
 return matches.length===1?matches[0]:null;
}

/** Only an explicit direct instruction releases the chief's own shared-account chat. */
export function chiefStaffDecision(event:ReceptionEvent,stage:string,state:ReceptionState){
 if(event.fromMe||event.phone!==SANDRA_PHONE||stage!=='HUMAN')return null;
 const text=event.text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[¿?¡!,.;:]/g,' ').replace(/\s+/g,' ').trim();
 const explicit=event.kind==='text'&&/^(?:(?:hola|buenos dias|buenas tardes|buenas noches|buen dia|oye|disculpa) )?(?:luisa(?: fernanda)?|bot) (?:por favor )?(?:retoma|reanuda|vuelve a atender) (?:tu )?(?:este chat|nuestro chat|la atencion de este chat)(?: por favor)?$/.test(text);
 const staffAt=state.staffMessage?.at||state.humanHold?.since;
 if(!explicit||(staffAt&&Date.parse(event.at)<=Date.parse(staffAt)))return {action:'observe' as const};
 const next=resumeReception(state);
 next.state.resumedFrom=event.id;next.state.staffReleasedAt=event.at;
 return {action:'release' as const,...next};
}

/** A short transport correlation, never an unbounded match against old replies. */
export async function isPsychologyBotEcho(tx:Tx,event:ReceptionEvent){
 if(!event.fromMe||event.kind!=='text'||!event.text.trim())return false;
 const rows=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "PsicologiaBotOutbox"
  WHERE "tenantId"=4 AND phone=${event.phone} AND content=${event.text}
   AND status IN ('SENDING','ACCEPTED','UNCERTAIN') AND "attemptedAt" IS NOT NULL
   AND ABS(EXTRACT(EPOCH FROM ${new Date(event.at)}::timestamptz-"attemptedAt"))<=120 LIMIT 1`;
 return rows.length>0;
}

/** Apply at ingestion, before slow model work. Caller holds the config lock. */
export async function recordPsychologyStaffTakeover(tx:Tx,event:ReceptionEvent){
 if(!event.fromMe||await isPsychologyBotEcho(tx,event))return false;
 const c=(await tx.$queryRaw<{stage:string;state:ReceptionState}[]>`SELECT stage,state FROM "PsicologiaBotConversation" WHERE "tenantId"=4 AND phone=${event.phone} FOR UPDATE`)[0];
 if(!c)return false;
 if(c.state.staffReleasedAt&&Date.parse(c.state.staffReleasedAt)>=Date.parse(event.at))return false;
 if(c.state.staffMessage&&Date.parse(c.state.staffMessage.at)>Date.parse(event.at))return false;
 const next=pauseForStaff(c.stage,c.state,event.at);
 next.state.staffMessage={id:event.id,at:event.at};
 await tx.$executeRaw`UPDATE "PsicologiaBotConversation" SET stage=${next.stage},state=${JSON.stringify(next.state)}::jsonb,"updatedAt"=NOW() WHERE "tenantId"=4 AND phone=${event.phone}`;
 // Preserve independently requested reports and alerts from other chats to the chief.
 await tx.$executeRaw`UPDATE "PsicologiaBotOutbox" o SET status='CANCELLED',"lastError"='STAFF_TAKEOVER' WHERE o."tenantId"=4 AND o.phone=${event.phone} AND o.status='PENDING'
  AND (o.phone<>${SANDRA_PHONE} OR EXISTS(SELECT 1 FROM "PsicologiaBotEvent" e WHERE e."tenantId"=4 AND e.phone=${SANDRA_PHONE} AND e."fromMe"=false AND left(o.id,length(e.id)+1)=e.id||':'))`;
 return true;
}

/** Gate conversational output to every contact, including the chief; preserve independent alerts/reports. */
export async function psychologyStaffSendAllowed(tx:Tx,id:string,phone:string){
 let directedAt:Date|null=null;
 if(phone===SANDRA_PHONE){
  const source=(await tx.$queryRaw<(ReceptionEvent&{eventAt:Date;transcribed:boolean})[]>`SELECT e.id,e.phone,e.kind,e."fromMe",e."eventAt",to_jsonb(e)->>'quotedText' AS "quotedText",COALESCE(NULLIF(to_jsonb(e)->>'transcript',''),e.text) AS text,(NULLIF(to_jsonb(e)->>'transcript','') IS NOT NULL) AS transcribed
   FROM "PsicologiaBotEvent" e JOIN "PsicologiaBotOutbox" o ON left(o.id,length(e.id)+1)=e.id||':'
   WHERE o.id=${id} AND o.phone=${phone} AND o."tenantId"=4 AND e."tenantId"=4 AND e.phone=${SANDRA_PHONE} AND e."fromMe"=false ORDER BY length(e.id) DESC LIMIT 1`)[0];
  if(source){
   if(!await chiefMessageAddressesBot(tx,{...source,at:source.eventAt.toISOString(),kind:source.kind==='audio'&&source.transcribed?'text':source.kind}))return false;
   directedAt=source.eventAt;
  }
 }
 const rows=await tx.$queryRaw<{allowed:boolean}[]>`SELECT EXISTS(
  SELECT 1 FROM "PsicologiaBotOutbox" o WHERE o.id=${id} AND o.phone=${phone} AND o."tenantId"=4 AND o.status='SENDING'
   AND ((${phone}=${SANDRA_PHONE} AND NOT EXISTS(SELECT 1 FROM "PsicologiaBotEvent" e WHERE e."tenantId"=4 AND e.phone=${SANDRA_PHONE} AND e."fromMe"=false AND left(o.id,length(e.id)+1)=e.id||':')) OR (
    (${directedAt}::timestamptz IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "PsicologiaBotConversation" c WHERE c.phone=o.phone AND c."tenantId"=4
       AND COALESCE(NULLIF(c.state->'staffMessage'->>'at','')::timestamptz,NULLIF(c.state->'humanHold'->>'since','')::timestamptz)>=${directedAt})
     OR ${directedAt}::timestamptz IS NULL AND NOT EXISTS(SELECT 1 FROM "PsicologiaBotConversation" c WHERE c.phone=o.phone AND c."tenantId"=4
      AND (c.state->'staffMessage' IS NOT NULL OR c.state->'humanHold'->>'kind' IN ('staff','manual')
       OR (c.stage='HUMAN' AND c.state->>'reason'='Atención de una persona')
       OR o."createdAt"<=NULLIF(c.state->>'staffReleasedAt','')::timestamptz)))
    AND NOT EXISTS(SELECT 1 FROM "PsicologiaBotEvent" h WHERE h.phone=o.phone AND h."tenantId"=4 AND h."fromMe"=true
      AND h."receivedAt">=o."createdAt"
      AND NOT EXISTS(SELECT 1 FROM "PsicologiaBotOutbox" b WHERE b.phone=h.phone AND b."tenantId"=4
       AND h.kind='text' AND h.text<>'' AND b.content=h.text AND b.status IN ('SENDING','ACCEPTED','UNCERTAIN')
       AND b."attemptedAt" IS NOT NULL AND ABS(EXTRACT(EPOCH FROM h."eventAt"-b."attemptedAt"))<=120))
   ))) AS allowed`;
 return rows[0]?.allowed===true;
}
