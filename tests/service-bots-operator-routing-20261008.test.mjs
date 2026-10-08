import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {
  BUSINESSES,SANDRA,DIEGO,HILARY,OPERATOR_ROUTING,CURRENT_OPERATOR_ROUTING,
  TECHNICAL_COORDINATOR,knownInternalRecipient,internalRecipients,
  operatorRoutingActive,questionRecipients,configFromEnv,
} from '../automation/service-bots/config.mjs';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';

const config=(company='fumigacion',route=CURRENT_OPERATOR_ROUTING)=>({
  company,...BUSINESSES[company],operatorRouting:route,enabled:true,chiefOnly:true,
  activatedAt:Date.now()-60000,
  lines:BUSINESSES[company].phones.map((phone,i)=>({phone,instance:'synthetic-own-'+i,apiKey:String(i).repeat(32)})),
});
const ownEnv=c=>({BOT_COMPANY:c.company,BOT_LINES_JSON:JSON.stringify(c.lines),
  BOT_AUTH_TOKEN_HASH:'a'.repeat(64),BOT_WEBHOOK_TOKEN_HASH:'c'.repeat(64),BOT_DATA_KEY:'b'.repeat(64),
  BOT_DATABASE_PATH:'/data/'+c.company+'/bot.sqlite',BOT_EVOLUTION_URL:'https://own.example'});
