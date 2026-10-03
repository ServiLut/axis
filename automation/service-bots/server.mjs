import { createServer } from 'node:http';
import { configFromEnv,authorized,validateEvent } from './config.mjs';
import { Store } from './store.mjs';
import { Engine } from './engine.mjs';
import { Transport,drain } from './transport.mjs';
import { pathToFileURL } from 'node:url';
import { decodeWebhook } from './webhook.mjs';

export function createBotServer(config,store,transport,engine) {
  let draining=false;
  const run=async()=>{if(draining)return {busy:true};draining=true;try{return await drain(store,config,transport,engine);}finally{draining=false;}};
  const server=createServer(async(req,res)=>{
    const reply=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store, private'});res.end(JSON.stringify(body));};
    const ingestion=['/event','/delivery','/webhook'].includes(req.url);
    if(!authorized(req.headers.authorization,ingestion?config.webhookHash:config.authHash))return reply(401,{error:'UNAUTHORIZED'});
    if(req.method!=='POST')return reply(405,{error:'POST_REQUIRED'});
    try {
      let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>20000)return reply(413,{error:'PAYLOAD_TOO_LARGE'});}
      const body=JSON.parse(raw);
      if(req.url==='/status')return reply(200,{company:config.name,bot:config.bot,enabled:config.enabled,mode:'reception-with-human-review',fullyAutonomous:false,
        events:store.db.prepare('SELECT state,COUNT(*) n FROM events GROUP BY state').all(),outbox:store.db.prepare('SELECT state,COUNT(*) n FROM outbox GROUP BY state').all(),
        communicationGuard:'private-routing-and-media-work-v2',internalConversationGuard:'verified-internal-per-line-v2',internalConversationEnabled:Boolean(config.chiefOnly),customerResponsesEnabled:config.enabled,
        customerIntakeEnabled:config.enabled,businessWritesEnabled:false,capabilityDisclosure:'runtime-mode-and-implemented-intake-v1',customerCourtesyGuard:'gratitude-only-without-intake-or-ownership-v1',
        caseOwnershipGuard:'first-reply-source-preserved-v2',conversationContext:'stored-scoped-turns-with-coverage-v2',internalQuestionGuard:'missing-field-and-case-dedup-v1',supervisorContentReview:'explicit-source-ids-readonly-v1',liveAttentionGuard:'own-native-outgoing-before-send-v1',intakeGuard:config.company==='fumigacion'?'full-initial-fields-and-quote-before-schedule-v1':'technical-intake-with-human-review-v1',
        caseAuthorship:store.db.prepare('SELECT state,COUNT(*) n FROM case_authorship GROUP BY state').all(),
        unanswered:store.db.prepare("SELECT COUNT(*) n FROM questions WHERE state IN ('PENDING','LEGACY_PENDING','ANSWER_REVIEW')").get().n,
        knowledge:store.db.prepare('SELECT kind,COUNT(*) n FROM knowledge GROUP BY kind').all(),programConnected:Boolean(config.programContextUrl&&config.programToken),aiConfigured:Boolean(config.aiUrl&&config.aiToken),priorHistoryProtection:Boolean(config.historyCheckRequired)});
      if(req.url==='/channel-health'){
        const lines=[];for(const line of config.lines)lines.push(await transport.verifyLine(line.phone));return reply(200,{company:config.name,lines});
      }
      if(req.url==='/supervision'){
        const after=body.afterEventRow??0,limit=body.limit??50;
        if(!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(limit)||limit<1||limit>100)return reply(400,{error:'INVALID_CURSOR'});
        const total=store.db.prepare('SELECT COUNT(*) n FROM events WHERE rowid>?').get(after).n;
        const events=store.db.prepare('SELECT rowid AS cursor,id,phone,line,at,from_me,state FROM events WHERE rowid>? ORDER BY rowid LIMIT ?').all(after,limit);
        const outbox=store.db.prepare('SELECT id,phone,line,internal,state,mid,created,updated FROM outbox ORDER BY updated DESC,rowid DESC LIMIT ?').all(limit);
        return reply(200,{company:config.name,bot:config.bot,checkedAt:new Date().toISOString(),metadataOnly:true,
          events,nextEventRow:events.at(-1)?.cursor??after,remainingEvents:total-events.length,
          outbox,outboxTotal:store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,outboxCoverageComplete:store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n===outbox.length,
          humanChats:store.db.prepare('SELECT COUNT(*) n FROM conversations WHERE hold=1').get().n,
          questions:store.db.prepare('SELECT state,COUNT(*) n FROM questions GROUP BY state').all(),
          caseAuthorship:store.db.prepare('SELECT state,COUNT(*) n FROM case_authorship GROUP BY state').all()});
      }
      if(req.url==='/review-events'){
        if(body.company!==config.company||!Array.isArray(body.eventIds)||body.eventIds.length<1||body.eventIds.length>50||new Set(body.eventIds).size!==body.eventIds.length||body.eventIds.some(id=>typeof id!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(id)))return reply(400,{error:'SCOPED_SOURCE_IDS_REQUIRED'});
        const results=[];
        for(const id of body.eventIds){
          const row=store.db.prepare('SELECT body,state FROM events WHERE id=?').get(id);
          if(!row){results.push({id,found:false});continue;}
          const event=store.open(row.body);
          if(!config.lines.some(l=>l.phone===event.line))return reply(409,{error:'STORED_SOURCE_OUTSIDE_SCOPE'});
          const response=store.db.prepare('SELECT id,body,state,mid,case_id FROM outbox WHERE id=? AND phone=? AND line=? AND internal=0').get(id+':reply',event.phone,event.line);
          results.push({id,found:true,event,processingState:row.state,response:response?{id:response.id,text:store.open(response.body),delivery:response.state,mid:response.mid,caseId:response.case_id}:null,context:store.conversationContext(event.phone,event.at,20,id)});
        }
        return reply(200,{company:config.company,checkedAt:new Date().toISOString(),readOnly:true,storedContentOnly:true,fullWhatsAppHistoryRead:false,originalMediaRead:false,results});
      }
      if(req.url==='/event'){
        const event=validateEvent(body,config);if(!event)return reply(202,{accepted:false,reason:'UNSUPPORTED_OR_STALE_OR_OUTSIDE_SCOPE'});
        await transport.verifyLine(event.line);return reply(202,{accepted:true,...store.enqueue(event)});
      }
      if(req.url==='/recover-chief-event'){
        if(!config.chiefOnly)return reply(403,{error:'INTERNAL_MODE_REQUIRED'});
        const event=validateEvent(body,config,Date.now(),true);
        if(!event||event.fromMe||!['573016803926','573233350137'].includes(event.phone)||event.forwarded)return reply(400,{error:'VERIFIED_INTERNAL_SOURCE_REQUIRED'});
        const line=config.lines.find(l=>l.phone===event.line);await transport.verifyLine(event.line);
        const jid=body.providerJid;
        if(!/^57\d{10}@s\.whatsapp\.net$|^\d+@lid$/.test(jid||''))return reply(400,{error:'DIRECT_SOURCE_REQUIRED'});
        const found=await transport.request(line,'/chat/findMessages/'+encodeURIComponent(line.instance),{where:{key:{remoteJid:jid}},offset:50,page:1});
        const rows=(found.messages?.records??[]).filter(r=>r.key?.remoteJid===jid&&r.key?.id===event.id&&r.key?.fromMe===false);
        const native=rows.map(r=>decodeWebhook({instance:line.instance,event:'messages.upsert',data:r},config).events[0]?.event).filter(Boolean);
        if(!native.length||native.some(n=>n.phone!==event.phone||n.kind!==event.kind||n.quotedId!==event.quotedId||n.text!==event.text||n.at!==new Date(event.at).toISOString()||n.forwarded))return reply(400,{error:'NATIVE_SOURCE_MISMATCH'});
        const queued=store.enqueue(event);
        if(queued.duplicate){
          const reset=store.db.prepare("UPDATE events SET state='PENDING' WHERE id=? AND state='OBSERVED_SUPERSEDED' AND NOT EXISTS(SELECT 1 FROM outbox WHERE id LIKE ?)").run(event.id,event.id+':%');
          if(reset.changes)store.audit('VERIFIED_INTERNAL_LINE_RECOVERY',event.id,{line:event.line});
        }
        return reply(200,{accepted:true,...queued});
      }
      if(req.url==='/webhook'){
        const parsed=decodeWebhook(body,config);let accepted=0,duplicates=0,deliveryUpdates=0;
        const own=config.lines.find(l=>l.instance===body.instance);if(!own)return reply(400,{error:'INSTANCE_OUTSIDE_SCOPE'});
        await transport.verifyLine(own.phone);
        for(const value of parsed.events){const e=validateEvent(value,config);if(e){const r=store.enqueue(e);accepted++;if(r.duplicate)duplicates++;}}
        for(const d of parsed.deliveries)deliveryUpdates+=store.delivery(d.mid,own.phone,d.state);
        return reply(202,{accepted,duplicates,deliveryUpdates});
      }
      if(req.url==='/delivery'){
        const line=config.lines.find(l=>l.instance===body.instance&&l.phone===body.owner);
        if(!line||!['DELIVERED','READ'].includes(body.state)||typeof body.mid!=='string')return reply(400,{error:'DELIVERY_OUTSIDE_SCOPE'});
        await transport.verifyLine(line.phone);
        const n=store.delivery(body.mid,line.phone,body.state);
        return reply(200,{updated:n});
      }
      if(req.url==='/knowledge')return reply(200,store.importKnowledge(body));
      if(req.url==='/notify-chief-report'){
        if(!config.chiefOnly)return reply(403,{error:'INTERNAL_MODE_REQUIRED'});
        if(!/^[a-z0-9_-]{8,100}$/.test(body.key||'')||!/^[a-f0-9]{64}$/.test(body.sourceHash||'')||typeof body.text!=='string'||!body.text.trim()||body.text.length>6000||/bearer\s|api.?key|contrase[nñ]a|token\s*[:=]/i.test(body.text))return reply(400,{error:'VERIFIED_REPORT_REQUIRED'});
        const line=config.lines.find(l=>l.phone===body.line);if(!line)return reply(400,{error:'OWN_LINE_REQUIRED'});
        await transport.verifyLine(line.phone);
        const id='chief-report:'+body.key+':573016803926';
        const created=store.tx(()=>{const added=store.queue(id,'573016803926',line.phone,body.text,true,0);if(added)store.audit('USER_AUTHORIZED_CHIEF_REPORT',id,{sourceHash:body.sourceHash,line:line.phone});return added;});
        return reply(200,{queued:created,id,delivery:store.db.prepare('SELECT state,mid FROM outbox WHERE id=?').get(id)});
      }
      if(req.url==='/import-pending-questions')return reply(200,store.importPendingQuestions(body));
      if(req.url==='/drain')return reply(200,await run());
      return reply(404,{error:'NOT_FOUND'});
    }catch{return reply(503,{error:'REVIEW_REQUIRED'});}
  });
  const timer=setInterval(()=>run().catch(()=>{}),10000);timer.unref();server.on('close',()=>clearInterval(timer));return server;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const config=configFromEnv();const store=new Store(config.database,config.company,config.encryptionKey);
  const transport=new Transport(config),engine=new Engine(store,config);
  createBotServer(config,store,transport,engine).listen(config.port,'0.0.0.0',()=>console.log(JSON.stringify({company:config.name,bot:config.bot,enabled:config.enabled,port:config.port})));
}
