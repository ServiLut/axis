import { createServer } from 'node:http';
import {createHash} from 'node:crypto';
import { configFromEnv,authorized,validateEvent,questionRecipients,operatorRoutingActive,SANDRA } from './config.mjs';
import { Store } from './store.mjs';
import { Engine,MARIA_AUTONOMOUS_INTAKE_GUARD } from './engine.mjs';
import {CHIEF_READ_ONLY_GUARD} from './chief-readonly.mjs';
import { Transport,drain } from './transport.mjs';
import { pathToFileURL } from 'node:url';
import { decodeWebhook,observePrivateIdentity,privateIdentityStatus } from './webhook.mjs';
import {validateApprovedAnswers} from './faq.mjs';
import {customerActivity} from './chief-status.mjs';
import {queueChiefDocument} from './chief-document.mjs';
import {validatePriceCatalog,verifyPriceSource,currentPriceEntries} from './prices.mjs';
import {BUSINESS_PRICE_GUARD,BUSINESS_PRICE_HASH} from './business-prices.mjs';
import {ADVISER_TONE_GUARD} from './adviser-tone.mjs';
import {aiStatus} from './ai-settings.mjs';
import {evaluateOwnAi,ownAiUsage} from './conversational-ai.mjs';
import {MARIA_UNDERSTANDING_GUARD} from './maria-understanding.mjs';
import {MIGUEL_UNDERSTANDING_GUARD} from './miguel-understanding.mjs';
import {OWN_QUOTE_CLARIFICATION_GUARD} from './own-quote-clarification.mjs';
import {TECHNICAL_INTAKE_CONTINUITY_GUARD} from './technical-intake-continuity.mjs';
import {restoreOwnAiSetup,installOwnAiSetup} from './ai-setup.mjs';
import {persistMariaKnowledge,mariaKnowledgeStatus,mariaKnowledgeDocument} from './maria-knowledge.mjs';
import {restoreProgramSetup,installProgramSetup,registrationStatus} from './maria-program.mjs';
import {initializeInactivityFollowup,inactivityStatus,responseTimingStatus,recordDeliveryTiming} from './inactivity-followup.mjs';
import {initializeTesaStore,tesaStatus,reviewTesaSources} from './tesa-operations.mjs';
import {ingestTesaWebhook,refreshTesaMembership} from './tesa-transport.mjs';
import {operationalLines,operationalLineAllowed,operationalCoverage} from './line-scope.mjs';
import {initializeIntakeJournal,recordIntakeWebhook,recordIntakeBinding,recordIntakeIngressGap,intakeAudit,intakeJournalStatus} from './intake-journal.mjs';
import {restoreProgramSupervision,programSupervisionStatus,installProgramSupervision,dailyProgramCross,readRetentionCandidates} from './program-supervision.mjs';
import {PREVENTIVE_RETENTION_GUARD} from './preventive-retention.mjs';
import {restoreRetentionProofAccess,installRetentionProofAccess,retentionProofAccessStatus,retentionProofAuthorized} from './retention-proof-access.mjs';
import {createRetentionDeliveryRuntime} from './retention-delivery.mjs';

export function createDrainScheduler(config,store,runner,{blocked=()=>false,setImmediateFn=setImmediate,setIntervalFn=setInterval,clearIntervalFn=clearInterval}={}){
  const fast=config.company==='fumigacion'&&config.responseTargetMs===3000,key='verified-ingestion-drain-wake-v1';
  let running=false,scheduled=false,closed=false;
  const durableWake=()=>store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,store.seal({at:Date.now(),source:'authenticated-own-ingestion'}));
  const pending=()=>Boolean(store.db.prepare("SELECT 1 FROM events WHERE state='PENDING' AND (?=1 OR phone IN (?,?,?)) LIMIT 1").get(Number(config.enabled),SANDRA,'573233350137','573043332213'));
  const execute=async()=>{
    scheduled=false;if(closed||running||blocked())return;
    running=true;store.db.prepare('DELETE FROM meta WHERE key=?').run(key);let result,failed=false;
    try{result=await runner();}catch{failed=true;durableWake();}
    finally{
      running=false;
      // A source received during model/native awaits leaves a durable wake.
      // Pending messages are handled one at a time so each response can leave
      // the outbox before another customer's model request begins.
      if(!closed&&!failed&&fast&&!blocked()&&(store.db.prepare('SELECT 1 FROM meta WHERE key=?').get(key)||(result?.processed>0&&pending())))schedule();
    }
  };
  const schedule=()=>{if(!closed&&!scheduled&&!running){scheduled=true;setImmediateFn(()=>execute());}};
  const wake=()=>{if(closed)return;durableWake();if(fast)schedule();};
  const intervalMs=fast?1000:10000;
  const timer=setIntervalFn(()=>{if(!closed&&!running&&!blocked()){if(fast)schedule();else execute();}},intervalMs);timer?.unref?.();
  if(fast&&store.db.prepare('SELECT 1 FROM meta WHERE key=?').get(key))schedule();
  return {wake,intervalMs,close(){closed=true;clearIntervalFn(timer);},get running(){return running;}};
}

