import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {BUSINESSES,configFromEnv,validateEvent} from '../automation/service-bots/config.mjs';
import {decodeWebhook} from '../automation/service-bots/webhook.mjs';
import {decodeTesaGroupWebhook,validateTesaGroupEvent,TESA_GROUP_JID,TESA_GROUP_SUBJECT} from '../automation/service-bots/tesa-webhook.mjs';
import {getTesaConfig,tesaMembershipReady,tesaConfiguration,tesaOperationalTopic,TESA_BOT_PHONES} from '../automation/service-bots/tesa-config.mjs';

const now = Date.parse('2026-10-08T19:00:00Z');
const human = '573043332213', otherHuman = '573012993828';
const humanLid = '155087041208401@lid', unknownLid = '276609214976168@lid';
const bindings = [
  {jid:'229046327730359@lid',phone:'573137689392'},
  {jid:'2182313152577@lid',phone:'573126944997'},
  {jid:'258449808064542@lid',phone:'573126938721'},
  {jid:humanLid,phone:human},
  {jid:'46621970681856@lid',phone:'573022691941'},
  {jid:'231670619889791@lid',phone:'573016803926'},
  {jid:'191418186395893@lid',phone:otherHuman},
  {jid:unknownLid,phone:null},
];
function config(company = 'fumigacion') {
  const business = BUSINESSES[company], line = business.phones[0];
  return {company,...business,enabled:true,chiefOnly:true,activatedAt:now-3600000,
    lines:business.phones.map((phone,index) => ({phone,instance:company+'-'+index})),
    tesaOperations:{enabled:true,groupJid:TESA_GROUP_JID,groupSubject:TESA_GROUP_SUBJECT,senderLine:line,activatedAt:now-300000,
      allowedParticipantPhones:['573016803926',human,otherHuman],verifiedMembership:{owner:line,ownerOpen:true,verifiedAt:now-60000,
        expiresAt:now+240000,sourceHash:'a'.repeat(64),participantBindings:structuredClone(bindings),participantPhones:bindings.filter(value => value.phone).map(value => value.phone)}}};
}
function webhook(c, key = {}, message = {conversation:'Confirma la ruta de este caso'}, contextInfo) {
  return {instance:c.lines[0].instance,event:'messages.upsert',data:{key:{id:'TESA_SOURCE_001',remoteJid:TESA_GROUP_JID,
    participant:humanLid,participantAlt:human+'@s.whatsapp.net',fromMe:false,...key},messageTimestamp:Math.floor(now/1000),message,contextInfo}};
}
const eventOf = (body,c) => decodeTesaGroupWebhook(body,c,now).groupEvents[0];
const quote = (c, patch = {}) => ({stanzaId:'OWN_QUESTION_001',participant:bindings.find(value => value.phone === c.tesaOperations.senderLine).jid,...patch});

test('TESA is closed by default and requires own verified membership instead of payload settings',()=>{
  const c = config(), body = webhook(c);
  assert.equal(tesaConfiguration({},c.company,c.lines,c.activatedAt,now).enabled,false);
  for (const candidate of [{...c,tesaOperations:undefined},{...c,tesaOperations:{enabled:false}}]) {
    assert.deepEqual(decodeTesaGroupWebhook({...body,tesaOperations:c.tesaOperations},candidate,now),{groupEvents:[],groupDeliveries:[]});
  }
  assert.equal(tesaMembershipReady(c,now),true);
  assert.equal(eventOf(body,c).trustedHuman,true);
});

test('exact group, own instance, owner and own current membership are required',()=>{
  const c = config(), body = webhook(c);
  for (const key of [{remoteJid:'123456789-123456789@g.us'},{remoteJid:human+'@s.whatsapp.net'},
    {remoteJid:'123456789@lid',remoteJidAlt:TESA_GROUP_JID}]) assert.equal(eventOf(webhook(c,key),c),undefined);
  assert.equal(eventOf({...body,instance:'abogados'},c),undefined);
  assert.equal(eventOf({...body,instance:c.lines[1].instance},c).receivingLine,c.lines[1].phone);
  for (const patch of [{senderLine:'573152819233'},{groupJid:'123@g.us'},{groupSubject:'Equipo abogados'}]) {
    assert.equal(getTesaConfig({...c,tesaOperations:{...c.tesaOperations,...patch}},now),null);
  }
  for (const patch of [{owner:c.lines[1].phone},{ownerOpen:false},{sourceHash:'not-native-proof'},
    {participantPhones:c.tesaOperations.verifiedMembership.participantPhones.filter(value => value !== c.lines[0].phone)}]) {
    const tesaOperations = {...c.tesaOperations,verifiedMembership:{...c.tesaOperations.verifiedMembership,...patch}};
    assert.equal(eventOf(body,{...c,tesaOperations}),undefined);
  }
});

