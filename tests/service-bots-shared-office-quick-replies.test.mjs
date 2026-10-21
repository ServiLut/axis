import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedOfficeReferenceContext,sharedOfficeModelContext,sharedOfficeSelectedReply,sharedOfficeReferences} from '../automation/service-bots/shared-office-quick-replies.mjs';
test('all 25 shared templates keep their exact source hashes and recent policy without importing universal claims',()=>{
 const context=sharedOfficeReferenceContext();assert.equal(sharedOfficeReferences.length,25);assert.equal(new Set(sharedOfficeReferences.map(v=>v.id)).size,25);assert.ok(sharedOfficeReferences.every(v=>/^[a-f0-9]{64}$/.test(v.originalTextAndEmojiContentSha256)));
 assert.equal(sharedOfficeReferences.filter(v=>v.status==='EXISTING_GUARDED_FLOW').length,6);assert.equal(context.allTemplatesAutomaticallySendable,false);assert.match(context.rules.join(' '),/15–20.*50 %.*tres meses/);assert.doesNotMatch(JSON.stringify(context),/seguros para personas|ISO 9001|balcón|Valentina/);
 const model=sharedOfficeModelContext();assert.equal(model.referenceCount,25);assert.equal(model.entries,undefined);assert.deepEqual(model.rules,context.rules);assert.ok(JSON.stringify(model).length<JSON.stringify(context).length/2);
});
test('a complete data request keeps its exact registration contract and binds the shared reference',()=>{
 const text='Para registrar tu solicitud, compárteme:\n1. Tu nombre completo.',decision={state:{programIntake:{stage:'name'}}};
 const v=sharedOfficeSelectedReply('fumigacion',decision,text);assert.equal(v.text,text);assert.deepEqual(v.ids,['WA-REF-018']);assert.equal(sharedOfficeSelectedReply('servicio-tecnico',decision,text),null);assert.equal(sharedOfficeSelectedReply('fumigacion',decision,text,{approvedAnswer:true}),null);
});

test('the shared greeting keeps the verified missing-field contract; closing copy cannot interrupt review',()=>{
 const text='Hola, soy María Ángel. Gracias por escribirnos 😊 Con gusto te ayudo. Para cotizarte, cuéntame qué plaga deseas tratar, el tipo de inmueble y el municipio.';
 const greeting=sharedOfficeSelectedReply('fumigacion',{state:{}},text);
 assert.equal(greeting.text,text);assert.deepEqual(greeting.ids,['WA-REF-008','WA-REF-009','WA-REF-022']);
 const courtesy='Con mucho gusto. Gracias por tenernos en cuenta.';
 assert.equal(sharedOfficeSelectedReply('fumigacion',{courtesy:true,state:{}},courtesy).text,courtesy);
 assert.equal(sharedOfficeSelectedReply('fumigacion',{courtesy:true,state:{awaitingHumanReview:true}},courtesy),null);
});
test('warranty copy carries empathy while preserving the actual review and never granting a visit',()=>{
 const d={review:true,reviewTopic:'warranty-review',reviewConditions:{kind:'warranty'}},v=sharedOfficeSelectedReply('fumigacion',d,'Lamento el inconveniente. Voy a pedir que un asesor revise tu solicitud de garantía. Conservé lo que ya nos contaste.');
 assert.match(v.text,/Lamento mucho lo ocurrido/);assert.doesNotMatch(v.text,/programaremos|gratis|realizado|tres meses/);assert.deepEqual(v.ids,['WA-REF-001']);assert.equal(sharedOfficeSelectedReply('fumigacion',{...d,reviewConditions:{kind:'general-question'}},v.text),null);
});
test('ordinary price, data summaries and unavailable material cannot be rewritten by the reference selector',()=>{
 for(const text of ['El servicio cuesta $129.000.','Revisa los datos de tu solicitud:\nHorario solicitado: mañana a las 9 am','No tengo un precio confirmado.'])assert.equal(sharedOfficeSelectedReply('fumigacion',{state:{}},text),null);
});