async function verifyApprovedAnswerSource(document,config,transport){
  validateApprovedAnswers(document,config.company);
  const source=document.source,line=config.lines.find(l=>l.phone===source.line),jid=source.sender+'@s.whatsapp.net';
  if(!line)throw Error('FAQ_OWN_LINE_REQUIRED');
  await transport.verifyLine(line.phone);
  const lookup=async id=>{
    const found=await transport.request(line,'/chat/findMessages/'+encodeURIComponent(line.instance),{where:{key:{id}},offset:10,page:1});
    const records=found.messages?.records?.filter(r=>r.key?.id===id&&(r.key.remoteJid===jid||r.key.remoteJidAlt===jid))??[];
    if(records.length!==1)throw Error('FAQ_NATIVE_SOURCE_NOT_UNIQUE');return records[0];
  };
  const [native,question]=await Promise.all([lookup(source.id),lookup(source.questionMid)]);
  const message=native.message?.ephemeralMessage?.message??native.message??{},context=message.extendedTextMessage?.contextInfo??native.contextInfo??{};
  const text=message.conversation??message.extendedTextMessage?.text;
  const ownStatus=[question.status,...(question.MessageUpdate??[]).map(x=>x.status)];
  if(native.key.fromMe!==false||question.key.fromMe!==true||text!==source.originalText||new Date(Number(native.messageTimestamp)*1000).toISOString()!==source.at||Number(question.messageTimestamp)>Number(native.messageTimestamp)||context.isForwarded||context.forwardingScore>0||!ownStatus.some(x=>['DELIVERY_ACK','READ','PLAYED'].includes(x)))throw Error('FAQ_NATIVE_SOURCE_MISMATCH');
  if(context.stanzaId!==source.questionMid&&!(source.antecedentReviewed===true&&typeof source.antecedentEvidence==='string'&&source.antecedentEvidence.trim().length>=20))throw Error('FAQ_DIRECTED_ANTECEDENT_REQUIRED');
}