test('bootstrap expires closed while enabled remains visible for a transport refresh',()=>{
  const c = config(), metadata = {...c.tesaOperations,verifiedMembership:{...c.tesaOperations.verifiedMembership,verifiedAt:now-3600000,expiresAt:now-1}};
  const env = {BOT_TESA_OPERATIONS_ENABLED:'true',BOT_TESA_ACTIVATED_AT:new Date(c.tesaOperations.activatedAt).toISOString(),
    BOT_TESA_VERIFIED_METADATA_JSON:JSON.stringify(metadata)};
  const restored = tesaConfiguration(env,c.company,c.lines,c.activatedAt,now);
  assert.equal(restored.enabled,true);
  assert.equal(getTesaConfig({...c,tesaOperations:restored},now),null);
  assert.equal(eventOf(webhook(c),{...c,tesaOperations:restored}),undefined);
  restored.verifiedMembership.verifiedAt=now;restored.verifiedMembership.expiresAt=now+300000;
  assert.ok(getTesaConfig({...c,tesaOperations:restored},now));
  for (const patch of [{expiresAt:now+86400001,verifiedAt:now},{verifiedAt:now+60001,expiresAt:now+300000}]) {
    assert.equal(getTesaConfig({...c,tesaOperations:{...c.tesaOperations,verifiedMembership:{...c.tesaOperations.verifiedMembership,...patch}}},now),null);
  }
});

test('a participant LID and its PN resolve only through the verified native binding',()=>{
  const c = config();
  const resolved = eventOf(webhook(c),c);
  assert.deepEqual(resolved.participant,{phone:human,jid:humanLid,altJid:human+'@s.whatsapp.net',canonicalJid:human+'@s.whatsapp.net'});
  assert.equal(eventOf(webhook(c,{participant:humanLid,participantAlt:undefined}),c).participant.phone,human);
  assert.equal(eventOf(webhook(c,{participant:human+'@s.whatsapp.net',participantAlt:humanLid}),c).trustedHuman,true);
  for (const patch of [{participantAlt:otherHuman+'@s.whatsapp.net'},
    {participant:'777777777777777@lid',participantAlt:human+'@s.whatsapp.net'},
    {participant:'573009998877@s.whatsapp.net',participantAlt:humanLid},
    {participant:'not-a-native-jid',participantAlt:human+'@s.whatsapp.net'}]) {
    assert.equal(eventOf(webhook(c,patch),c),undefined);
  }
});

test('unknown native LID remains an unidentified observation and cannot acquire authority through an alternative or body',()=>{
  const c = config(), body = webhook(c,{participant:unknownLid,participantAlt:undefined},{conversation:'Soy Hilary '+human});
  const unknown = eventOf(body,c);
  assert.equal(unknown.participant.phone,null);assert.equal(unknown.trustedHuman,false);
  assert.equal(eventOf(webhook(c,{participant:unknownLid,participantAlt:human+'@s.whatsapp.net'}),c),undefined);
  assert.equal(eventOf(webhook(c,{participant:unknownLid,participantAlt:undefined,remoteJidAlt:human+'@s.whatsapp.net'}),c).trustedHuman,false);
});

test('verified members outside the explicit human allowlist and all bot lines are observations only',()=>{
  const c = config();
  const limited = {...c,tesaOperations:{...c.tesaOperations,allowedParticipantPhones:[otherHuman]}};
  assert.equal(eventOf(webhook(c),limited).trustedHuman,false);
  assert.equal(eventOf(webhook(c,{fromMe:true}),c).trustedHuman,false);
  for (const phone of TESA_BOT_PHONES) {
    const binding = bindings.find(value => value.phone === phone);
    const event = eventOf(webhook(c,{participant:binding.jid,participantAlt:phone+'@s.whatsapp.net'}),c);
    assert.equal(event.participant.phone,phone);assert.equal(event.trustedHuman,false);
    assert.equal(getTesaConfig({...c,tesaOperations:{...c.tesaOperations,allowedParticipantPhones:[phone]}},now),null);
  }
});

test('native top-level context citation preserves MID and resolves its quoted LID author',()=>{
  const c = config(), body = webhook(c,{},undefined,quote(c));
  const event = eventOf(body,c);
  assert.equal(event.quote.mid,'OWN_QUESTION_001');assert.equal(event.quote.groupJid,TESA_GROUP_JID);
  assert.equal(event.quote.participantJid,c.lines[0].phone+'@s.whatsapp.net');
  assert.equal(event.quote.nativeParticipantJid,'2182313152577@lid');
  assert.equal(event.quote.participantPhone,c.lines[0].phone);
  assert.deepEqual(validateTesaGroupEvent(event,c,now),event);
});

