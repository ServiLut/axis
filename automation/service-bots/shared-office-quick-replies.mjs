import {createHash} from 'node:crypto';
export const SHARED_OFFICE_QUICK_REPLY_GUARD='own-shared-office-reference-context-and-selected-copy-v1';
export const sharedOfficeReferences=Object.freeze([
 {
  "id": "WA-REF-001",
  "category": "Posventa y revisión del caso",
  "status": "PERSONAL_REVIEW",
  "originalTextAndEmojiContentSha256": "244ffd3613c0552b0459e7f698fac8881cdfa25b4a36de5d3611bcb3bd170191"
 },
 {
  "id": "WA-REF-002",
  "category": "Plagas y método técnico",
  "status": "DO_NOT_ADOPT_UNIVERSAL_CLAIM",
  "originalTextAndEmojiContentSha256": "5a99423e1370792db48fbdaff5b6bee2a1beb2c6291f386c2f3657c318c46ea6"
 },
 {
  "id": "WA-REF-003",
  "category": "Privacidad y contacto",
  "status": "PERSONAL_REVIEW",
  "originalTextAndEmojiContentSha256": "3bc65d51c8d7b99a77631a2cc9f2d1e88a6b350123bf04de06c4f330b041bcd8"
 },
 {
  "id": "WA-REF-004",
  "category": "Seguimiento y captación",
  "status": "EVIDENCE_REQUIRED",
  "originalTextAndEmojiContentSha256": "4f11c1a4d42b7ea5acf2c5c7774e0be1bc4ba0a09a2d73f96777e5a3b06fe0b3"
 },
 {
  "id": "WA-REF-005",
  "category": "Garantía y condiciones comerciales",
  "status": "DO_NOT_ADOPT_UNIVERSAL_CLAIM",
  "originalTextAndEmojiContentSha256": "fb3f26851f44e759a48d13f0bfc1c1aa110e77f38c3fe7f297a6df7f3b3c99ed"
 },
 {
  "id": "WA-REF-006",
  "category": "Plagas y cotización especial",
  "status": "EVIDENCE_REQUIRED",
  "originalTextAndEmojiContentSha256": "8a62f8664e4f4b65a3a5318805ae8d5717dca16d78dbe405f1d40d55f53cbc5f"
 },
 {
  "id": "WA-REF-007",
  "category": "Preparación y seguridad",
  "status": "DO_NOT_ADOPT_UNIVERSAL_CLAIM",
  "originalTextAndEmojiContentSha256": "35a270fcb21fba420edf86d534898ce7eaff7a7d35d53159b587bbc85a2bbb09"
 },
 {
  "id": "WA-REF-008",
  "category": "Inicio y comprensión del caso",
  "status": "EXISTING_GUARDED_FLOW",
  "originalTextAndEmojiContentSha256": "59d86af3fc5f6049b498ea9a23e43b733aef572b1ab961144c0f659ac0073ff2"
 },
 {
  "id": "WA-REF-009",
  "category": "Inicio y comprensión del caso",
  "status": "EXISTING_GUARDED_FLOW",
  "originalTextAndEmojiContentSha256": "ef1c5b34cf2cb8204e53a746d85999c9db8c91b5c11423a375039fd28aee1d41"
 },
 {
  "id": "WA-REF-010",
  "category": "Cortesía y continuidad",
  "status": "EXISTING_GUARDED_FLOW",
  "originalTextAndEmojiContentSha256": "dcf3bed5571d1349ea8a23a2f1267471691e19886937a2e4e66ea97d0816eed5"
 },
 {
  "id": "WA-REF-011",
  "category": "Fidelización y seguimiento",
  "status": "EVIDENCE_REQUIRED",
  "originalTextAndEmojiContentSha256": "2c76e91dce6b867c73117647d422bbfaf7ce4d183667616f4ff1efd2db7781d3"
 },
 {
  "id": "WA-REF-012",
  "category": "Plagas y cotización",
  "status": "EVIDENCE_REQUIRED",
  "originalTextAndEmojiContentSha256": "caa1b666b15122db89ab9a46e15766558fd126ee2ba9e33a587fd946d99d2d2a"
 },
 {
  "id": "WA-REF-013",
  "category": "Refuerzo y condiciones comerciales",
  "status": "EVIDENCE_REQUIRED",
  "originalTextAndEmojiContentSha256": "8f8717084e94cbeaf770f2e26ea1566e290258b6df2e99e93f0870d727d7e3b9"
 },
 {
  "id": "WA-REF-014",
  "category": "Agenda y recordatorios",
  "status": "EVIDENCE_REQUIRED",
  "originalTextAndEmojiContentSha256": "25051412583f1d65058383da1a62c6015bd41d60936ac1b149ac5413a6f4cbcc"
 },
 {
  "id": "WA-REF-015",
  "category": "Agenda y recordatorios",
  "status": "EVIDENCE_REQUIRED",
  "originalTextAndEmojiContentSha256": "b510f7c12586f36c40bb56c495c883060f743a725176078dd1932f14411c9d17"
 },
 {
  "id": "WA-REF-016",
  "category": "Prevención y cuidados",
  "status": "EVIDENCE_REQUIRED",
  "originalTextAndEmojiContentSha256": "e370cf727e232218a211aba5fe101c7e9abf221e86e67e0a60fb24ade8a9d461"
 },
 {
  "id": "WA-REF-017",
  "category": "Incidencias y posventa",
  "status": "PERSONAL_REVIEW",
  "originalTextAndEmojiContentSha256": "5897d4433518b37909e95fb6eb928ab44eeaec3a4b26a94bcc2cd855400ea993"
 },
 {
  "id": "WA-REF-018",
  "category": "Recepción y registro",
  "status": "EXISTING_GUARDED_FLOW",
  "originalTextAndEmojiContentSha256": "8c1ed262710282cbc96c3c82a8e7caff22388782f1658eef3ab8bd2472f62683"
 },
 {
  "id": "WA-REF-019",
  "category": "Preparación y seguridad",
  "status": "DO_NOT_ADOPT_UNIVERSAL_CLAIM",
  "originalTextAndEmojiContentSha256": "c34dace87afb2293b2322bec413f258f65a2b25247c4052d9fa481860ddf9539"
 },
 {
  "id": "WA-REF-020",
  "category": "Cortesía y cierre",
  "status": "EXISTING_GUARDED_FLOW",
  "originalTextAndEmojiContentSha256": "6c992aba2c948b3b26065d745877f36aee20310d7c9a409b667cdbf3aab4d474"
 },
 {
  "id": "WA-REF-021",
  "category": "Plagas y cotización",
  "status": "DO_NOT_ADOPT_UNIVERSAL_CLAIM",
  "originalTextAndEmojiContentSha256": "3d5bae1ca47ad46c2b694fe5ae1f26be9c7bf5d4123647dcf17669c9d72ff138"
 },
 {
  "id": "WA-REF-022",
  "category": "Inicio y comprensión del caso",
  "status": "EXISTING_GUARDED_FLOW",
  "originalTextAndEmojiContentSha256": "07442ef4b40ad6b7428c1b44e289eb1dd34a9f3f04221058aeaf0a297fe28c85"
 },
 {
  "id": "WA-REF-023",
  "category": "Seguridad y personas sensibles",
  "status": "DO_NOT_ADOPT_UNIVERSAL_CLAIM",
  "originalTextAndEmojiContentSha256": "e8169e3d9daa6487f4c93ba6683a028f2db7cc51609fe50f149f98b50fe7f726"
 },
 {
  "id": "WA-REF-024",
  "category": "Garantía y resultado",
  "status": "DO_NOT_ADOPT_UNIVERSAL_CLAIM",
  "originalTextAndEmojiContentSha256": "f46b3ab729cf38a399eb00a4d0e112c3b6f245f9218a40bc93b8078dbc900c91"
 },
 {
  "id": "WA-REF-025",
  "category": "Pagos y conciliación",
  "status": "EVIDENCE_REQUIRED",
  "originalTextAndEmojiContentSha256": "414bd5e6f9ed4b0452f4acb7543cd9f513e1b7c6a36e4246b372cdfbe1281c97"
 }
].map(Object.freeze));
export const SHARED_OFFICE_SOURCE_SHA='e01aa8d4ef9d8c0096bef6a050e30952fb81a428391ea22e8abce241f62caec4';
export const SHARED_OFFICE_VERSION=createHash('sha256').update(JSON.stringify(sharedOfficeReferences)).digest('hex');

