import {test} from 'node:test';
import assert from 'node:assert/strict';
import {psychologyAiInput} from '../lib/psychology-ai';

test('large conversation retains exact current question, complete recent sources, and explicit coverage gaps',()=>{
 const c={currentMessage:'Luisa, recuerda la respuesta anterior',verifiedChiefQuestion:{id:'q',content:'Pregunta verificada'},history:Array.from({length:30},(_,id)=>({id,text:'h'.repeat(1800)})),priorChiefCaseAnswers:Array.from({length:6},(_,id)=>({id,answer:'a'.repeat(1600)})),chiefInstructions:Array.from({length:24},(_,id)=>`Regla ${id}: `+'r'.repeat(1500)),chiefKnowledgeSources:Array.from({length:24},(_,id)=>({id}))};
 const input=psychologyAiInput(c),v=JSON.parse(input);
 assert.ok(input.length<=50000);assert.deepEqual(v.currentMessage,c.currentMessage);assert.deepEqual(v.verifiedChiefQuestion,c.verifiedChiefQuestion);
 assert.deepEqual(v.history.at(-1),c.history.at(-1));assert.equal(v.chiefInstructions.length,v.chiefKnowledgeSources.length);
 assert.ok(v.omittedContext.history>0);assert.equal(c.history.length,30);assert.equal(c.chiefInstructions.length,24);
 assert.throws(()=>psychologyAiInput({currentMessage:'x'.repeat(51000)}),/AI_CONTEXT_TOO_LONG/);
});
