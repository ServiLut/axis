import assert from 'node:assert/strict';
import {createSummaryDataFixture} from './maria-summary-data-flow.mjs';

// Deterministic actual Engine/Store fixture. All receipts are simulated and no
// transport, provider or model is called by this helper.
export function createSummaryScopeFixture(setTime){
 const f=createSummaryDataFixture(setTime);
 const summary=async(first='Quiero cotizar un servicio nuevo para chinches: 3 colchones en un apartamento de Itagüí, barrio Santa María. No hay otros muebles afectados.',factsText='Nombre: Laura Gómez\nDirección: Calle 50 # 42-18 apartamento 301')=>{
  const quote=await f.turn(first);f.deliver(quote);assert.ok(f.state(quote).quotedPrice);
  const accepted=await f.turn('Sí');assert.equal(f.state(accepted).quotedPrice.accepted,true);f.deliver(accepted);
  const facts=await f.turn(factsText);assert.match(f.reply(facts),/¿Confirmas que estos datos son correctos/);
  return {quote,accepted,facts};
 };
 return {...f,summary};
}
