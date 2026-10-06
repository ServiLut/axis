import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {approvedBusinessPriceSchedule,selectBusinessPrice,BUSINESS_PRICE_HASH} from '../automation/service-bots/business-prices.mjs';
import {mariaKnowledgeDocument,persistMariaKnowledge,mariaKnowledgeStatus,mariaModelKnowledge,MARIA_KNOWLEDGE_HASH} from '../automation/service-bots/maria-knowledge.mjs';

test('compiled Maria knowledge has exact approved rates and preserves unapproved topics as pending',()=>{
 const d=mariaKnowledgeDocument();
 assert.equal(d.company,'FUMIGACION');assert.equal(d.priceScheduleHash,BUSINESS_PRICE_HASH);
 assert.equal(d.pricing.chinchesPerMattressCop,99000);assert.equal(d.rules.length,9);
 assert.equal(d.complete,false);assert.equal(d.modelTrainingPerformed,false);
 const text=JSON.stringify(d);
 assert.doesNotMatch(text,/cucarachasMinimum|roedoresMinimum|100000|70000|573\d{9}|PSICOLOGOS|S\.TECNICO/);
 assert.ok(d.pending.includes('approved-faq-coverage'));
});

test('approved knowledge persists encrypted and one version produces only one installation audit',()=>{
 const s=new Store(':memory:','fumigacion',randomBytes(32));
 try{
  s.importKnowledge(approvedBusinessPriceSchedule());
  persistMariaKnowledge({company:'fumigacion'},s);persistMariaKnowledge({company:'fumigacion'},s);
  const status=mariaKnowledgeStatus({company:'fumigacion'},s);
  assert.equal(status.persisted,true);assert.equal(status.hash,MARIA_KNOWLEDGE_HASH);assert.equal(status.approvedFaqDocuments,0);
  assert.equal(s.db.prepare("SELECT COUNT(*) n FROM audit WHERE action='MARIA_APPROVED_KNOWLEDGE_INSTALLED'").get().n,1);
  const raw=s.db.prepare("SELECT value FROM meta WHERE key='maria-approved-knowledge'").get().value;
  assert.equal(raw.includes('FUMIGACION'),false);
  for(const table of ['events','outbox','conversations','questions'])assert.equal(s.db.prepare('SELECT COUNT(*) n FROM '+table).get().n,0);
 }finally{s.close();}
});

test('other service remains isolated and model context excludes observations, client histories and unapproved answers',()=>{
 const s=new Store(':memory:','fumigacion',randomBytes(32)),other=new Store(':memory:','servicio-tecnico',randomBytes(32));
 try{
  const previousMeta=other.db.prepare('SELECT COUNT(*) n FROM meta').get().n;
  assert.equal(persistMariaKnowledge({company:'servicio-tecnico'},other),null);
  assert.equal(other.db.prepare('SELECT COUNT(*) n FROM meta').get().n,previousMeta);
  assert.throws(()=>mariaModelKnowledge({company:'servicio-tecnico'},s,'reply'),/OWN_SCOPE/);
  s.importKnowledge({company:'fumigacion',kind:'historical_observations',source:'unapproved-history',at:'2026-10-06',entries:[{rule:'UNAPPROVED_CLIENT_TEXT'}]});
  const input=mariaModelKnowledge({company:'fumigacion'},s,'understand');
  assert.equal(input.approvedRules.length,3);assert.equal(input.currentQuotation,undefined);
  assert.equal(JSON.stringify(input).includes('UNAPPROVED_CLIENT_TEXT'),false);
  assert.equal(input.pendingKnowledgeMustNotBeInvented,true);
 }finally{s.close();other.close();}
});

test('22 independent pricing examples retain approved amounts and special scope controls',()=>{
 const standard=[
  ['30 m²',99000,129000],['42 mts2',129000,129000],['60 m²',149000,149000],
  ['90 m²',169000,169000],['120 m²',189000,189000],['180 m²',209000,209000]
 ];
 const base={site:'apartamento',location:'medellin'};let examples=0;
 for(const [area,cucarachas,roedores] of standard)for(const [service,amount] of [['cucarachas',cucarachas],['roedores',roedores]]){
  const price=selectBusinessPrice({...base,service,area});assert.equal(price.entry.priceCop,amount);examples++;
 }
 for(let n=1;n<=5;n++){assert.equal(selectBusinessPrice({...base,service:'chinches',mattresses:n+' colchones'}).entry.priceCop,n*99000);examples++;}
 assert.equal(selectBusinessPrice({...base,service:'comejen',area:'42 mts2'}).entry.priceCop,179000);examples++;
 for(const extra of [{site:'restaurante'},{location:'rionegro'},{mattresses:'6 colchones'},{mattresses:'2 colchones',affectedFurniture:'sofá'}]){
  assert.equal(selectBusinessPrice({...base,service:'chinches',mattresses:'2 colchones',...extra}).entry,undefined);examples++;
 }
 assert.equal(examples,22);
});
