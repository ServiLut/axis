import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,SANDRA,DIEGO,HILARY,OPERATOR_ROUTING} from '../automation/service-bots/config.mjs';

function fixture(company='fumigacion',enabled=true){
  const store=new Store(':memory:',company,randomBytes(32));
  const config={company,...BUSINESSES[company],enabled,chiefOnly:true,operatorRouting:OPERATOR_ROUTING,lines:BUSINESSES[company].phones.map(phone=>({phone}))};
  const engine=new Engine(store,config);let seq=0;
  return {store,config,seed(phone,state={slots:{},asked:[]}){
    const id='SEED_'+phone;store.enqueue({id,phone,line:config.lines[0].phone,kind:'text',fromMe:false,text:'',at:Date.now()-1000});
    store.db.prepare("UPDATE events SET state='DONE' WHERE id=?").run(id);store.saveConversation(phone,{...state,lastHandledSourceId:id});
  },async process(text,patch={}){
    const e={id:'DIRECTED_QUOTE_'+(++seq),phone:SANDRA,line:config.lines[0].phone,kind:'text',fromMe:false,text,at:Date.now()+seq,...patch};
    store.enqueue(e);await engine.process(e);return e;
  }};
}

test('native directed active questions answer the actual mode once and keep human attention',async()=>{
  for(const enabled of [true,false])for(const text of ['maria estas activa?','maria angel, estas activa?']){
    const f=fixture('fumigacion',enabled);try{
      f.seed(SANDRA);
      f.store.hold(SANDRA,'STAFF_SOURCE',true);
      const e=await f.process(text);await new Engine(f.store,f.config).process(e);
      assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(e.id).state,'CHIEF_PRESENCE');
      const rows=f.store.db.prepare('SELECT * FROM outbox').all();assert.equal(rows.length,1);
      assert.equal(rows[0].phone,SANDRA);assert.equal(rows[0].internal,1);
      const reply=f.store.open(rows[0].body);assert.match(reply,enabled?/activa/:/pausada/);
      assert.doesNotMatch(reply,/guardé tu solicitud|ejecutado cambios/);
      assert.equal(f.store.conversation(SANDRA).hold,1);
    }finally{f.store.close();}
  }
});

test('short bot name never grants general authority, third person or forwarded status',async()=>{
  const f=fixture();try{
    f.seed('573001112233');
    f.store.hold('573001112233','CUSTOMER_STAFF',true);
    for(const [text,patch] of [['Maria dijo que estas activa?',{}],['Maria, retoma el chat de 573001112233',{}],['maria estas activa?',{forwarded:true}]]){
      await f.process(text,patch);
    }
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
    assert.equal(f.store.conversation('573001112233').hold,1);
  }finally{f.store.close();}
});

test('technical price followup reuses the exact pending operational case without consulting Sandra again',async()=>{
  const f=fixture('servicio-tecnico');try{
    const phone='573001112233',line=f.config.lines[0].phone,caseId='TECH_PRICE_CASE';
    f.seed(phone,{caseId,slots:{service:'calentador',detail:'Por tiempo necesita mantenimiento',location:'envigado',preference:'En la tarde'},asked:['detail','location','preference'],introduced:true});
    const q=f.store.questionToRecipients({phone,line,caseId,topic:'disponibilidad-y-cotizacion',conditions:{service:'calentador'},recipients:[DIEGO],source:'EARLIER_REQUEST',text:'¿Qué técnico, horario disponible y cotización corresponden a este caso?'});
    f.store.db.prepare("UPDATE outbox SET state='ACCEPTED',mid='PENDING_DIEGO_MID' WHERE id=?").run('question:'+q.id);
    await f.process('Cuál es el costo',{phone});
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,1);
    assert.deepEqual(f.store.db.prepare('SELECT phone FROM outbox').all().map(r=>r.phone),[DIEGO]);
    assert.equal(f.store.db.prepare('SELECT state FROM questions WHERE id=?').get(q.id).state,'PENDING');
    assert.equal(f.store.db.prepare('SELECT mid FROM outbox').get().mid,'PENDING_DIEGO_MID');
  }finally{f.store.close();}
});

test('new price question follows only the approved company route and deduplicates repetition',async()=>{
  for(const company of ['fumigacion','servicio-tecnico']){
    const f=fixture(company);try{
      const phone='573001112233';
      f.seed(phone,{caseId:'NEW_PRICE_CASE',slots:company==='fumigacion'?{service:'cucarachas',site:'casa',location:'bello',rooms:'3 habitaciones'}:{service:'calentador',detail:'Por tiempo necesita mantenimiento',location:'envigado'},asked:[],introduced:true});
      await f.process('Cuál es el costo',{phone});await f.process('Cuál es el costo',{phone});
      const rows=f.store.db.prepare('SELECT phone FROM outbox WHERE internal=1 ORDER BY phone').all();
      assert.deepEqual(rows.map(r=>r.phone),company==='fumigacion'?[DIEGO,HILARY].sort():[DIEGO]);
      assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,1);
      assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE internal=0').get().n,1);
    }finally{f.store.close();}
  }
});

test('existing price question at Sandra preserves its recipient and delivery after the correction',async()=>{
  const f=fixture('servicio-tecnico');try{
    const phone='573001112233',line=f.config.lines[0].phone,caseId='OLD_PRICE_CASE';
    f.seed(phone,{caseId,slots:{service:'calentador',detail:'No calienta',location:'envigado'},asked:[],introduced:true});
    const q=f.store.question({phone,line,caseId,topic:'customer-question',conditions:{question:'cual es el costo',caseId},recipient:SANDRA,source:'OLD_PRICE_SOURCE',text:'Pregunta de precio ya enviada.'});
    f.store.db.prepare("UPDATE outbox SET state='DELIVERED',mid='OLD_SANDRA_MID' WHERE id=?").run('question:'+q.id);
    await f.process('Cuál es el costo',{phone});
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,1);
    assert.deepEqual(f.store.db.prepare('SELECT phone,mid,state FROM outbox').all().map(row=>({...row})),[{phone:SANDRA,mid:'OLD_SANDRA_MID',state:'DELIVERED'}]);
  }finally{f.store.close();}
});

test('payment and complaint exceptions keep Sandra despite the word cost',async()=>{
  for(const text of ['Cuánto debo pagar por el servicio?','El costo de este servicio, quiero una devolución']){
    const f=fixture('servicio-tecnico');try{
      await f.process(text,{phone:'573001112233'});
      assert.deepEqual(f.store.db.prepare('SELECT phone FROM outbox WHERE internal=1').all().map(r=>r.phone),[SANDRA]);
    }finally{f.store.close();}
  }
});
