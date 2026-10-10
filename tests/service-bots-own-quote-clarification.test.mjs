import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {approvedBusinessPriceSchedule} from '../automation/service-bots/business-prices.mjs';
import {CONVERSATIONAL_AI_GUARD} from '../automation/service-bots/ai-settings.mjs';
import {MARIA_UNDERSTANDING_GUARD} from '../automation/service-bots/maria-understanding.mjs';

function fixture(){
 const s=new Store(':memory:','fumigacion',randomBytes(32)),at=Date.now()-10000;
 const c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,activatedAt:at-1000,lines:BUSINESSES.fumigacion.phones.map(phone=>({phone}))};
 s.importKnowledge(approvedBusinessPriceSchedule());const engine=new Engine(s,c);let count=0;
 const turn=async(text,{semantic,forwarded=false,fromMe=false,line=c.lines[0].phone}={})=>{
  const e={id:'OWN_QUOTE_SOURCE_'+ ++count,phone:'573000000111',line,at:at+count,kind:'text',fromMe,forwarded,text};s.enqueue(e);
  await engine.process(e,semantic?{company:'FUMIGACION',eventId:e.id,guard:CONVERSATIONAL_AI_GUARD,semanticGuard:MARIA_UNDERSTANDING_GUARD,intent:{kind:semantic,evidence:text},slots:{}}:{});
  const row=s.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');return {e,row,text:row&&s.open(row.body),state:s.conversation(e.phone)?.state};
 };
 const quote=async(delivery='READ')=>{const result=await turn('Comején en casa de 3 habitaciones en Envigado');s.db.prepare('UPDATE outbox SET mid=?,state=? WHERE id=?').run('OWN_QUOTE_MID_001',delivery,result.row.id);return result;};
 return {s,c,turn,quote};
}
test('same delivered own comején quote answers its literal clarification despite an ambiguous model label',async()=>{
 const f=fixture();try{const quote=await f.quote();assert.match(quote.text,/199.000/);
  const result=await f.turn('María hola es para comején cierto',{semantic:'ambiguous'});
  assert.match(result.text,/Sí.*199.000.*comején/);assert.doesNotMatch(result.text,/revis|pendiente|confirmas|asesora/);
  assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
  assert.equal(result.state.requestedAfterServiceReview,undefined);assert.deepEqual(result.state.quotedPrice,quote.state.quotedPrice);
  assert.equal(f.s.priceReplyReference(result.row).priceCop,199000);assert.equal(f.s.priceReplyStillValid(result.row),true);
 }finally{f.s.close();}
});
test('clarification of an accepted quote does not consume registration fields or claim a service',async()=>{
 const f=fixture();try{const quote=await f.quote();const state={...quote.state,quotedPrice:{...quote.state.quotedPrice,accepted:true},programIntake:{stage:'name'}};
  f.s.saveConversation(quote.e.phone,state);const result=await f.turn('¿El precio es para comején, verdad?',{semantic:'ambiguous'});
  assert.match(result.text,/Sí.*comején/);assert.equal(result.state.programIntake.stage,'name');assert.doesNotMatch(result.text,/registrad|guardad|agendad/);
 }finally{f.s.close();}
});
test('undelivered, cross-line and withdrawn quotes cannot supply a factual clarification',async()=>{
 for(const mode of ['undelivered','cross-line','withdrawn']){const f=fixture();try{
  await f.quote(mode==='undelivered'?'ACCEPTED':'READ');if(mode==='withdrawn')f.s.db.prepare('DELETE FROM knowledge').run();
  const result=await f.turn('es para comején cierto',{semantic:'ambiguous',...(mode==='cross-line'?{line:f.c.lines[1].phone}:{})});
  assert.doesNotMatch(result.text||'',/Sí.*199.000/);
 }finally{f.s.close();}}
});
test('another pest, additional request, negation or forwarded content retain ordinary review',async()=>{
 for(const text of ['es para cucarachas cierto','es para comején cierto y tiene garantía','no es para comején cierto','es para comején cierto; cambia la dirección']){const f=fixture();try{
  await f.quote();const result=await f.turn(text,{semantic:'ambiguous'});assert.doesNotMatch(result.text||'',/Sí.*199.000/);
 }finally{f.s.close();}}
 const f=fixture();try{await f.quote();const result=await f.turn('es para comején cierto',{semantic:'ambiguous',forwarded:true});assert.doesNotMatch(result.text||'',/Sí.*199.000/);}finally{f.s.close();}
});
test('staff ownership prevents a clarification reply',async()=>{
 const f=fixture();try{await f.quote();await f.turn('Buenos días, yo atiendo este caso',{fromMe:true});const result=await f.turn('es para comején cierto',{semantic:'ambiguous'});
  assert.equal(result.row,undefined);assert.equal(f.s.conversation(result.e.phone).hold,1);
 }finally{f.s.close();}
});
