import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {BUSINESSES,SANDRA} from '../automation/service-bots/config.mjs';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';

test('a literal natural-language read request quoting an active own question reaches the durable planner rather than answering that case',async()=>{
 const now=Date.now(),c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,activatedAt:now-60000,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'chief-read-precedence-'+i}))},s=new Store(':memory:',c.company,randomBytes(32));
 try{
  const customer='573000001234',line=c.lines[0].phone,caseId='fumigacion:SYNTHETIC_CUSTOMER_READ_PRECEDENCE';
  const question=s.question({phone:customer,line,caseId,recipient:SANDRA,topic:'disponibilidad-y-tecnico',conditions:{caseId},source:'SYNTHETIC_CUSTOMER_READ_PRECEDENCE',text:'¿Qué técnico está disponible para este caso sintético?'});
  const before=s.db.prepare('SELECT * FROM questions WHERE id=?').get(question.id);
  s.db.prepare("UPDATE outbox SET mid='SYNTHETIC_DELIVERED_READ_PRECEDENCE',state='DELIVERED' WHERE id=?").run(before.outbox_id);
  const e={id:'SYNTHETIC_CHIEF_READ_PRECEDENCE',phone:SANDRA,line,at:now,kind:'text',fromMe:false,forwarded:false,quotedId:'SYNTHETIC_DELIVERED_READ_PRECEDENCE',text:'María, hazme un balance de cuántas conversaciones nos escribieron hoy'};
  s.enqueue(e);await new Engine(s,c).process(e);
  assert.equal(s.db.prepare('SELECT state FROM events WHERE id=?').get(e.id).state,'CHIEF_COMMAND_QUEUED');
  assert.deepEqual(s.db.prepare('SELECT * FROM questions WHERE id=?').get(question.id),before);
  const command=s.db.prepare('SELECT state,body FROM chief_commands WHERE source_id=?').get(e.id),stored=s.open(command.body);
  assert.equal(command.state,'PENDING');assert.equal(stored.plan.sourceReadIntent,true);assert.equal(stored.plan.action,'unsupported');assert.equal(stored.plan.params.modelEligible,true);assert.deepEqual(stored.source,e);
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM outbox WHERE id LIKE ?').get(e.id+'%').n,0);
 }finally{s.close();}
});
