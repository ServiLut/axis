import assert from 'node:assert/strict';
import {test} from 'node:test';
import {loadServerModule} from './load-server-module';
import type * as Review from '../lib/psychology-campaign-review';
test('campaign reads prior context and service counts; unresolved questions, opt-out, human takeover and missing audio stop it',async()=>{
 let stage:string|null=null;let intent='courtesy';let confidence=0.99;let noHistory=false;let unreadAudio=false;let staffAnswered=true;let calls=0;
 const api=loadServerModule<typeof Review>('lib/psychology-campaign-review.ts',{
  './psychology-chatwoot':{readPsychologyHistory:async()=>({coverage:'recent_only_not_complete_history',messages:noHistory?[]:[{direction:'inbound',text:unreadAudio?'[Archivo o audio previo sin transcripción disponible]':'Gracias',at:'2026-01-01T12:00:00Z'},...(staffAnswered?[{direction:'outbound_staff_or_bot',text:'Con gusto',at:'2026-01-01T12:01:00Z'}]:[])]})},
  './psychology-ai':{understandPsychologyMessage:async(_:unknown,c:any)=>{calls++;assert.equal(c.serviceHistory.completed,3);assert.equal(c.serviceHistory.lastProfessionalId,12);return {intent,confidence}}},
 });
 const db={$queryRaw:async()=>[{clientId:1,professionalId:null,stage,completed:3n,lastProfessionalId:12}]};
 const item={id:'source:reactivate:client:1',phone:'573001111111'};
 assert.equal((await api.reviewCampaignContext(db as never,item)).completed,3);
 for(const changed of ['stop','urgent','unknown','reject']){intent=changed;await assert.rejects(()=>api.reviewCampaignContext(db as never,item),/CAMPAIGN_CONTEXT_REVIEW/);}
 intent='question';staffAnswered=false;await assert.rejects(()=>api.reviewCampaignContext(db as never,item));
 intent='courtesy';confidence=0.5;await assert.rejects(()=>api.reviewCampaignContext(db as never,item));confidence=0.99;
 stage='HUMAN';const before=calls;await assert.rejects(()=>api.reviewCampaignContext(db as never,item));assert.equal(calls,before);
 stage=null;unreadAudio=true;await assert.rejects(()=>api.reviewCampaignContext(db as never,item));assert.equal(calls,before);
 unreadAudio=false;noHistory=true;await assert.rejects(()=>api.reviewCampaignContext(db as never,item));assert.equal(calls,before);
});
