import assert from 'node:assert/strict';import {test} from 'node:test';
import {psychologyCommunicationIssue as issue} from '../lib/psychology-communication';
test('external replies with internal routing, technology, secrets or another company are blocked',()=>{
 for(const text of ['Voy a consultarlo con Sandra para responderte.','Lo revisaré con nuestra coordinadora.','Revisaremos ese horario con el profesional.','Axis registró CITA-5.','token de acceso: privado','Abogados en Colombia gestiona tu caso','Bearer abcdefghijklmnopqr'])assert.ok(issue('573001112233',text),text);
 for(const text of ['Sandra, tu cita quedó registrada para el martes a las 3 p. m.','Tu solicitud está pendiente de confirmación.','Recibí tu archivo, gracias.','Podemos continuar con respeto. ¿Qué necesitas resolver?','La sesión cuesta $119.900.'])assert.equal(issue('573001112233',text),null,text);
 assert.equal(issue('573016803926','Sandra, necesito tu ayuda para verificar un registro de Axis.'),null);
});
