import assert from 'node:assert/strict';import {test} from 'node:test';
import {rememberRoomPreferences,roomChoice} from '../lib/psychology-room-preferences';
import type {ReceptionEvent} from '../lib/psychology-reception';
const rooms=[{id:1n,nombre:'Consultorio 10'},{id:2n,nombre:'Consultorio 11'}];
const e:ReceptionEvent={id:'synthetic-preference',phone:'573001234567',at:'2026-09-28T22:00:00Z',kind:'text',fromMe:false,text:'Prefiero el consultorio 10. No me gusta el consultorio 11.'};
test('explicit preferences retain their source and use visible names rather than internal IDs',()=>{
 const p=rememberRoomPreferences(undefined,[{roomLabel:'10',preference:'prefer',quote:'Prefiero el consultorio 10'},{roomLabel:'11',preference:'avoid',quote:'No me gusta el consultorio 11'}],rooms,83,e);
 assert.equal(p.entries[0].roomId,'1');assert.equal(p.entries[0].sourceEvent,e.id);
 const message=roomChoice(rooms,p,83);assert.match(message,/consultorio 10.*prefieres.*Cuál/);assert.doesNotMatch(message,/consultorio 11|reservado/);
 assert.match(roomChoice([rooms[1]],p,83),/solo quedan.*te sirve alguno.*otro horario/i);
 assert.doesNotMatch(roomChoice(rooms,p,84),/que prefieres/);
});
test('unquoted, inferred, ambiguous and contradictory preferences are not learned',()=>{
 for(const c of [{roomLabel:'10',preference:'avoid' as const,quote:'Prefiero el consultorio 10'},{roomLabel:'11',preference:'prefer' as const,quote:'Prefiero el consultorio 10'},{roomLabel:'99',preference:'prefer' as const,quote:'Prefiero el consultorio 99'},{roomLabel:'10',preference:'prefer' as const,quote:'reservé el consultorio 10'}])assert.throws(()=>rememberRoomPreferences(undefined,[c],rooms,83,e));
 assert.throws(()=>rememberRoomPreferences(undefined,[{roomLabel:'10',preference:'prefer',quote:'Prefiero el consultorio 10'}],rooms,83,{...e,fromMe:true}));
});