export function createBotServer(config,store,transport,engine) {
  initializeIntakeJournal(store,config);
  initializeTesaStore(store);
  store.db.prepare("UPDATE tesa_outbox SET state='UNCERTAIN',updated=? WHERE state='SENDING'").run(Date.now());
  restoreOwnAiSetup(config,store);
  restoreProgramSetup(config,store);
  restoreProgramSupervision(config,store);
  restoreRetentionProofAccess(config,store);
  // General customer history is not implied by own registration access. The
  // delivery proof remains closed until an authenticated complete reader exists.
  const retentionDelivery=config.company==='fumigacion'?createRetentionDeliveryRuntime(config,store,transport):null;
  persistMariaKnowledge(config,store);
  initializeInactivityFollowup(config,store);
  let draining=false,settingUpAi=false;
  const run=async()=>{if(draining||settingUpAi)return {busy:true};draining=true;try{return await drain(store,config,transport,engine);}finally{draining=false;}};
  const scheduler=createDrainScheduler(config,store,run,{blocked:()=>settingUpAi||draining});
  const server=createServer(async(req,res)=>{
    const serverReceivedAt=Date.now();
    const ingress=(event)=>{
      const result=store.enqueue(event);
      // Enqueue follows owner verification. Keep the actual HTTP receipt time
      // separately so that channel-check latency is included in measurements.
      if(config.company==='fumigacion')store.db.prepare('UPDATE events SET received_at=CASE WHEN received_at IS NULL OR received_at>? THEN ? ELSE received_at END WHERE id=?').run(serverReceivedAt,serverReceivedAt,event.id);
      return result;
    };
    const suspendedObservation=(event)=>{
      const result=ingress(event);
      if(!result.duplicate){
        store.db.prepare("UPDATE events SET state='OBSERVED_SUSPENDED_LINE' WHERE id=? AND state='PENDING'").run(event.id);
        // No sender on the suspended line can release or command this runtime.
        // A real staff message still takes priority over a blue-line response.
        if(event.fromMe&&event.at>=Date.parse(config.operationalLineScope.authorizedAt)&&!store.db.prepare('SELECT 1 FROM outbox WHERE mid=? AND phone=? AND line=?').get(event.id,event.phone,event.line)&&!store.conversation(event.phone)?.hold){store.noteStaffIntervention(event);store.hold(event.phone,event.id,true);}
        store.audit('SUSPENDED_LINE_SOURCE_OBSERVED',event.id,{line:event.line,fromMe:event.fromMe,customerResponseEnabled:false,businessWriteEnabled:false});
      }
      return result;
    };
    const reply=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store, private'});res.end(JSON.stringify(body));};
    const ingestion=['/event','/delivery','/webhook'].includes(req.url);
    const retentionProof=req.url==='/retention-delivery-proof';
    if(!(retentionProof?retentionProofAuthorized(config,req.headers.authorization):authorized(req.headers.authorization,ingestion?config.webhookHash:config.authHash)))return reply(401,{error:'UNAUTHORIZED'});
    if(req.method!=='POST')return reply(405,{error:'POST_REQUIRED'});
    try {
      const bodyLimit=req.url==='/notify-chief-document'?720000:20000;
      const journalGap=kind=>{if(req.url==='/webhook')recordIntakeIngressGap(store,config,{kind,receivedAt:serverReceivedAt,payloadHash:createHash('sha256').update(raw.slice(0,bodyLimit)).digest('hex'),byteLength:Buffer.byteLength(raw)});};
      let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>bodyLimit){journalGap('PAYLOAD_TOO_LARGE');return reply(413,{error:'PAYLOAD_TOO_LARGE'});}}
      let body;try{body=JSON.parse(raw);}catch{journalGap('INVALID_JSON');return reply(400,{error:'INVALID_JSON'});}
      if(retentionProof){
        if(!retentionDelivery)return reply(403,{error:'OWN_FUMIGACION_RETENTION_REQUIRED'});
        return reply(200,await retentionDelivery.deliveryProof(body));
      }
      if(req.url==='/retention-proof-setup'){
        if(config.company!=='fumigacion')return reply(403,{error:'OWN_FUMIGACION_RETENTION_REQUIRED'});
        if(draining||settingUpAi)return reply(409,{error:'OWN_RETENTION_PROOF_SETUP_BUSY'});
        try{return reply(200,installRetentionProofAccess(config,store,body));}catch{return reply(409,{error:'OWN_RETENTION_PROOF_SETUP_NOT_APPLIED'});}
      }
      if(req.url==='/intake-audit'){
        if(body.company!==config.company||Object.keys(body).some(k=>!['company','day','includeStaff','includeOutgoing','afterRow','limit'].includes(k)))return reply(400,{error:'INTAKE_AUDIT_SCOPED_DAY_REQUIRED'});
        try{return reply(200,intakeAudit(store,config,body));}catch{return reply(400,{error:'INTAKE_AUDIT_SCOPED_DAY_REQUIRED'});}
      }
      if(req.url==='/operational-audit-setup'){
        if(config.company!=='fumigacion')return reply(403,{error:'OWN_FUMIGACION_AUDIT_REQUIRED'});
        if(draining||settingUpAi)return reply(409,{error:'OWN_AUDIT_SETUP_BUSY'});
        settingUpAi=true;try{return reply(200,await installProgramSupervision(config,store,body,transport.fetcher));}
        catch{return reply(409,{error:'OWN_AUDIT_SETUP_NOT_APPLIED'});}finally{settingUpAi=false;}
      }
      if(req.url==='/daily-operational-audit'){
        if(config.company!=='fumigacion')return reply(403,{error:'OWN_FUMIGACION_AUDIT_REQUIRED'});
        if(Object.keys(body).sort().join(',')!=='company,day')return reply(400,{error:'OWN_DAILY_AUDIT_FIELDS_REQUIRED'});
        try{return reply(200,await dailyProgramCross(config,store,transport.fetcher,body));}catch{return reply(409,{error:'OWN_DAILY_AUDIT_NOT_VERIFIED'});}
      }
      if(req.url==='/retention-candidates'){
        if(config.company!=='fumigacion')return reply(403,{error:'OWN_FUMIGACION_AUDIT_REQUIRED'});
        try{return reply(200,await readRetentionCandidates(config,transport.fetcher,body));}catch{return reply(409,{error:'OWN_RETENTION_READ_NOT_VERIFIED'});}
      }
      if(req.url==='/program-setup'){
        if(config.company!=='fumigacion')return reply(403,{error:'MARIA_PROGRAM_OWN_SCOPE_REQUIRED'});
        if(draining||settingUpAi)return reply(409,{error:'PROGRAM_SETUP_BUSY'});
        settingUpAi=true;
        try{return reply(200,await installProgramSetup(config,store,body,transport.fetcher));}
        catch{return reply(409,{error:'PROGRAM_SETUP_NOT_APPLIED'});}
        finally{settingUpAi=false;}
      }
      if(req.url==='/latency')return reply(200,{company:config.name,responseTiming:responseTimingStatus(config,store)});
      if(req.url==='/tesa-health'){
        try{await refreshTesaMembership(config,transport,{force:true});return reply(200,{company:config.name,checkedAt:new Date().toISOString(),...tesaStatus(store,config)});}
        catch{return reply(409,{company:config.name,error:'TESA_MEMBERSHIP_REVIEW',...tesaStatus(store,config)});}
      }
      if(req.url==='/tesa-review'){
        if(body.company!==config.company)return reply(400,{error:'TESA_OWN_COMPANY_REQUIRED'});
        return reply(200,reviewTesaSources(store,body));
      }
      if(req.url==='/ai-setup'){
        if(draining||settingUpAi)return reply(409,{error:'AI_SETUP_BUSY'});
        settingUpAi=true;
        try{return reply(200,await installOwnAiSetup(config,store,body,transport.fetcher));}
        catch{return reply(409,{error:'AI_SETUP_NOT_APPLIED'});}
        finally{settingUpAi=false;}
      }
      if(req.url==='/ai-evaluate'){
        if(!config.conversationalAi?.ready)return reply(409,{error:'AI_SETUP_REQUIRED'});
        if(Object.keys(body).join(',')!=='caseIds')return reply(400,{error:'AI_EVALUATION_CASE_IDS'});
        if(draining||settingUpAi)return reply(409,{error:'AI_EVALUATION_BUSY'});
        settingUpAi=true;try{return reply(200,await evaluateOwnAi(config,store,transport.fetcher,body.caseIds));}finally{settingUpAi=false;}
      }
      if(req.url==='/ai-knowledge')return config.company==='fumigacion'?reply(200,{status:mariaKnowledgeStatus(config,store),document:mariaKnowledgeDocument()}):reply(403,{error:'MARIA_KNOWLEDGE_OWN_SCOPE'});
      if(req.url==='/status')return reply(200,{company:config.name,bot:config.bot,enabled:config.enabled,mode:'reception-with-human-review',operationalCoverage:operationalCoverage(config),fullyAutonomous:false,intakeJournal:intakeJournalStatus(store,config),programSupervision:programSupervisionStatus(config),preventiveRetention:config.company==='fumigacion'?{guard:PREVENTIVE_RETENTION_GUARD,prepared:true,sendsEnabled:false,notesEnabled:false,required:'own-both-line-history-and-native-delivery-note-adapter',proofAccess:retentionProofAccessStatus(config),deliveryProof:retentionDelivery.status()}:null,tesaOperations:tesaStatus(store,config),programRegistration:registrationStatus(config,store),privateNativeIdentity:privateIdentityStatus(store,config),inactivityFollowup:inactivityStatus(config,store),responseTiming:responseTimingStatus(config,store),drainIntervalMs:scheduler.intervalMs,semanticUnderstandingGuard:config.company==='fumigacion'?MARIA_UNDERSTANDING_GUARD:MIGUEL_UNDERSTANDING_GUARD,ownQuoteClarificationGuard:config.company==='fumigacion'?OWN_QUOTE_CLARIFICATION_GUARD:null,aiUsage:ownAiUsage(config,store),approvedAiKnowledge:mariaKnowledgeStatus(config,store),
        events:store.db.prepare('SELECT state,COUNT(*) n FROM events GROUP BY state').all(),outbox:store.db.prepare('SELECT state,COUNT(*) n FROM outbox GROUP BY state').all(),
        communicationGuard:'private-routing-and-media-work-v2',requestedContactGuard:'explicit-technician-contact-before-intake-v1',confirmationRecipient:config.tesaOperations?.enabled?config.tesaOperations.groupJid:questionRecipients(config,'disponibilidad-y-tecnico')[0],operationalConfirmationRecipients:config.tesaOperations?.enabled?[config.tesaOperations.groupJid]:questionRecipients(config,'disponibilidad-y-tecnico'),chiefRecipient:SANDRA,operatorRouting:config.tesaOperations?.enabled?'tesa-group-case-operations-20261008':config.operatorRouting||'sandra',privateHistoricalOperatorRouting:config.operatorRouting||'sandra',operatorRoutingGuard:'scoped-new-question-fanout-and-exact-line-answer-v1',operatorRoutingActive:operatorRoutingActive(config),chiefDocumentGuard:'fixed-chief-encrypted-hash-and-idempotency-v1',internalConversationGuard:'verified-internal-per-line-v2',chiefStatusGuard:'exact-directed-status-and-active-mode-v2',quotationQuestionGuard:'scoped-price-followup-and-existing-question-v1',internalConversationEnabled:Boolean(config.chiefOnly),customerResponsesEnabled:config.enabled,
        socialGreetingGuard:'literal-pure-social-greeting-before-semantic-review-v1',internalRoutingGuard:'exact-historical-question-and-no-cross-bot-dialogue-v1',retiredRecipientGuard:'current-route-no-ready-diego-send-v1',
        customerIntakeEnabled:config.enabled,businessWritesEnabled:registrationStatus(config,store).enabled,capabilityDisclosure:'runtime-mode-and-own-registration-status-v2',chiefReadOnlyGuard:CHIEF_READ_ONLY_GUARD,mariaAutonomousIntakeGuard:config.company==='fumigacion'?MARIA_AUTONOMOUS_INTAKE_GUARD:null,customerCourtesyGuard:'gratitude-only-without-intake-or-ownership-v1',customerAdviserGuard:config.company==='fumigacion'?ADVISER_TONE_GUARD:null,
        commonAnswerGuard:config.company==='fumigacion'?'approved-source-context-and-complete-topics-v1':null,pendingFollowupGuard:config.company==='fumigacion'?'punctuation-only-own-pending-case-without-repeat-v1':null,approvedCustomerAnswerDocuments:store.approvedCustomerAnswers().length,customerActivity:customerActivity(store,config),
        controlVisitGuard:config.company==='fumigacion'?'requested-control-antecedent-before-intake-v1':null,intakePestGuard:config.company==='fumigacion'?'literal-additive-pests-and-own-source-union-v1':null,propertyScopeGuard:config.company==='fumigacion'?'single-apartment-address-and-explicit-special-scope-v1':null,
        caseOwnershipGuard:'first-reply-source-preserved-v2',conversationContext:'stored-scoped-turns-with-coverage-v2',internalQuestionGuard:'missing-field-and-case-dedup-v1',supervisorContentReview:'explicit-source-ids-readonly-v1',liveAttentionGuard:'staff-ingestion-freeze-and-own-native-before-send-v2',intakeGuard:config.company==='fumigacion'?'service-specific-intake-and-reviewed-price-before-schedule-v2':'technical-intake-with-human-review-v1',
        priceCatalogGuard:config.company==='fumigacion'?'exact-reviewed-native-price-and-special-property-review-v1':null,approvedPriceEntries:currentPriceEntries(store.approvedPriceCatalogs()).length,
        businessPriceGuard:config.company==='fumigacion'?BUSINESS_PRICE_GUARD:null,businessPriceScheduleActive:config.company==='fumigacion'&&store.approvedPriceCatalogs().some(d=>d.kind==='approved_price_schedule'),businessPriceScheduleHash:config.company==='fumigacion'?BUSINESS_PRICE_HASH:null,
        intakeContinuationGuard:'literal-questions-and-first-batch-without-reasking-v3',intakeLiteralFieldsGuard:config.company==='fumigacion'?'literal-business-place-written-rooms-and-square-units-v4':null,intakeLocationGuard:config.company==='fumigacion'?'literal-prompted-location-and-batch-sources-v1':null,customerGreetingGuard:'pure-greeting-preserves-pending-intake-v1',linkedContentGuard:'unread-links-and-url-query-without-question-v1',serviceFollowupGuard:'existing-service-arrival-before-intake-v1',
        paymentInquiryGuard:'amount-before-intake-and-no-receipt-v1',existingQuotationGuard:'verified-prior-quote-before-intake-v1',serviceDocumentsGuard:'reported-past-service-documents-before-intake-v1',postServiceGuard:config.company==='fumigacion'?'reported-pest-control-problem-and-planned-revisit-before-intake-v3':null,
        caseAuthorship:store.db.prepare('SELECT state,COUNT(*) n FROM case_authorship GROUP BY state').all(),
        technicalScopeGuard:config.company==='servicio-tecnico'?'literal-painting-scope-before-intake-and-pending-question-v1':null,
        technicalSemanticRoutingGuard:config.company==='servicio-tecnico'?'own-current-technical-intent-before-new-intake-v1':null,
        technicalIntakeContinuityGuard:config.company==='servicio-tecnico'?TECHNICAL_INTAKE_CONTINUITY_GUARD:null,
        afterServiceKindGuard:config.company==='fumigacion'?'literal-followup-kind-and-first-source-before-new-intake-v1':null,
        unanswered:store.db.prepare("SELECT COUNT(*) n FROM questions WHERE state IN ('PENDING','LEGACY_PENDING','ANSWER_REVIEW')").get().n,
        knowledge:store.db.prepare('SELECT kind,COUNT(*) n FROM knowledge GROUP BY kind').all(),programConnected:Boolean(config.programContextUrl&&config.programToken)||registrationStatus(config,store).enabled,programContextConnected:Boolean(config.programContextUrl&&config.programToken),aiConfigured:config.conversationalAi?.provider?Boolean(config.conversationalAi.ready):Boolean(config.aiUrl&&config.aiToken),conversationalAi:aiStatus(config),priorHistoryProtection:Boolean(config.historyCheckRequired)});
      if(req.url==='/channel-health'){
        const lines=[];for(const line of operationalLines(config))lines.push(await transport.verifyLine(line.phone));
        const coverage=operationalCoverage(config);
        for(const line of config.lines.filter(line=>!operationalLineAllowed(config,line.phone)))lines.push({phone:line.phone,instance:line.instance,suspended:true,verified:false,currentCoverage:false,reason:'USER_AUTHORIZED_SUSPENDED_LINE'});
        return reply(200,{company:config.name,ready:true,operationalCoverage:coverage,lines});
      }
      if(req.url==='/ai-health'){
        if(!config.conversationalAi?.ready)return reply(409,{error:'AI_SETUP_REQUIRED',...aiStatus(config)});
        return reply(200,await transport.aiHealth(store));
      }
      if(req.url==='/supervision'){
        const after=body.afterEventRow??0,limit=body.limit??50;
        if(!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(limit)||limit<1||limit>100)return reply(400,{error:'INVALID_CURSOR'});
        const total=store.db.prepare('SELECT COUNT(*) n FROM events WHERE rowid>?').get(after).n;
        const events=store.db.prepare('SELECT rowid AS cursor,id,phone,line,at,from_me,state FROM events WHERE rowid>? ORDER BY rowid LIMIT ?').all(after,limit);
        const outbox=store.db.prepare('SELECT id,phone,line,internal,state,mid,created,updated FROM outbox ORDER BY updated DESC,rowid DESC LIMIT ?').all(limit);
        return reply(200,{company:config.name,bot:config.bot,checkedAt:new Date().toISOString(),metadataOnly:true,operationalCoverage:operationalCoverage(config),
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
      if(req.url==='/review-questions'){
        const after=body.afterRow??0,limit=body.limit??50;
        if(body.company!==config.company||!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(limit)||limit<1||limit>50)return reply(400,{error:'SCOPED_QUESTION_CURSOR_REQUIRED'});
        const rows=store.db.prepare("SELECT rowid cursor,* FROM questions WHERE rowid>? AND state IN ('PENDING','LEGACY_PENDING','ANSWER_REVIEW') ORDER BY rowid LIMIT ?").all(after,limit);
        return reply(200,{company:config.company,readOnly:true,checkedAt:new Date().toISOString(),nextRow:rows.at(-1)?.cursor??after,
          remaining:store.db.prepare("SELECT COUNT(*) n FROM questions WHERE rowid>? AND state IN ('PENDING','LEGACY_PENDING','ANSWER_REVIEW')").get(rows.at(-1)?.cursor??after).n,
          questions:rows.map(q=>({cursor:q.cursor,id:q.id,phone:q.phone,caseId:q.case_id,topic:q.topic,recipient:q.recipient,state:q.state,question:store.open(q.body),answer:q.answer?store.open(q.answer):null,answerSource:q.source_id,outbox:q.outbox_id?store.db.prepare('SELECT line,state,mid FROM outbox WHERE id=?').get(q.outbox_id):null}))});
      }
      if(req.url==='/event'){
        const bound=config.lines.find(line=>line.instance===body.instance&&line.phone===body.owner);
        if(bound&&!operationalLineAllowed(config,bound.phone)){
          const event=validateEvent(body,{...config,operationalLineScope:null});if(!event)return reply(202,{accepted:false,reason:'UNSUPPORTED_OR_STALE_OR_OUTSIDE_SCOPE'});
          await transport.verifyLineBinding(bound.phone);const result=suspendedObservation(event);
          return reply(202,{accepted:false,observed:true,...result,reason:'USER_AUTHORIZED_SUSPENDED_LINE'});
        }
        const event=validateEvent(body,config);if(!event)return reply(202,{accepted:false,reason:'UNSUPPORTED_OR_STALE_OR_OUTSIDE_SCOPE'});
        await transport.verifyLine(event.line);const queued=ingress(event);reply(202,{accepted:true,...queued});if(!queued.duplicate)scheduler.wake();return;
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
        // Group delivery metadata belongs to the separate native group proof path.
        const privateRows=(Array.isArray(body.data)?body.data:[body.data]).filter(row=>!row?.key?.remoteJid?.endsWith('@g.us'));
        let accepted=0,duplicates=0,deliveryUpdates=0;
        const own=config.lines.find(l=>l.instance===body.instance);if(!own)return reply(400,{error:'INSTANCE_OUTSIDE_SCOPE'});
        const journalBody={...body,data:privateRows};
        const intakeJournal=recordIntakeWebhook(store,config,journalBody,{authenticated:true,bindingPending:true,receivedAt:serverReceivedAt});
        let binding;
        try{binding=operationalLineAllowed(config,own.phone)?await transport.verifyLine(own.phone):await transport.verifyLineBinding(own.phone);recordIntakeBinding(store,config,journalBody,{authenticated:true,verifiedBinding:binding,receivedAt:serverReceivedAt});}
        catch(error){recordIntakeBinding(store,config,journalBody,{authenticated:true,error,receivedAt:serverReceivedAt});throw error;}
        const parsed=decodeWebhook(journalBody,config);
        if(!operationalLineAllowed(config,own.phone)){
          let observed=0;
          const unresolvedPrivateIdentity=observePrivateIdentity(store,{...body,data:privateRows},config,parsed);
          for(const value of parsed.events){const event=validateEvent(value,{...config,operationalLineScope:null});if(event){const result=suspendedObservation(event);observed++;if(result.duplicate)duplicates++;}}
          for(const d of parsed.deliveries)deliveryUpdates+=store.delivery(d.mid,own.phone,d.state);
          return reply(202,{accepted:0,observed,duplicates,deliveryUpdates,unresolvedPrivateIdentity,intakeJournal,reason:'USER_AUTHORIZED_SUSPENDED_LINE',operationalCoverage:operationalCoverage(config)});
        }
        const unresolvedPrivateIdentity=observePrivateIdentity(store,{...body,data:privateRows},config,parsed);
        const groupOperations=await ingestTesaWebhook(store,config,transport,body);
        for(const value of parsed.events){const e=validateEvent(value,config);if(e){const r=ingress(e);accepted++;if(r.duplicate)duplicates++;}}
        for(const d of parsed.deliveries){deliveryUpdates+=store.delivery(d.mid,own.phone,d.state);if(config.company==='fumigacion')recordDeliveryTiming(store,d.mid,own.phone,d.state);}
        reply(202,{accepted,duplicates,deliveryUpdates,groupOperations,unresolvedPrivateIdentity,intakeJournal});if(accepted>duplicates||groupOperations.caseAnswers)scheduler.wake();return;
      }
      if(req.url==='/delivery'){
        const line=config.lines.find(l=>l.instance===body.instance&&l.phone===body.owner);
        if(!line||!['DELIVERED','READ'].includes(body.state)||typeof body.mid!=='string')return reply(400,{error:'DELIVERY_OUTSIDE_SCOPE'});
        if(!operationalLineAllowed(config,line.phone)){
          await transport.verifyLineBinding(line.phone);
          return reply(200,{updated:store.delivery(body.mid,line.phone,body.state),observedOnly:true,reason:'USER_AUTHORIZED_SUSPENDED_LINE'});
        }
        await transport.verifyLine(line.phone);
        const n=store.delivery(body.mid,line.phone,body.state);
        if(config.company==='fumigacion')recordDeliveryTiming(store,body.mid,line.phone,body.state);
        return reply(200,{updated:n});
      }
      if(req.url==='/knowledge'){
        if(body.kind==='approved_customer_answers')await verifyApprovedAnswerSource(body,config,transport);
        if(body.kind==='approved_price_catalog'){
          validatePriceCatalog(body,config.company);
          for(const entry of body.entries)await verifyPriceSource(entry,transport);
        }
        if(body.kind==='approved_price_schedule')validatePriceCatalog(body,config.company);
        return reply(200,store.importKnowledge(body));
      }
      if(req.url==='/notify-chief-report'){
        if(!config.chiefOnly)return reply(403,{error:'INTERNAL_MODE_REQUIRED'});
        if(!/^[a-z0-9_-]{8,100}$/.test(body.key||'')||!/^[a-f0-9]{64}$/.test(body.sourceHash||'')||typeof body.text!=='string'||!body.text.trim()||body.text.length>6000||/bearer\s|api.?key|contrase[nñ]a|token\s*[:=]/i.test(body.text))return reply(400,{error:'VERIFIED_REPORT_REQUIRED'});
        const line=config.lines.find(l=>l.phone===body.line);if(!line)return reply(400,{error:'OWN_LINE_REQUIRED'});
        await transport.verifyLine(line.phone);
        const id='chief-report:'+body.key+':573016803926';
        const created=store.tx(()=>{const added=store.queue(id,'573016803926',line.phone,body.text,true,0);if(added)store.audit('USER_AUTHORIZED_CHIEF_REPORT',id,{sourceHash:body.sourceHash,line:line.phone});return added;});
        return reply(200,{queued:created,id,delivery:store.db.prepare('SELECT state,mid FROM outbox WHERE id=?').get(id)});
      }
      if(req.url==='/notify-chief-document'){
        if(!config.chiefOnly)return reply(403,{error:'INTERNAL_MODE_REQUIRED'});
        const line=config.lines.find(l=>l.phone===body.line);if(!line)return reply(400,{error:'OWN_LINE_REQUIRED'});
        if(body.recipient&&body.recipient!=='573016803926')return reply(400,{error:'CHIEF_RECIPIENT_REQUIRED'});
        await transport.verifyLine(line.phone);
        try{return reply(200,queueChiefDocument(store,body,line.phone));}catch(e){return reply(e.message==='CHIEF_DOCUMENT_ID_CONFLICT'?409:400,{error:e.message});}
      }
      if(req.url==='/import-pending-questions')return reply(200,store.importPendingQuestions(body));
      if(req.url==='/drain')return reply(200,await run());
      return reply(404,{error:'NOT_FOUND'});
    }catch{return reply(503,{error:'REVIEW_REQUIRED'});}
  });
  server.on('close',()=>scheduler.close());return server;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const config=configFromEnv();const store=new Store(config.database,config.company,config.encryptionKey);
  const transport=new Transport(config),engine=new Engine(store,config);
  createBotServer(config,store,transport,engine).listen(config.port,'0.0.0.0',()=>console.log(JSON.stringify({company:config.name,bot:config.bot,enabled:config.enabled,port:config.port})));
}
