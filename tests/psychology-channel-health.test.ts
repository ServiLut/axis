import assert from 'node:assert/strict';
import {test} from 'node:test';
import {psychologyChannelHealth,verifyPsychologyChannel} from '../lib/psychology-chatwoot';

test('channel health checks actual connection and identity, independently of enabled configuration',async(t)=>{
 const originalFetch=globalThis.fetch;
 const oldEvolution=process.env.PSICOLOGOS_EVOLUTION_TOKEN,oldChatwoot=process.env.PSICOLOGOS_CHATWOOT_TOKEN;
 process.env.PSICOLOGOS_EVOLUTION_TOKEN='synthetic';process.env.PSICOLOGOS_CHATWOOT_TOKEN='synthetic';
 t.after(()=>{globalThis.fetch=originalFetch;for(const [key,value] of [['PSICOLOGOS_EVOLUTION_TOKEN',oldEvolution],['PSICOLOGOS_CHATWOOT_TOKEN',oldChatwoot]]){if(value===undefined)delete process.env[key!];else process.env[key!]=value;}});
 const own={name:'psicologos-en-colombia',ownerJid:'573016818845@s.whatsapp.net',connectionStatus:'open'};
 const inbox={id:10,name:'WhatsApp Psicólogos 3016818845',channel_type:'Channel::Api'};
 let calls=0;
 const mock=(instances:unknown,inboxes:unknown={payload:[inbox]})=>{calls=0;globalThis.fetch=async()=>new Response(JSON.stringify(++calls===1?instances:inboxes),{status:200});};
 await t.test('a closed verified instance is not ready',async()=>{mock([{...own,connectionStatus:'close'}]);const h=await psychologyChannelHealth();assert.equal(h.ready,false);assert.equal(h.whatsapp,'disconnected');assert.equal(calls,1);});
 await t.test('open state of another owner is rejected',async()=>{mock([{...own,ownerJid:'573152819233@s.whatsapp.net'}]);const h=await psychologyChannelHealth();assert.equal(h.whatsapp,'unverified-owner');assert.equal(h.ready,false);});
 await t.test('wrong inbox cannot pass an open WhatsApp',async()=>{mock([own],{payload:[{...inbox,name:'otra empresa'}]});const h=await psychologyChannelHealth();assert.equal(h.whatsapp,'connected');assert.equal(h.chatwoot,'unverified-inbox');assert.equal(h.ready,false);});
 await t.test('network error is unknown availability, never healthy',async()=>{globalThis.fetch=async()=>{throw Error('synthetic network failure');};const h=await psychologyChannelHealth();assert.equal(h.whatsapp,'unavailable');assert.equal(h.ready,false);assert.ok(!JSON.stringify(h).includes('synthetic'));});
 await t.test('verified owner, open connection and exact inbox are ready',async()=>{mock([own]);const h=await psychologyChannelHealth();assert.equal(h.ready,true);assert.equal(h.chatwoot,'verified');});
 await t.test('outbound verification still fails closed',async()=>{mock([{...own,connectionStatus:'close'}]);await assert.rejects(verifyPsychologyChannel(),/WA_UNVERIFIED/);});
});
