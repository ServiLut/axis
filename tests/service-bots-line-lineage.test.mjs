import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';

const blue='573126944997',red='573126938721',phone='573001112233';
const source=patch=>({id:'BLUE_NEW',phone,line:blue,at:Date.now(),fromMe:false,kind:'text',text:'Hola',...patch});
function fixture(){
 const s=new Store(':memory:','fumigacion',randomBytes(32));
 const c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,activatedAt:Date.now()-60000,lines:[{phone:blue},{phone:red}],
 operationalLineScope:{version:'authorized-fumigacion-blue-only-v1',company:'fumigacion',activeLines:[blue],suspendedLines:[red],authorizedAt:new Date(Date.now()-1000).toISOString(),authorizationSource:'direct-user-20261009-red-block-24h'}};
 const e=source();s.enqueue(e);return {s,c,e};
}
test('blue lineage reads do not change evidence, conversation or delivery states',()=>{
 const {s,e}=fixture();try{
  const before=JSON.stringify(s.conversation(phone)),events=s.db.prepare('SELECT * FROM events').all();
  assert.equal(s.hasSourcesOutsideLine(phone,blue),false);
  assert.equal(JSON.stringify(s.conversation(phone)),before);assert.deepEqual(s.db.prepare('SELECT * FROM events').all(),events);
 }finally{s.close();}
});
test('a newer blue message cannot conceal a red source or a shared native MID',()=>{
 for(const shared of [false,true]){const {s,e}=fixture();try{
  if(shared)s.enqueue({...e,line:red});else{s.enqueue(source({id:'RED_OLD',line:red,at:e.at-1000}));s.enqueue(source({id:'BLUE_LATER',at:e.at+1000}));}
  assert.equal(s.conversation(phone).line,blue);assert.equal(s.hasSourcesOutsideLine(phone,blue),true);
 }finally{s.close();}}
});
test('red delivered, read and uncertain outputs remain outside scope without replay',()=>{
 for(const state of ['DELIVERED','READ','UNCERTAIN']){const {s}=fixture();try{
  s.queue('RED_RESULT',phone,red,'Respuesta histórica.',false,0);
  s.db.prepare('UPDATE outbox SET state=?,mid=? WHERE id=?').run(state,'REAL_OLD_MID','RED_RESULT');
  assert.equal(s.hasSourcesOutsideLine(phone,blue),true);
  assert.equal(s.db.prepare('SELECT state FROM outbox WHERE id=?').get('RED_RESULT').state,state);
 }finally{s.close();}}
});
test('an original red operational question remains red even when latest conversation is blue',()=>{
 const {s,e}=fixture();try{
  s.question({phone,line:red,caseId:'fumigacion:'+e.id,topic:'availability',conditions:{},recipient:'573016803926',text:'Consulta anterior.',source:e.id});
  assert.equal(s.hasSourcesOutsideLine(phone,blue),true);
 }finally{s.close();}
});
test('positive red history is inspected before replacing the cached two-line result',()=>{
 const {s,e}=fixture();try{
  s.savePriorHistory(phone,{cutoff:0,priorOutgoing:false,checks:[{line:blue,total:0},{line:red,total:1}]},e.id);
  assert.equal(s.hasSourcesOutsideLine(phone,blue),true);
  assert.equal(s.priorHistory(phone).checks[1].total,1);
 }finally{s.close();}
});
test('unknown lineage or incomplete history metadata conserves review',()=>{
 for(const kind of ['line','history']){const {s}=fixture();try{
  if(kind==='line')s.db.prepare('UPDATE events SET line=NULL WHERE phone=?').run(phone);
  else s.db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run('prior-history:'+phone,s.seal({priorOutgoing:false}));
  assert.equal(s.hasSourcesOutsideLine(phone,blue),true);
 }finally{s.close();}}
});
test('direct engine processing cannot migrate a shared case and preserves a human hold',async()=>{
 for(const human of [false,true]){const {s,c,e}=fixture();try{
  s.enqueue({...e,line:red});if(human)s.hold(phone,'REAL_STAFF',true);
  await new Engine(s,c).process(e);
  assert.equal(s.db.prepare('SELECT state FROM events WHERE id=?').get(e.id).state,human?'OBSERVED_SUPERSEDED':'OBSERVED_TEMPORARY_LINE_SCOPE');
  assert.equal(s.conversation(phone).hold,Number(human));assert.equal(s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
 }finally{s.close();}}
});
test('legacy two-line engine does not adopt the temporary scope implicitly',async()=>{
 const {s,c,e}=fixture();try{
  delete c.operationalLineScope;s.enqueue({...e,line:red});await new Engine(s,c).process(e);
  assert.notEqual(s.db.prepare('SELECT state FROM events WHERE id=?').get(e.id).state,'OBSERVED_TEMPORARY_LINE_SCOPE');
 }finally{s.close();}
});
