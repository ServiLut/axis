import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {selectPrice,priceText} from '../automation/service-bots/prices.mjs';
import {approvedBusinessPriceSchedule,selectBusinessPrice,verifyBusinessPriceEntry,BUSINESS_PRICE_HASH,LEGACY_BUSINESS_PRICE_HASH,BUSINESS_PRICE_CUTOVER_AT,businessPriceHashAt,priceScheduleValidAt} from '../automation/service-bots/business-prices.mjs';

const cutoff=Date.parse(BUSINESS_PRICE_CUTOVER_AT),before=cutoff-60000,after=cutoff+60000;
const slots={site:'apartamento',location:'medellin',service:'chinches',mattresses:'1 colchón'};
function fixture(t,{at=before,hash=LEGACY_BUSINESS_PRICE_HASH,withVersion=false,delivered=true}={}){
 t.mock.timers.enable({apis:['Date'],now:at});
 const s=new Store(':memory:','fumigacion',randomBytes(32));
 s.importKnowledge(approvedBusinessPriceSchedule(LEGACY_BUSINESS_PRICE_HASH));s.importKnowledge(approvedBusinessPriceSchedule());
 const entry=selectBusinessPrice(slots,{scheduleHash:hash}).entry,text=priceText(entry);
 s.queue('VERSIONQUOTE01:reply','573001112233','573126944997',text,false,0,'version-case-1');
 s.savePriceReplyReference('VERSIONQUOTE01:reply',{entryId:entry.id,priceCop:entry.priceCop,context:{...slots},finalText:text,...(withVersion?{scheduleHash:hash,issuedAt:at}:{})});
 s.db.prepare("UPDATE outbox SET state='ACCEPTED',mid='VERSIONOWNMID01' WHERE id='VERSIONQUOTE01:reply'").run();
 if(delivered)s.delivery('VERSIONOWNMID01','573126944997','DELIVERED');
 const row=()=>s.db.prepare("SELECT * FROM outbox WHERE id='VERSIONQUOTE01:reply'").get();
 return {s,row,entry,text};
}
test('closed canonical versions retain exact legacy hash and confirmed Excel authority',()=>{
 assert.equal(LEGACY_BUSINESS_PRICE_HASH,'e9ff47a70912f5268494c6ebfcb2f5be48234f30a52acf7e5da85f9dc574c726');
 assert.equal(BUSINESS_PRICE_HASH,'06e6630eedf13eca8b4c2b5c2cdb939d5b3c6c29932450bb96f2d494332a470b');
 const doc=approvedBusinessPriceSchedule();assert.equal(doc.materials.excel,'5c3a421b2def031105243b7fea8bf83c34ef8b33b882eca5402c45d4d8264d22');
 assert.equal(doc.approval.confirmation.answerId,'3EB077024063F4A81039A2');assert.equal(doc.approval.confirmation.questionId,'3EB0D1A35A2166B3C72005');
 assert.equal(createHash('sha256').update(JSON.stringify(doc)).digest('hex'),BUSINESS_PRICE_HASH);
 assert.throws(()=>approvedBusinessPriceSchedule('a'.repeat(64)),/UNKNOWN/);
});
test('version choice uses the explicit immutable boundary and rejects unknown or malformed times',()=>{
 assert.equal(businessPriceHashAt(cutoff-1),LEGACY_BUSINESS_PRICE_HASH);assert.equal(businessPriceHashAt(cutoff),BUSINESS_PRICE_HASH);
 assert.equal(priceScheduleValidAt(LEGACY_BUSINESS_PRICE_HASH,after),false);assert.equal(priceScheduleValidAt(BUSINESS_PRICE_HASH,before),false);
 for(const invalid of [undefined,null,NaN,Infinity,{},'2026-10-16','2026-10-16T19:00:00',before+.5])assert.equal(businessPriceHashAt(invalid),null);
 assert.equal(priceScheduleValidAt('a'.repeat(64),before),false);
});
test('the two versions select their own amount without consulting the machine clock',()=>{
 const old=selectBusinessPrice(slots,{scheduleHash:LEGACY_BUSINESS_PRICE_HASH}).entry,newer=selectBusinessPrice(slots).entry;
 assert.equal(old.priceCop,99000);assert.equal(newer.priceCop,100000);assert.equal(old.source.scheduleHash,LEGACY_BUSINESS_PRICE_HASH);
 assert.equal(verifyBusinessPriceEntry(old,{issuedAt:before}),true);assert.throws(()=>verifyBusinessPriceEntry(old),/VERSION/);assert.throws(()=>verifyBusinessPriceEntry(old,{issuedAt:after}),/VERSION/);
 for(const [n,value] of [[1,100000],[5,500000],[6,600000],[7,490000],[8,560000],[142,9940000]])assert.equal(selectBusinessPrice({...slots,mattresses:n+' colchones'}).entry.priceCop,value);
 for(const quantity of ['0 colchones','143 colchones','999 colchones','7 o más colchones','entre 6 y 7 colchones'])assert.equal(selectBusinessPrice({...slots,mattresses:quantity}).entry,undefined);
 assert.equal(selectBusinessPrice({...slots,mattresses:'6 colchones'},{scheduleHash:LEGACY_BUSINESS_PRICE_HASH}).entry,undefined);
 assert.equal(selectBusinessPrice({...slots,service:'roedores',rooms:'1 habitación'}).entry.priceCop,119000);
});
test('furniture, multiple properties and unapproved scope stay reviewed in both versions',()=>{
 for(const hash of [BUSINESS_PRICE_HASH,LEGACY_BUSINESS_PRICE_HASH])for(const patch of [{affectedFurniture:'un sofá'},{site:'restaurante'},{location:'rionegro'},{locationDetails:'dos apartamentos'},{roomScale:'grande'},{floors:'2 pisos'},{patio:'patio'}])assert.equal(selectBusinessPrice({...slots,...patch},{scheduleHash:hash}).entry,undefined);
});
test('known knowledge versions coexist encrypted without silently selecting or importing a missing version',()=>{
 const s=new Store(':memory:','fumigacion',randomBytes(32));try{
  s.importKnowledge(approvedBusinessPriceSchedule(LEGACY_BUSINESS_PRICE_HASH));
  assert.equal(selectPrice(slots,s.approvedPriceCatalogs()).entry,undefined);
  assert.equal(selectPrice(slots,s.approvedPriceCatalogs(),null,{scheduleHash:LEGACY_BUSINESS_PRICE_HASH,issuedAt:before}).entry.priceCop,99000);
  s.importKnowledge(approvedBusinessPriceSchedule());s.importKnowledge(approvedBusinessPriceSchedule());assert.equal(s.db.prepare('SELECT COUNT(*) n FROM knowledge').get().n,2);
  assert.equal(selectPrice(slots,s.approvedPriceCatalogs()).entry.priceCop,100000);
  assert.equal(selectPrice(slots,s.approvedPriceCatalogs(),'approved-table-chinches-1').entry,undefined);
  assert.equal(selectPrice(slots,s.approvedPriceCatalogs(),'approved-table-chinches-1',{scheduleHash:LEGACY_BUSINESS_PRICE_HASH,issuedAt:after}).entry,undefined);
 }finally{s.close();}
});
test('a durable delivered legacy quote survives post-boundary rereading without changing its ciphertext or reference',t=>{
 const f=fixture(t);try{
  const rowBefore={...f.row()},refBefore=f.s.db.prepare("SELECT value FROM meta WHERE key='price-reply:VERSIONQUOTE01:reply'").get().value;
  assert.equal(f.s.priceReplyVersion(f.row()).scheduleHash,LEGACY_BUSINESS_PRICE_HASH);
  t.mock.timers.setTime(after);f.s.delivery('VERSIONOWNMID01','573126944997','READ');
  assert.equal(f.s.priceReplyStillValid(f.row()),true);assert.equal(f.s.priceReplyVersion(f.row()).issuedAt,before);
  assert.equal(f.row().body,rowBefore.body);assert.equal(f.s.db.prepare("SELECT value FROM meta WHERE key='price-reply:VERSIONQUOTE01:reply'").get().value,refBefore);
 }finally{f.s.close();}
});
test('an uncertain pre-boundary quote with its first acknowledgement after the boundary cannot acquire legacy validity',t=>{
 const f=fixture(t,{delivered:false,withVersion:true});try{
  assert.equal(f.s.priceReplyStillValid(f.row(),{at:before}),true);
  t.mock.timers.setTime(after);assert.equal(f.s.priceReplyStillValid(f.row()),false);
  f.s.delivery('VERSIONOWNMID01','573126944997','DELIVERED');assert.equal(f.s.priceReplyVersion(f.row()),null);assert.equal(f.s.priceReplyStillValid(f.row()),false);
 }finally{f.s.close();}
});
for(const patch of ['no-proof','wrong-mid','wrong-line','late-created','only-hash','only-at'])test('legacy inference fails closed for '+patch,t=>{
 const f=fixture(t);try{
  const key='first-delivery:VERSIONQUOTE01:reply';
  if(patch==='no-proof')f.s.db.prepare('DELETE FROM meta WHERE key=?').run(key);
  if(patch==='wrong-mid'||patch==='wrong-line')f.s.db.prepare('UPDATE meta SET value=? WHERE key=?').run(f.s.seal({verifiedAt:before,mid:patch==='wrong-mid'?'FOREIGNMID001':'VERSIONOWNMID01',line:patch==='wrong-line'?'573126938721':'573126944997',state:'DELIVERED'}),key);
  if(patch==='late-created')f.s.db.prepare("UPDATE outbox SET created=? WHERE id='VERSIONQUOTE01:reply'").run(after);
  if(patch==='only-hash'||patch==='only-at'){const ref=f.s.priceReplyReference(f.row());f.s.savePriceReplyReference(f.row().id,{...ref,...(patch==='only-hash'?{scheduleHash:LEGACY_BUSINESS_PRICE_HASH}:{issuedAt:before})});}
  assert.equal(f.s.priceReplyVersion(f.row()),null);assert.equal(f.s.priceReplyStillValid(f.row()),false);
 }finally{f.s.close();}
});
test('new explicit version references are valid only in their own delivery band',t=>{
 const f=fixture(t,{at:after,hash:BUSINESS_PRICE_HASH,withVersion:true});try{
  assert.equal(f.s.priceReplyVersion(f.row()).scheduleHash,BUSINESS_PRICE_HASH);assert.equal(f.s.priceReplyStillValid(f.row()),true);
  assert.equal(f.s.priceReplyVersion({...f.row(),line:'573126938721'}),null);
 }finally{f.s.close();}
});
test('a new clarification may cite only the same delivered original quote without becoming a new legacy quotation',t=>{
 const f=fixture(t);try{
  const original=f.row(),version=f.s.priceReplyVersion(original),ref=f.s.priceReplyReference(original);t.mock.timers.setTime(after);
  const text='La cotización anterior para un colchón fue de $99.000 COP.';
  f.s.queue('CLARIFYPRICE01:reply',original.phone,original.line,text,false,0,original.case_id);
  f.s.savePriceReplyReference('CLARIFYPRICE01:reply',{...ref,finalText:text,scheduleHash:version.scheduleHash,issuedAt:version.issuedAt,referenceKind:'prior-quotation-clarification',quotationOutboxId:original.id});
  const row=f.s.db.prepare("SELECT * FROM outbox WHERE id='CLARIFYPRICE01:reply'").get();
  assert.equal(f.s.priceReplyVersion(row).clarification,true);assert.equal(f.s.priceReplyStillValid(row),true);
  f.s.savePriceReplyReference(row.id,{...f.s.priceReplyReference(row),context:{...slots,mattresses:'2 colchones'}});assert.equal(f.s.priceReplyVersion(row),null);
  assert.equal(f.s.open(original.body),f.text);assert.equal(f.s.priceReplyReference(original).scheduleHash,undefined);
 }finally{f.s.close();}
});
for(const mismatch of ['case','phone','line','amount','hash','time','missing-original-proof','uncertain-original','chained-reference'])test('historical price clarification rejects '+mismatch,t=>{
 const f=fixture(t);try{
  const original=f.row(),version=f.s.priceReplyVersion(original),old=f.s.priceReplyReference(original);t.mock.timers.setTime(after);
  const text='El valor anterior de ese único colchón fue $99.000 COP.';
  f.s.queue('CLARIFYREJECT01:reply',mismatch==='phone'?'573009998877':original.phone,mismatch==='line'?'573126938721':original.line,text,false,0,mismatch==='case'?'other-case':original.case_id);
  const ref={...old,finalText:text,scheduleHash:version.scheduleHash,issuedAt:version.issuedAt,referenceKind:'prior-quotation-clarification',quotationOutboxId:original.id};
  if(mismatch==='amount')ref.priceCop=100000;if(mismatch==='hash')ref.scheduleHash=BUSINESS_PRICE_HASH;if(mismatch==='time')ref.issuedAt=after;
  if(mismatch==='missing-original-proof')f.s.db.prepare("DELETE FROM meta WHERE key='first-delivery:VERSIONQUOTE01:reply'").run();
  if(mismatch==='uncertain-original')f.s.db.prepare("UPDATE outbox SET state='UNCERTAIN' WHERE id=?").run(original.id);
  if(mismatch==='chained-reference')f.s.savePriceReplyReference(original.id,{...old,referenceKind:'prior-quotation-clarification',quotationOutboxId:'ANOTHERQUOTE01'});
  f.s.savePriceReplyReference('CLARIFYREJECT01:reply',ref);
  const row=f.s.db.prepare("SELECT * FROM outbox WHERE id='CLARIFYREJECT01:reply'").get();assert.equal(f.s.priceReplyVersion(row),null);assert.equal(f.s.priceReplyStillValid(row),false);
 }finally{f.s.close();}
});
