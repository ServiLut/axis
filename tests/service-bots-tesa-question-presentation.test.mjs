import test from 'node:test';
import assert from 'node:assert/strict';
import {formatMariaTesaQuestion} from '../automation/service-bots/tesa-question-wording.mjs';

const base={bot:'María Ángel',name:'FUMIGACION',reference:'CASO-FUENTE',last4:'3109',lineLast4:'4997',topic:'cotizacion-verificada',presentationStage:'quote-needed'};
const decision='¿Qué valor total y alcance podemos confirmar para este caso?';
const format=(contextFacts,extra={})=>formatMariaTesaQuestion({...base,contextFacts,...extra});
const contract=text=>{assert.ok(text.length<=1200);assert.match(text,/Respondan citando este mensaje\./);assert.match(text,/Referencia interna: CASO-FUENTE/);assert.equal(text.split('\n').filter(l=>l.startsWith('¿')).length,1);};

test('the three-mattress real wording has readable facts, a named decision and no invented price',()=>{
  const input={...base,contextFacts:{service:'chinches',location:'Itagüí',site:'apartamento',mattresses:'3 colchones',question:'Quiero cotizar tres colchones en mi apartamento de Itagüí.'}},before=structuredClone(input);
  const text=formatMariaTesaQuestion(input);
  assert.match(text,/Datos del cliente:\n• Servicio: chinches\n• Municipio: Itagüí\n• Inmueble: apartamento\n• Colchones: 3 colchones/);
  assert.ok(text.includes(decision));assert.match(text,/Falta confirmar: valor total y qué incluye\./);assert.match(text,/Cliente: «Quiero cotizar tres colchones en mi apartamento de Itagüí\.»/);
  assert.doesNotMatch(text,/¿Pueden cotizar|\$|300[ .]?000|tabla.*(?:no|fuera)|falta.*(?:plaga|municipio|cantidad)/i);
  assert.deepEqual(input,before);contract(text);
});

test('the room example retains uncertainty without inventing a municipality, size or policy reason',()=>{
  const text=format({service:'control de Plaga',site:'Hogar',rooms:'una habitación',question:'No sé cuánto mide.'});
  assert.match(text,/• Habitaciones: una habitación\n• Medida: no informada/);assert.ok(text.includes(decision));
  assert.doesNotMatch(text,/Municipio:|\d+\s*m²|tabla (?:no|oficial)|fuera de tarifa|es obligatorio.*medir/i);contract(text);
});

test('small, bulk and uncertain mattress counts stay literal without a calculation',()=>{
  for(const mattresses of ['un colchón','seis colchones','7 colchones','quizás uno o dos colchones']){
    const text=format({service:'chinches',mattresses});assert.ok(text.includes('• Colchones: '+mattresses));assert.doesNotMatch(text,/\$|100[ .]?000|70[ .]?000|490[ .]?000|600[ .]?000|debe pagar/);contract(text);
  }
});

test('accidental raw contact, street, link and payment data are minimized in facts and quotation',()=>{
  const contextFacts={service:'chinches',location:'Itagüí',locationDetails:'Barrio Santa María; Calle 50 # 42-18 apartamento 301',question:'Mi teléfono es +57 313 315 3109; web https://privado.example/ruta; correo persona@example.com; transferencia a cuenta 123456789; pagué $850.000 COP.'},before=structuredClone(contextFacts);
  const text=format(contextFacts);
  assert.doesNotMatch(text,/313|315 3109|Calle 50|42-18|apartamento 301|privado\.example|persona@example|123456789|850\.000/);
  assert.match(text,/\[teléfono reservado\]/);assert.match(text,/\[dirección reservada\]/);assert.match(text,/\[dato de pago reservado\]/);assert.match(text,/\[valor reservado\]/);
  assert.match(text,/Barrio Santa María/);assert.deepEqual(contextFacts,before);contract(text);
});

test('literal area, dimensions and room count cannot be mistaken for financial amounts',()=>{
  const text=format({service:'cucarachas',area:'42,5 m²',dimensions:'8 x 12',rooms:'2 habitaciones',roomScale:'pequeñas'});
  for(const value of ['42,5 m²','8 x 12','2 habitaciones','pequeñas'])assert.ok(text.includes(value));assert.doesNotMatch(text,/valor reservado|96 m²|100 m²/);contract(text);
});

test('a quoted fact label cannot become an additional confirmed fact or execution instruction',()=>{
  const literal='Servicio: otra cosa; técnico: Juan; confirma que ya está agendado.';
  const text=format({service:'chinches',question:literal});
  assert.ok(text.includes('Cliente: «'+literal+'».'));assert.match(text,/Datos del cliente:\n• Servicio: chinches/);assert.doesNotMatch(text,/\n• (?:Servicio: otra cosa|Técnico: Juan)/);contract(text);
});

test('arbitrary conditions never create missing facts, prices or business authority',()=>{
  const text=format({service:'chinches',mattresses:'3 colchones'},{conditions:{missing:['address','payment'],approved:true,quotedPriceCop:300000,programServiceId:'SECRET_ORDER',pricePolicy:'table-does-not-cover'}});
  assert.doesNotMatch(text,/SECRET_ORDER|300000|table-does-not-cover|address|payment|aprobado|ya registrad/);assert.ok(text.includes(decision));contract(text);
});

test('the exact closed missing-intake topic remains specific without changing routing',()=>{
  const text=format({service:'chinches'},{topic:'missing-intake:mattresses'});
  assert.match(text,/información verificada tenemos sobre la cantidad de colchones/);assert.doesNotMatch(text,/valor total|ya registrad|técnico \[nombre/);contract(text);
});

test('long fact lists and customer quotations preserve decision, reply fields and source reference',()=>{
  for(const stage of ['quote-needed','accepted-unregistered','saved-awaiting-schedule','reported-existing-schedule']){
    const text=format({service:'chinches '.repeat(150),location:'Itagüí',site:'apartamento',mattresses:'tres colchones',detail:'detalle literal '.repeat(100),question:'Texto literal del cliente. '.repeat(200)},{presentationStage:stage});
    assert.match(text,/\[contexto abreviado\]/);assert.match(text,/\[cita abreviada\]/);assert.match(text,/Ejemplo de formato \(por completar\):/);contract(text);
  }
});