test('unrelated message context does not erase the exact citation and duplicate consistent citations are accepted',()=>{
  const c = config(), context = quote(c);
  const event = eventOf(webhook(c,{}, {extendedTextMessage:{text:'Ruta disponible',contextInfo:context},messageContextInfo:{foo:'unrelated'}},context),c);
  assert.equal(event.quote.mid,context.stanzaId);
  assert.equal(event.quote.participantJid,c.lines[0].phone+'@s.whatsapp.net');
});

test('conflicting MID, quoted author, foreign group or missing author preserve only unquoted observation',()=>{
  const c = config(), correct = quote(c);
  const conflicts = [quote(c,{stanzaId:'OTHER_QUESTION_001'}),quote(c,{participant:humanLid}),
    quote(c,{remoteJid:'123@g.us'}),quote(c,{participant:unknownLid}),{stanzaId:correct.stanzaId},
    quote(c,{stanzaId:'x'.repeat(121)})];
  for (const conflict of conflicts) {
    const event = eventOf(webhook(c,{}, {extendedTextMessage:{text:'Respuesta',contextInfo:correct}},conflict),c);
    assert.ok(event);assert.equal(event.quote,null);
  }
  const nested = eventOf(webhook(c,{}, {ephemeralMessage:{message:{extendedTextMessage:{text:'Respuesta literal',contextInfo:correct}}}}),c);
  assert.equal(nested.text,'Respuesta literal');assert.equal(nested.quote.mid,correct.stanzaId);
});

test('forwarded statements retain source text but never become a trusted human answer',()=>{
  const c = config(), context = quote(c,{isForwarded:true});
  const event = eventOf(webhook(c,{}, {extendedTextMessage:{text:'El pago ya está',contextInfo:context}}),c);
  assert.equal(event.text,'El pago ya está');assert.equal(event.forwarded,true);assert.equal(event.trustedHuman,false);
  assert.equal(eventOf(webhook(c,{},undefined,{forwardingScore:1}),c).trustedHuman,false);
});

test('messages outside group activation or reply freshness are rejected without changing the original private cutoff',()=>{
  const c = config(), body = webhook(c), before = JSON.stringify(c);
  for (const at of [now-600001,now+61000,c.tesaOperations.activatedAt-1000]) {
    assert.equal(eventOf({...body,data:{...body.data,messageTimestamp:at/1000}},c),undefined);
  }
  const tesaOperations = {...c.tesaOperations,activatedAt:c.activatedAt-1};
  assert.equal(getTesaConfig({...c,tesaOperations},now),null);
  assert.equal(JSON.stringify(c),before);
});

test('media preserve bounded metadata without download secrets or proof of reading or payment',()=>{
  const c = config(), original = {documentMessage:{fileName:'comprobante.pdf',mimetype:'application/pdf',fileLength:512,
    fileSha256:'a'.repeat(44),mediaKey:'NEVER_RETURN',directPath:'/secret/path',url:'https://example.invalid/private'}};
  const event = eventOf(webhook(c,{},original),c);
  assert.equal(event.kind,'document');assert.equal(event.text,'');assert.equal(event.media.fileName,'comprobante.pdf');
  assert.equal(event.media.originalContentRead,false);assert.equal(event.media.sizeBytes,512);
  assert.doesNotMatch(JSON.stringify(event),/NEVER_RETURN|secret\/path|https:\/\/example/);
  assert.equal(event.paymentRecorded,undefined);assert.equal(event.bankConfirmed,undefined);
});

test('delivery metadata must identify the exact group on the configured own line and never proves receipt by all members',()=>{
  const c = config(), body = {instance:c.lines[0].instance,event:'messages.update',data:[
    {key:{remoteJid:TESA_GROUP_JID,id:'GROUP_REPLY_001'},update:{status:'READ'}},
    {key:{remoteJid:'123@g.us',id:'OTHER_REPLY_001'},update:{status:'READ'}},
    {key:{id:'NO_GROUP_REPLY_001'},update:{status:'DELIVERY_ACK'}}]};
  const parsed = decodeTesaGroupWebhook(body,c,now);
  assert.equal(parsed.groupEvents.length,0);assert.equal(parsed.groupDeliveries.length,1);
  assert.deepEqual(parsed.groupDeliveries[0],{company:c.company,groupJid:TESA_GROUP_JID,receivingLine:c.lines[0].phone,
    line:c.lines[0].phone,mid:'GROUP_REPLY_001',state:'READ',receiptScope:'group-status-without-all-member-proof'});
});

