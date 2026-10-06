import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,DIEGO,HILARY,OPERATOR_ROUTING} from '../automation/service-bots/config.mjs';

function fixture(company='fumigacion') {
  const store=new Store(':memory:',company,randomBytes(32));
  const config={company,...BUSINESSES[company],enabled:true,chiefOnly:true,operatorRouting:OPERATOR_ROUTING};
  const phone='573001112233',line=config.phones[0],caseId='PENDING_PING_CASE';
  const seed={id:'PENDING_PING_SEED',phone,line,at:Date.now()-1000,fromMe:false,kind:'text',text:'1 habitación y cocina'};
  store.enqueue(seed);store.db.prepare("UPDATE events SET state='DONE' WHERE id=?").run(seed.id);
  const state={caseId,slots:{service:'cucarachas y chinches',rooms:'1 habitación'},asked:['site'],introduced:true,lastHandledSourceId:seed.id};
  store.saveConversation(phone,state);
  const engine=new Engine(store,config);let n=0;
  return {store,phone,line,caseId,state,pending(patch={}) {
    const q=store.questionToRecipients({phone,line,caseId,topic:'missing-intake:site',conditions:{missing:'site'},source:seed.id,text:'¿Qué tipo de inmueble corresponde a esta solicitud?',recipients:company==='fumigacion'?[DIEGO,HILARY]:[DIEGO],...patch});
    store.db.prepare("UPDATE outbox SET state='DELIVERED',mid=id WHERE internal=1").run();
    return q;
  },async process(text,patch={}) {
    const event={id:'PENDING_PING_'+(++n),phone,line,at:Date.now()+n,fromMe:false,kind:'text',text,...patch};
    store.enqueue(event);await engine.process(event);return event;
  }};
}

test('the observed punctuation followup keeps existing case questions and both deliveries without another acknowledgement',async()=>{
  const f=fixture();try {
    const q=f.pending(),before=f.store.db.prepare('SELECT * FROM outbox ORDER BY id').all();
    for(const text of ['?','¿??',' ? ']) {
      const event=await f.process(text);
      assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(event.id).state,'OBSERVED_PENDING_FOLLOWUP');
    }
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,1);
    assert.deepEqual(f.store.db.prepare('SELECT * FROM outbox ORDER BY id').all(),before);
    assert.equal(f.store.db.prepare('SELECT state FROM questions WHERE id=?').get(q.id).state,'PENDING');
    assert.deepEqual(f.store.conversation(f.phone).state.slots,f.state.slots);
    assert.deepEqual(f.store.conversation(f.phone).state.asked,f.state.asked);
  }finally{f.store.close();}
});

test('a personal exception with words remains a distinct review even while an intake question is pending',async()=>{
  const f=fixture();try {
    f.pending();const event=await f.process('No vamos a poder esperarlos que pena reprogramemos porfa');
    assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(event.id).state,'REVIEW');
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,2);
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE id=?').get(event.id+':reply').n,1);
  }finally{f.store.close();}
});

test('human attention takes priority over punctuation followups and is never released',async()=>{
  const f=fixture();try {
    f.pending();f.store.hold(f.phone,'STAFF_HOLD',true);const event=await f.process('?');
    assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(event.id).state,'OBSERVED_HUMAN');
    assert.equal(f.store.conversation(f.phone).hold,1);
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,2);
  }finally{f.store.close();}
});

test('a punctuation source cannot reuse another case, line, forwarded message or another company',async()=>{
  for(const scenario of ['case','line','forwarded','no-pending','company']) {
    const f=fixture(scenario==='company'?'servicio-tecnico':'fumigacion');try {
      if(scenario!=='no-pending')f.pending(scenario==='case'?{caseId:'OTHER_CASE'}:scenario==='line'?{line:BUSINESSES.fumigacion.phones[1]}:{});
      const event=await f.process('?',scenario==='forwarded'?{forwarded:true}:{});
      assert.notEqual(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(event.id).state,'OBSERVED_PENDING_FOLLOWUP');
    }finally{f.store.close();}
  }
});