test('Oct 8 operational recipients are exact, single and separate from the old route',()=>{
  assert.equal(CURRENT_OPERATOR_ROUTING,'hilary-and-fumigacion-blue-20261008');
  assert.equal(OPERATOR_ROUTING,'diego-hilary-20261005');
  assert.equal(TECHNICAL_COORDINATOR,'573126944997');
  for(const company of ['fumigacion','servicio-tecnico']){
    const c=config(company);
    for(const topic of ['cotizacion-verificada','special-quotation','disponibilidad-y-cotizacion','disponibilidad-y-tecnico','requested-technician-contact','existing-quotation','missing-intake:service','missing-intake:preference']){
      assert.deepEqual(questionRecipients(c,topic),company==='fumigacion'?[HILARY]:[TECHNICAL_COORDINATOR]);
      assert.equal(questionRecipients(c,topic).includes(DIEGO),false);
    }
    assert.deepEqual(questionRecipients({...c,operatorRouting:OPERATOR_ROUTING},'cotizacion-verificada'),company==='fumigacion'?[DIEGO,HILARY]:[DIEGO]);
  }
});
test('arrival is operational; warranty, reinforcement, control and unknown kinds retain Sandra',()=>{
  for(const company of ['fumigacion','servicio-tecnico']){
    const c=config(company);
    assert.deepEqual(questionRecipients(c,'service-followup',{kind:'arrival'}),company==='fumigacion'?[HILARY]:[TECHNICAL_COORDINATOR]);
    for(const conditions of [{},{kind:'post-service'},{kind:'planned-revisit'},{kind:'requested-control'},{kind:'warranty'},{kind:'Arrival'},null]){
      assert.deepEqual(questionRecipients(c,'service-followup',conditions),[SANDRA]);
    }
    assert.deepEqual(questionRecipients({...c,operatorRouting:OPERATOR_ROUTING},'service-followup',{kind:'post-service'}),company==='fumigacion'?[DIEGO,HILARY]:[DIEGO]);
  }
});
test('direction, payments, documents, policies and unapproved topics receive no operator authority',()=>{
  for(const company of ['fumigacion','servicio-tecnico']){
    const c=config(company);
    for(const topic of ['payment-instructions','service-documents','customer-question','revision:safety','guarantee','release-chat','common-question','missing-intake:policy'])assert.deepEqual(questionRecipients(c,topic),[SANDRA]);
    assert.deepEqual(questionRecipients({...c,company:'unknown'},'cotizacion-verificada'),[SANDRA]);
  }
});
test('configuration accepts the new exact version while preserving historical and default configurations',()=>{
  for(const company of ['fumigacion','servicio-tecnico']){
    const env=ownEnv(config(company));
    for(const version of [CURRENT_OPERATOR_ROUTING,OPERATOR_ROUTING,'sandra'])assert.equal(configFromEnv({...env,BOT_OPERATIONAL_ROUTING:version}).operatorRouting,version);
    assert.equal(configFromEnv(env).operatorRouting,'sandra');
    assert.throws(()=>configFromEnv({...env,BOT_OPERATIONAL_ROUTING:'all-operators'}),/OPERATOR_ROUTING_REQUIRED/);
  }
});
test('runtime status detects both exact versions without treating unknown values as active',()=>{
  assert.equal(operatorRoutingActive(config()),true);
  assert.equal(operatorRoutingActive(config('fumigacion',OPERATOR_ROUTING)),true);
  assert.equal(operatorRoutingActive(config('fumigacion','sandra')),false);
  assert.equal(operatorRoutingActive(config('fumigacion','unknown')),false);
});
test('all own lines are known internal; only FUM blue is the new ST coordinator',()=>{
  for(const b of Object.values(BUSINESSES))for(const phone of b.phones)assert.equal(knownInternalRecipient(phone),true);
  assert.deepEqual(internalRecipients(config()),[SANDRA,DIEGO,HILARY]);
  assert.deepEqual(internalRecipients(config('servicio-tecnico')),[SANDRA,DIEGO,TECHNICAL_COORDINATOR]);
  assert.deepEqual(internalRecipients(config('servicio-tecnico',OPERATOR_ROUTING)),[SANDRA,DIEGO]);
  assert.equal(internalRecipients(config()).includes(BUSINESSES['servicio-tecnico'].phones[0]),false);
  assert.equal(internalRecipients(config('servicio-tecnico')).includes(BUSINESSES.fumigacion.phones[1]),false);
});
test('FUM observes incoming questions from both ST native lines in silence, without intake or approval',async()=>{
  for(const phone of BUSINESSES['servicio-tecnico'].phones){
    const c=config(),store=new Store(':memory:','fumigacion',randomBytes(32));
    try{
      const event={id:'NATIVE_ST_QUESTION_001',at:Date.now(),phone,line:c.lines[0].phone,kind:'text',fromMe:false,text:'María Ángel, confirma disponibilidad y costo para este servicio.',forwarded:false,quotedId:null};
      store.enqueue(event);await new Engine(store,c).process(event);
      assert.equal(store.db.prepare('SELECT state FROM events WHERE id=?').get(event.id).state,'OBSERVED_INTERNAL_OUTSIDE_SCOPE');
      assert.equal(store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
      assert.equal(store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
    }finally{store.close();}
  }
});
test('the new configuration preserves historical pending recipient, delivered ID and own case',()=>{
  const c=config(),store=new Store(':memory:','fumigacion',randomBytes(32));
  try{
    const base={phone:'573001112233',line:c.lines[0].phone,caseId:'HISTORICAL_CASE_001',topic:'cotizacion-verificada',conditions:{service:'ratas'},source:'HISTORICAL_SOURCE_001'};
    const old=store.question({...base,recipient:DIEGO,text:'Consulta histórica exacta.'});
    store.db.prepare("UPDATE outbox SET state='DELIVERED',mid=? WHERE phone=?").run('HISTORICAL_DELIVERED_MID',DIEGO);
    const next=store.questionToRecipients({...base,conditions:{service:'ratas',rooms:'3 habitaciones'},recipients:questionRecipients(c,base.topic),text:'Detalle nuevo de la misma consulta.'});
    assert.equal(next.created,false);assert.equal(next.id,old.id);
    const rows=store.db.prepare('SELECT phone,mid,state FROM outbox').all().map(row=>({...row}));
    assert.deepEqual(rows,[{phone:DIEGO,mid:'HISTORICAL_DELIVERED_MID',state:'DELIVERED'}]);
    assert.equal(store.db.prepare('SELECT COUNT(*) n FROM question_routes').get().n,0);
    assert.equal(store.db.prepare('SELECT case_id FROM questions WHERE id=?').get(old.id).case_id,base.caseId);
  }finally{store.close();}
});