// Source texts were supplied directly for use by Maria. Keep case-dependent
// claims in their verified workflows; recent direct policies override templates.
export function sharedOfficeReferenceContext(){
 return {guard:SHARED_OFFICE_QUICK_REPLY_GUARD,version:SHARED_OFFICE_VERSION,sourceSha256:SHARED_OFFICE_SOURCE_SHA,entries:sharedOfficeReferences,identity:'María Ángel',rules:['Usar las referencias de saludo e información sólo para los datos faltantes del mismo caso.','La plantilla de datos se adapta a los campos que pide el programa; no pedir documento, correo o teléfono redundante.','Una queja o garantía continúa como posventa y revisión del mismo caso, sin reiniciar cotización.','Aplicar la regla humana más reciente: refuerzo 15–20 días después de la realización inicial al 50 % del pago inicial comprobado; tres meses desde la realización del refuerzo para un servicio nuevo con cotización propia.','La foto de fumigadores es un directorio de referencia; no demuestra disponibilidad ni asignación de una orden.','Productos, reingreso, métodos, certificaciones, garantías y pago requieren evidencia del caso; no copiar promesas generales ni nombres de asesores humanos.'],allTemplatesAutomaticallySendable:false};
}
export function sharedOfficeModelContext(){
 const {entries,sourceSha256,...context}=sharedOfficeReferenceContext();
 // Provenance hashes stay in the saved catalogue, not in every model request.
 return {...context,referenceCount:entries.length};
}
export function sharedOfficeSelectedReply(company,decision,text,{firstReply=false,approvedAnswer=false}={}){
 if(company!=='fumigacion'||!text||approvedAnswer||decision.observed)return null;
 let ids=[];
 if(!decision.review&&!decision.question&&/^Para registrar tu solicitud, compárteme:\n/.test(text)&&decision.state?.programIntake)ids=['WA-REF-018'];
 else if(!decision.review&&!decision.question&&/^(Hola|Buen día|Buenas tardes|Buenas noches), soy María Ángel\./.test(text)&&/Para cotizarte, cuéntame/.test(text))ids=['WA-REF-008','WA-REF-009','WA-REF-022'];
 else if(decision.reviewTopic==='warranty-review'&&decision.reviewConditions?.kind==='warranty'&&/^Lamento el inconveniente\. Voy a pedir que un asesor revise tu solicitud de garantía\./.test(text)){
  ids=['WA-REF-001'];text='Lamento mucho lo ocurrido. Voy a pedir que un asesor revise tu solicitud de garantía. Conservé lo que ya nos contaste.';
 }
 else if(decision.courtesy&&!decision.review&&!decision.question&&!decision.state?.awaitingHumanReview&&/^(?:Con gusto\.|Gracias por escribirnos\.|Con mucho gusto\. Gracias por tenernos en cuenta\.)/.test(text))ids=['WA-REF-020'];
 if(!ids.length)return null;
 return {guard:SHARED_OFFICE_QUICK_REPLY_GUARD,version:SHARED_OFFICE_VERSION,ids,text,adapted:true,originalTemplatesUnchanged:true};
}
export function sharedOfficeQuickReplyStatus(store){
 return {guard:SHARED_OFFICE_QUICK_REPLY_GUARD,version:SHARED_OFFICE_VERSION,references:sharedOfficeReferences.length,modeCounts:Object.fromEntries([...new Set(sharedOfficeReferences.map(v=>v.status))].map(k=>[k,sharedOfficeReferences.filter(v=>v.status===k).length])),selectedOutputs:store.db.prepare("SELECT COUNT(*) n FROM audit WHERE action='SHARED_QUICK_REPLY_SELECTED'").get().n,allTemplatesAutomaticallySendable:false};
}