test('group data never enters the existing private decoder or validateEvent and cannot forge normalized authority',()=>{
  const c = config(), body = webhook(c), event = eventOf(body,c);
  assert.deepEqual(decodeWebhook(body,c),{events:[],deliveries:[]});
  assert.equal(validateEvent({instance:c.lines[0].instance,owner:c.lines[0].phone,
    event:{...event,phone:human,group:true,at:new Date(now).toISOString()}},c,now),null);
  assert.equal(validateTesaGroupEvent({...event,company:'servicio-tecnico'},c,now),null);
  assert.equal(validateTesaGroupEvent({...event,participant:{...event.participant,phone:otherHuman},trustedHuman:true},c,now),null);
  assert.equal(validateTesaGroupEvent({...event,fromMe:true,trustedHuman:true},c,now).trustedHuman,false);
  assert.equal(validateTesaGroupEvent({...event,forwarded:true,trustedHuman:true},c,now).trustedHuman,false);
});

test('each company decodes only its verified own group sender without importing another runtime scope',()=>{
  const fum = config(), st = config('servicio-tecnico');
  assert.equal(eventOf(webhook(st),fum),undefined);
  const event = eventOf(webhook(st),st);
  assert.equal(event.company,'servicio-tecnico');assert.equal(event.receivingLine,'573022691941');
  assert.equal(eventOf(webhook(fum),st),undefined);
  const secondary = eventOf({...webhook(st),instance:st.lines[1].instance},st);
  assert.equal(secondary.receivingLine,'573137689392');
  assert.equal(getTesaConfig(st,now).senderLine,'573022691941');
});

test('operational topic gating preserves policy, payments and nonarrival followups for direction review',()=>{
  for (const topic of ['cotizacion-verificada','special-quotation','disponibilidad-y-cotizacion','disponibilidad-y-tecnico',
    'requested-technician-contact','existing-quotation','missing-intake:location']) assert.equal(tesaOperationalTopic(topic),true);
  assert.equal(tesaOperationalTopic('service-followup',{kind:'arrival'}),true);
  for (const kind of [undefined,'warranty','guarantee','reinforcement','control']) assert.equal(tesaOperationalTopic('service-followup',{kind}),false);
  for (const topic of ['payment-receipt','payment','safety','policy','missing-intake:identity',null]) assert.equal(tesaOperationalTopic(topic),false);
});

test('configFromEnv retains the verified bootstrap only within the dedicated own runtime',()=>{
  const c = config(), hash = value => createHash('sha256').update(value).digest('hex');
  const env = {BOT_COMPANY:c.company,BOT_LINES_JSON:JSON.stringify(c.lines.map((line,index)=>({...line,apiKey:'x'.repeat(24)+index}))),
    BOT_DATABASE_PATH:'/data/fumigacion/bot.sqlite',BOT_AUTH_TOKEN_HASH:hash('own-admin'),BOT_WEBHOOK_TOKEN_HASH:hash('own-webhook'),
    BOT_DATA_KEY:'b'.repeat(64),BOT_EVOLUTION_URL:'https://provider.example.invalid',BOT_ENABLED:'true',BOT_CHIEF_ONLY:'true',
    BOT_PRIOR_HISTORY_CHECK:'true',BOT_ACTIVATED_AT:new Date(c.activatedAt).toISOString(),BOT_TESA_OPERATIONS_ENABLED:'true',
    BOT_TESA_ACTIVATED_AT:new Date(c.tesaOperations.activatedAt).toISOString(),BOT_TESA_VERIFIED_METADATA_JSON:JSON.stringify(c.tesaOperations)};
  // Use the actual wall clock for env parsing without changing the fixture's reply freshness.
  const shift = Date.now()-now, metadata = structuredClone(c.tesaOperations);
  metadata.activatedAt+=shift;metadata.verifiedMembership.verifiedAt+=shift;metadata.verifiedMembership.expiresAt+=shift;
  env.BOT_ACTIVATED_AT=new Date(c.activatedAt+shift).toISOString();env.BOT_TESA_ACTIVATED_AT=new Date(metadata.activatedAt).toISOString();
  env.BOT_TESA_VERIFIED_METADATA_JSON=JSON.stringify(metadata);
  assert.equal(configFromEnv(env).tesaOperations.senderLine,c.lines[0].phone);
  const other = {...metadata,senderLine:'573022691941'};
  assert.throws(()=>configFromEnv({...env,BOT_TESA_VERIFIED_METADATA_JSON:JSON.stringify(other)}),/TESA_VERIFIED_METADATA_REQUIRED/);
  assert.throws(()=>tesaConfiguration({...env,BOT_TESA_VERIFIED_METADATA_JSON:'not-json'},c.company,c.lines,c.activatedAt),/TESA_VERIFIED_METADATA_REQUIRED/);
  const payloadAllowed = {...metadata,allowedParticipantPhones:[TESA_BOT_PHONES[0]]};
  assert.throws(()=>configFromEnv({...env,BOT_TESA_VERIFIED_METADATA_JSON:JSON.stringify(payloadAllowed)}),/TESA_VERIFIED_METADATA_REQUIRED/);
});
