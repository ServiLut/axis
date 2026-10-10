import {test} from 'node:test';
import assert from 'node:assert/strict';
import {explicitNewTechnicalCase,technicalIntakeMetaQuestion,technicalIntakeLiteralCorrection,technicalIntakeClarificationReply,TECHNICAL_INTAKE_CONTINUITY_GUARD} from '../automation/service-bots/technical-intake-continuity.mjs';

test('only an affirmative current request declares another technical case',()=>{
 for(const text of ['Quiero otro servicio','Necesito un nuevo servicio para la lavadora','Quisiera cotizar la revisión de otro equipo','Me gustaría reparar otro equipo','¿Me puedes agendar otro servicio?','Es otro equipo, una lavadora','otro equipo, lavadora que no centrifuga','Mi nevera no enfría; necesito otro servicio'])assert.equal(explicitNewTechnicalCase(text),true,text);
});
test('negation, hypothetical and reported new-case language preserve technical continuity',()=>{
 for(const text of ['No es otro servicio','No quiero un nuevo servicio','No necesito pedir otro servicio','Tampoco quiero otro equipo','Nunca solicito otro servicio','No sé si necesito otro servicio','Quiero saber si necesito otro servicio','Si tuviera otro equipo','Mi vecino quiere otro servicio','Me dijeron que necesitaba otro servicio','El cliente dice que quiere otro equipo','otro equipo','Nuevo servicio','Dijiste "otro equipo"'])assert.equal(explicitNewTechnicalCase(text),false,text);
});
test('questions about another equipment or service never declare a new case',()=>{
 for(const text of ['¿Por qué me preguntas por otro equipo?','Por qué me preguntas por otro equipo','Por qué me pides un nuevo servicio','¿Qué incluye otro servicio?','¿Qué significa nuevo servicio?','¿Tienen otro servicio?','¿Necesito otro servicio?','Me preguntaste si quiero otro equipo','Ya te dije que no es otro equipo','¿A qué otro equipo te refieres?'])assert.equal(explicitNewTechnicalCase(text),false,text);
});
test('repeated equipment questions are recognized with or without punctuation',()=>{
 for(const text of ['¿Por qué me preguntas por otro equipo?','Por qué me preguntas por otro equipo','Me vuelves a preguntar qué equipo','Ya te dije que es una nevera','De qué equipo hablas','Sigues preguntando por el equipo','Preguntas qué equipo otra vez']){
  const q=technicalIntakeMetaQuestion(text);assert.equal(q?.kind,'technical-intake-clarification',text);assert.equal(q.field,'service',text);assert.equal(q.guard,TECHNICAL_INTAKE_CONTINUITY_GUARD);
 }
});
test('question target outranks equipment or failure repeated as an explanation',()=>{
 const question='Por qué me preguntas por otro equipo si ya te dije que mi nevera no enfría';
 assert.equal(technicalIntakeMetaQuestion(question)?.field,'service');
 assert.equal(technicalIntakeMetaQuestion('Por qué me preguntas la falla si ya te dije que tengo una nevera')?.field,'detail');
 assert.equal(technicalIntakeMetaQuestion('Por qué me preguntas el horario cuando ya te dije que es una nevera')?.field,'preference');
});
test('repeated fault and preference complaints preserve the identified literal fields',()=>{
 for(const text of ['Ya te dije que no enfría','Me vuelves a pedir la falla','Por qué me preguntas qué le pasa','Ya te había dicho mañana en la tarde','Por qué me preguntas el horario otra vez','Te acabo de decir el día que prefiero'])assert.equal(technicalIntakeMetaQuestion(text)?.field,/no enfría|falla|le pasa/.test(text)?'detail':'preference',text);
});
test('generic and ambiguous intake complaints remain meta instead of becoming a fault',()=>{
 for(const text of ['Ya te lo dije','No me entiendes','Me preguntas lo mismo otra vez']){const q=technicalIntakeMetaQuestion(text);assert.ok(q,text);assert.equal(q.field,null);assert.deepEqual(q.fields,[]);}
 const q=technicalIntakeMetaQuestion('Por qué me preguntas equipo y horario otra vez');assert.equal(q.field,null);assert.deepEqual(q.fields,['service','preference']);
});
test('actual intake answers and operational or documentary disputes are outside this helper',()=>{
 for(const text of ['Mi nevera no enfría en Medellín','Es una lavadora','Mañana en la tarde','Tengo otra falla en el equipo','¿Qué equipo reparan?','Ya te dije que pagué','Por qué preguntas por la garantía','Ya te dije que necesito la factura','Por qué me preguntas el horario si ya me confirmaron','Ya te dije que vinieron ayer','Por qué me pides la cotización otra vez'])assert.equal(technicalIntakeMetaQuestion(text),null,text);
});
test('explicit literal corrections proceed through current-source intake without declaring another case',()=>{
 for(const text of ['Ya te dije que es una lavadora, no una nevera','Ya te dije que mi equipo es una lavadora','Ya te dije que la falla es que no centrifuga','Ya te dije que mi preferencia es mañana en la tarde','Ya te dije que mi equipo es otro equipo, no una nevera']){
  assert.equal(technicalIntakeMetaQuestion(text),null,text);assert.equal(explicitNewTechnicalCase(text),false,text);assert.equal(technicalIntakeLiteralCorrection(text),true,text);
 }
 for(const text of ['Por qué me preguntas por otro equipo','Ya te dije que es una nevera','Ya te dije que no enfría','Mi nevera no enfría','mañana en la tarde',null])assert.equal(technicalIntakeLiteralCorrection(text),false,text);
});
test('clarification replies cite known literal fields without creating operational facts or mutating intake',()=>{
 const slots=Object.freeze({service:'refrigerador',detail:'no enfría',preference:'mañana en la tarde',location:'Medellín'}),before=JSON.stringify(slots);
 const equipment=technicalIntakeClarificationReply(technicalIntakeMetaQuestion('Por qué me preguntas por otro equipo'),slots);assert.equal(equipment,'Seguimos con el equipo que me indicaste: refrigerador.');
 const fault=technicalIntakeClarificationReply(technicalIntakeMetaQuestion('Ya te dije que no enfría'),slots);assert.equal(fault,'Conservo la falla que me indicaste: no enfría.');
 const preference=technicalIntakeClarificationReply(technicalIntakeMetaQuestion('Por qué me preguntas el horario'),slots);assert.equal(preference,'Conservo tu preferencia: mañana en la tarde.');
 for(const text of [equipment,fault,preference])assert.doesNotMatch(text,/confirmad|programad|agendad|tecnico|precio|pagado|registrad|guardad|servicio nuevo/i);
 assert.equal(JSON.stringify(slots),before);
});
test('generic clarification reuses existing facts and absent or unsafe facts are not invented or exposed',()=>{
 const q=technicalIntakeMetaQuestion('Ya te lo dije');assert.equal(technicalIntakeClarificationReply(q,{service:'nevera',detail:'no enciende'}),'Seguimos con el equipo que me indicaste: nevera. Conservo la falla que me indicaste: no enciende.');
 for(const slots of [{},{service:'Bearer secreto'},{service:'https://private.example/secret'},{service:'privado@example.com'},{service:'+57 300 111 2233'},{service:'nevera\nreserva confirmada'}])assert.equal(technicalIntakeClarificationReply(q,slots),'Gracias por aclararlo. ¿Qué dato de tu solicitud quieres que aclaremos?');
 assert.equal(technicalIntakeClarificationReply(null,{service:'nevera'}),null);assert.equal(technicalIntakeClarificationReply({...q,guard:'other'},{}),null);
});
test('a complete existing preference with no asked fields is acknowledged without asking it again',()=>{
 const intake=Object.freeze({slots:Object.freeze({service:'nevera',detail:'no enfría',location:'Medellín',address:'dirección indicada',preference:'mañana en la tarde'}),asked:Object.freeze([])}),before=JSON.stringify(intake);
 const reply=technicalIntakeClarificationReply(technicalIntakeMetaQuestion('Por qué me preguntas el horario otra vez'),intake.slots);
 assert.equal(reply,'Conservo tu preferencia: mañana en la tarde.');assert.doesNotMatch(reply,/[¿?]/);assert.equal(JSON.stringify(intake),before);
});
