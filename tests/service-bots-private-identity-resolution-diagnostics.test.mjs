import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {createBotServer} from '../automation/service-bots/server.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {initializePrivateNativeCachePair,privateIdentityStatus} from '../automation/service-bots/webhook.mjs';

const TOKEN='w'.repeat(43),LID='123456789012309@lid',PHONE='573000006143',MID='ISOLATED_CURRENT_NATIVE_CALLBACK';
async function fixture(kind,run){
 const now=Date.now(),at=Math.floor((now-1000)/1000)*1000,start=at-10000;
 const c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:false,activatedAt:at-3600000,responseTargetMs:null,historyCheckRequired:false,authHash:createHash('sha256').update('a'.repeat(43)).digest('hex'),webhookHash:createHash('sha256').update(TOKEN).digest('hex'),lines:[{phone:'573126944997',instance:'cucaracha-azul'},{phone:'573126938721',instance:'cucaracha-roja'}]};
 const s=new Store(':memory:',c.company,randomBytes(32));initializePrivateNativeCachePair(s,c,start);
 const current={key:{id:MID,remoteJid:LID,fromMe:false},messageTimestamp:at/1000,message:{conversation:'PRIVATE_CUSTOMER_BODY_NOT_IN_DIAGNOSTICS'}},native=structuredClone(current),pair={key:{id:'ISOLATED_NATIVE_PAIRED_SOURCE',remoteJid:LID,remoteJidAlt:PHONE+'@s.whatsapp.net',fromMe:true},messageTimestamp:(at-1000)/1000,message:{conversation:'PRIVATE_STAFF_BODY_NOT_IN_DIAGNOSTICS'},status:'DELIVERY_ACK'};
 if(kind==='body-mismatch')native.message.conversation='DIFFERENT_PRIVATE_NATIVE_BODY';
 if(kind==='context-mismatch')native.contextInfo={stanzaId:'DIFFERENT_NATIVE_CONTEXT'};
 if(kind==='native-changed')native.edited=true;
 const nativeRows=kind==='source-absent'?[pair]:[native,pair];
 const t={config:c,verifyLine:async phone=>({phone,instance:'cucaracha-azul',open:true,ownerVerified:true,checkedAt:new Date().toISOString()}),request:async()=>{if(kind==='provider-failure')throw Error('https://private.invalid/?token=PRIVATE_TOKEN_NOT_IN_DIAGNOSTICS');return {messages:{total:nativeRows.length,records:nativeRows}};}};
 const server=createBotServer(c,s,t,{});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/webhook',{method:'POST',headers:{Authorization:'Bearer '+TOKEN,'Content-Type':'application/json'},body:JSON.stringify({instance:'cucaracha-azul',event:'messages.upsert',data:current}),signal:AbortSignal.timeout(3000)});
  await run({s,c,at,start,response,value:await response.json()});
 }finally{await new Promise(resolve=>server.close(resolve));s.close();}
}

for(const [kind,reason] of [['source-absent','EXACT_CURRENT_NATIVE_SOURCE_UNVERIFIED'],['body-mismatch','EXACT_CURRENT_NATIVE_SOURCE_UNVERIFIED'],['context-mismatch','EXACT_CURRENT_NATIVE_SOURCE_UNVERIFIED'],['native-changed','EXACT_CURRENT_NATIVE_SOURCE_UNVERIFIED'],['provider-failure','NATIVE_PAIR_PAGE_UNVERIFIED']])test('an unresolved '+kind+' preserves an encrypted per-source reason without replay or private content',async()=>fixture(kind,async f=>{
 assert.equal(f.response.status,202);assert.equal(f.value.accepted,0);assert.equal(privateIdentityStatus(f.s,f.c).unresolvedSources,1);
 const rows=f.s.db.prepare("SELECT source,detail FROM audit WHERE action='PRIVATE_NATIVE_IDENTITY_CACHE_PAIR_UNRESOLVED'").all();assert.equal(rows.length,1);assert.equal(rows[0].source,MID);
 assert.doesNotMatch(rows[0].detail,/PRIVATE_|PRIVATE_TOKEN|DIFFERENT_PRIVATE|conversation/);
 const detail=f.s.open(rows[0].detail);assert.equal(detail.reason,reason);assert.equal(detail.providerAt,f.at);assert.equal(detail.firstInstalledAt,f.start);assert.ok(detail.receivedAt>=f.at);assert.equal(detail.originalJournalPreserved,true);assert.equal(detail.customerEventQueued,false);assert.equal(detail.historicalReplayEnabled,false);
 if(kind==='provider-failure')assert.equal(detail.diagnostics,undefined);
 else assert.deepEqual(detail.diagnostics,{exactMatches:kind==='source-absent'?0:1,sourceBodyMatches:!['source-absent','body-mismatch'].includes(kind),sourceContextMatches:!['source-absent','context-mismatch'].includes(kind),nativePageContainsSource:kind!=='source-absent',nativeChanged:kind==='native-changed'});
 assert.doesNotMatch(JSON.stringify(detail),/PRIVATE_CUSTOMER|PRIVATE_STAFF|PRIVATE_TOKEN|DIFFERENT_PRIVATE|DIFFERENT_NATIVE_CONTEXT|https:|conversation|@lid|@s\.whatsapp\.net/);
 assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM intake_journal WHERE original=1').get().n,1);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM events').get().n,0);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
}));
