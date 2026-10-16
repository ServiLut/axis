import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  nativeMessageBodiesEquivalent,resolveOwnBlueNativeIdentity,nativeIdentityEvidenceHash,NATIVE_MESSAGE_BYTE_EQUIVALENCE_GUARD,
} from '../automation/service-bots/native-identity-resolution.mjs';
import {FUMIGACION_BLUE,FUMIGACION_RED} from '../automation/service-bots/line-scope.mjs';

const paths=[['messageContextInfo','messageSecret'],['messageContextInfo','deviceListMetadata','senderKeyHash'],['messageContextInfo','deviceListMetadata','recipientKeyHash']];
const bytes=[1,2,127,128,255],base64=Buffer.from(bytes).toString('base64');
const indexed=value=>Object.fromEntries(value.map((byte,index)=>[String(index),byte]));
const message=()=>({conversation:'Hola, ¿me ayudas?',messageContextInfo:{deviceListMetadataVersion:2,deviceListMetadata:{senderTimestamp:{low:17,high:0,unsigned:true},recipientTimestamp:{low:18,high:0,unsigned:true}},stanzaId:'SAME_QUOTED_NATIVE_MID',isForwarded:false}});
function set(target,path,value){let current=target;for(const part of path.slice(0,-1))current=current[part]??={};current[path.at(-1)]=value;return target;}

for(const path of paths)for(const form of ['indexed','BufferJSON','string'])test('exact demonstrated byte path accepts canonical equivalent '+path.join('.')+' '+form,()=>{
  const first=set(message(),path,form==='indexed'?indexed(bytes):form==='BufferJSON'?{type:'Buffer',data:[...bytes]}:base64),second=set(message(),path,base64),before=JSON.stringify(first);
  assert.equal(nativeMessageBodiesEquivalent(first,second),true);assert.equal(nativeMessageBodiesEquivalent(second,first),true);assert.equal(JSON.stringify(first),before);
});

test('all three demonstrated paths may differ only in their canonical byte representation',()=>{
  const first=message(),second=message();for(const [index,path] of paths.entries()){set(first,path,index===1?{type:'Buffer',data:[...bytes]}:indexed(bytes));set(second,path,base64);}
  assert.equal(nativeMessageBodiesEquivalent(first,second),true);assert.notEqual(nativeIdentityEvidenceHash(first),nativeIdentityEvidenceHash(second));
});

const invalids={empty:'',unPadded:'AQI',badPadding:'AQI===',nonCanonicalPadding:'AB==',whitespace:' AQI=',urlSafe:'AQ-_',unknownString:'not base64!',number:32,null:null,boolean:false,emptyObject:{},sparseObject:{0:1,2:2},leadingZero:{'00':1},negativeIndex:{'-1':1},unknownProperty:{0:1,extra:2},negativeByte:{0:-1},largeByte:{0:256},fractionalByte:{0:1.5},stringByte:{0:'1'},directArray:[1,2],typedArray:new Uint8Array([1,2]),nativeBuffer:Buffer.from([1,2]),emptyBuffer:{type:'Buffer',data:[]},wrongType:{type:'Uint8Array',data:[1,2]},extraBufferProperty:{type:'Buffer',data:[1,2],extra:true},bufferObjectData:{type:'Buffer',data:{0:1,1:2}},invalidBufferByte:{type:'Buffer',data:[1,256]},bufferSparse:{type:'Buffer',data:new Array(2)},overSizeObject:indexed(Array(513).fill(1)),overSizeBase64:Buffer.alloc(513).toString('base64')};
for(const [mode,value] of Object.entries(invalids))for(const path of paths)test('invalid or future byte format remains blocked '+mode+' '+path.join('.'),()=>{
  const first=set(message(),path,value),second=set(message(),path,base64);
  assert.equal(nativeMessageBodiesEquivalent(first,second),false);
  assert.equal(nativeMessageBodiesEquivalent(first,first),!['typedArray','nativeBuffer','bufferSparse'].includes(mode),'identical actual JSON preserves the prior exact-body path');
});

test('identical JSON null and empty byte fields preserve the prior exact-body comparison',()=>{
  for(const value of [null,'',{},[],{type:'future-format',data:[]}]){const first=set(message(),paths[0],value);assert.equal(nativeMessageBodiesEquivalent(first,structuredClone(first)),true);}
});

test('byte forms at the exact bounds one and 512 remain valid',()=>{
  for(const count of [1,512]){const value=Array.from({length:count},(_,index)=>index%256),encoded=Buffer.from(value).toString('base64');assert.equal(nativeMessageBodiesEquivalent(set(message(),paths[0],indexed(value)),set(message(),paths[0],encoded)),true);assert.equal(nativeMessageBodiesEquivalent(set(message(),paths[0],{type:'Buffer',data:value}),set(message(),paths[0],encoded)),true);}
});

test('symbol, nonenumerable and accessor properties cannot masquerade as a dense byte object',()=>{
  const symbol={0:1};symbol[Symbol('extra')]=2;const hidden={0:1};Object.defineProperty(hidden,'extra',{value:2});let getterRead=false;const accessor={};Object.defineProperty(accessor,'0',{enumerable:true,get(){getterRead=true;return 1;}});
  for(const value of [symbol,hidden,accessor])assert.equal(nativeMessageBodiesEquivalent(set(message(),paths[0],value),set(message(),paths[0],'AQ==')),false);
  assert.equal(getterRead,false);
});

test('dense BufferJSON data rejects custom array properties',()=>{
  const data=[1,2];data.extra=3;assert.equal(nativeMessageBodiesEquivalent(set(message(),paths[0],{type:'Buffer',data}),set(message(),paths[0],'AQI=')),false);
});

test('different byte values, missing/null metadata and unrelated metadata are never discarded',()=>{
  const first=set(message(),paths[0],indexed(bytes));
  for(const second of [set(message(),paths[0],Buffer.from([1,2,127,128,254]).toString('base64')),message(),set(message(),paths[0],null),{...set(message(),paths[0],base64),newUnknownField:true}])assert.equal(nativeMessageBodiesEquivalent(first,second),false);
});

test('normalization does not extend to unknown paths, dotted literal keys or wrappers',()=>{
  const pairs=[
    [{messageContextInfo:{unreviewedBytes:indexed(bytes)}},{messageContextInfo:{unreviewedBytes:base64}}],
    [{'messageContextInfo.messageSecret':indexed(bytes)},{'messageContextInfo.messageSecret':base64}],
    [{ephemeralMessage:{message:set(message(),paths[0],indexed(bytes))}},{ephemeralMessage:{message:set(message(),paths[0],base64)}}],
  ];for(const [first,second] of pairs)assert.equal(nativeMessageBodiesEquivalent(first,second),false);
});

for(const mode of ['text','quotedId','forwarding','unknown-metadata','media','edit'])test('whole canonical message still compares every non-byte field: '+mode,()=>{
  const first=set(message(),paths[0],indexed(bytes)),second=set(message(),paths[0],base64);
  if(mode==='text')second.conversation='Otra solicitud';if(mode==='quotedId')second.messageContextInfo.stanzaId='ANOTHER_QUOTED_MID';if(mode==='forwarding')second.messageContextInfo.isForwarded=true;if(mode==='unknown-metadata')second.messageContextInfo.newField=1;if(mode==='media')second.imageMessage={caption:'otro',fileSha256:base64};if(mode==='edit')second.editedMessage={message:{conversation:'Hola'}};
  assert.equal(nativeMessageBodiesEquivalent(first,second),false);
});

async function resolverFixture(change=()=>{}){
  const at=Date.parse('2026-10-16T18:17:14Z'),phone='573000001234',lid='123456789012345@lid';
  const config={company:'fumigacion',enabled:true,activatedAt:at-3600000,lines:[{phone:FUMIGACION_BLUE,instance:'cucaracha-azul'},{phone:FUMIGACION_RED,instance:'cucaracha-roja'}]};
  const callback={key:{id:'BYTE_EQUIVALENT_CURRENT',remoteJid:lid,fromMe:false},messageTimestamp:at/1000,message:message(),contextInfo:{expiration:0}};
  const native=structuredClone(callback);for(const [index,path] of paths.entries()){set(callback.message,path,index===1?{type:'Buffer',data:[...bytes]}:indexed(bytes));set(native.message,path,base64);}
  const pair={key:{id:'BYTE_EQUIVALENT_EXPLICIT_PAIR',remoteJid:lid,remoteJidAlt:phone+'@s.whatsapp.net',fromMe:false},messageTimestamp:(at-1000)/1000,message:{conversation:'Pareja nativa sintética'}};
  change({callback,native,pair});const body={event:'messages.upsert',instance:'cucaracha-azul',data:callback},before=JSON.stringify(body);
  const transport={config,verifyLine:async requested=>{assert.equal(requested,FUMIGACION_BLUE);return {phone:requested,instance:'cucaracha-azul',open:true,ownerVerified:true,checkedAt:new Date(at+1000).toISOString()};},request:async(line,route)=>{assert.equal(line.phone,FUMIGACION_BLUE);assert.equal(route,'/chat/findMessages/cucaracha-azul');return {messages:{total:2,records:[native,pair]}};}};
  const result=await resolveOwnBlueNativeIdentity(config,transport,body,{authenticated:true,startedAt:at-5000,now:at+1000});assert.equal(JSON.stringify(body),before);
  return {result,body,callback,native};
}

test('prospective resolver accepts proved real-shaped byte encodings while all raw hashes remain exact',async()=>{
  const f=await resolverFixture();assert.equal(f.result.resolutions.length,1);assert.deepEqual(f.result.unresolved,[]);
  const proof=f.result.resolutions[0].proof;assert.equal(proof.callbackHash,nativeIdentityEvidenceHash(f.callback));assert.equal(f.result.originalBodyHash,nativeIdentityEvidenceHash(f.body));assert.equal(f.callback.key.remoteJidAlt,undefined);
  assert.equal(proof.messageBodyComparisonGuard,NATIVE_MESSAGE_BYTE_EQUIVALENCE_GUARD);assert.equal(proof.rawMessageBodiesEqual,false);
  const {proofHash,...unsigned}=proof;assert.equal(proofHash,nativeIdentityEvidenceHash(unsigned));
});

for(const mode of ['body','inner-citation','outer-citation','inner-forwarded','outer-forwarded','edited','invalid-byte'])test('resolver does not use byte equivalence to bypass content or safety changes: '+mode,async()=>{
  const f=await resolverFixture(({native})=>{if(mode==='body')native.message.conversation='Diferente';if(mode==='inner-citation')native.message.messageContextInfo.stanzaId='OTHER_QUOTE';if(mode==='outer-citation')native.contextInfo={stanzaId:'OTHER_QUOTE'};if(mode==='inner-forwarded')native.message.messageContextInfo.isForwarded=true;if(mode==='outer-forwarded')native.contextInfo.isForwarded=true;if(mode==='edited')native.message.editedMessage={message:{conversation:'Editado'}};if(mode==='invalid-byte')set(native.message,paths[0],{0:1,2:2});});
  assert.equal(f.result.resolutions.length,0);assert.ok(f.result.unresolved.length>0);
});
