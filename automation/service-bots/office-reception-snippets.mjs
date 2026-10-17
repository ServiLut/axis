// User 17/10/2026: use the supplied office workbook as a reference for clear
// reception. This narrow selection adds no policy, FAQ approval or permissions.
// Existing delivered texts and registration summaries are never rewritten.
export const OFFICE_RECEPTION_GUARD='own-deterministic-reception-reviewed-office-reference-v1';
export const OFFICE_RECEPTION_REFERENCE=Object.freeze({
 company:'fumigacion',kind:'communication-reference-subset',
 sourceFile:'RESPUESTAS_FUMIGACION_OFICINA (1).xlsx',
 sourceSha256:'26d1086c045a62cde5fe480d30c0d2f208557772133558014282577b56f24388',
 authorizationSource:'direct-user-chat-20261017-chief-only-tests-and-office-excel-reference',
 importedAsApprovedCustomerAnswers:false,policyDecisionsAdopted:0,
 selections:Object.freeze([
  Object.freeze({id:'greeting-once',range:'RESPUESTAS!C5:D5',use:'Keep Maria identity; address an existing question without restarting the conversation.'}),
  Object.freeze({id:'only-missing-intake',range:'RESPUESTAS!C6:D7',use:'Present only the deterministic intake requests already selected for this case.'}),
  Object.freeze({id:'only-missing-access',range:'RESPUESTAS!C31:D31',use:'Name/address collection remains in its source-verified registration flow, without extra personal data.'}),
  Object.freeze({id:'decline-close',range:'RESPUESTAS!C61:D61',use:'Close a verified deterministic decline without another question or reminder.'})
 ])
});

const requests=new Map([
 ['Qué plaga deseas tratar o si buscas prevención.','qué plaga deseas tratar o si buscas prevención'],
 ['Qué tipo de inmueble es y cuántas habitaciones o metros cuadrados tiene.','qué tipo de inmueble es y cuántas habitaciones o metros cuadrados tiene'],
 ['Qué tipo de inmueble es.','qué tipo de inmueble es'],
 ['Cuántas habitaciones o metros cuadrados tiene.','cuántas habitaciones o metros cuadrados tiene'],
 ['Cuántos colchones están afectados.','cuántos colchones están afectados'],
 ['Cuántos colchones están afectados y si también hay chinches en bases de cama u otros muebles.','cuántos colchones están afectados y si también hay chinches en bases de cama u otros muebles'],
 ['El municipio y barrio o vereda donde necesitas el servicio.','el municipio y barrio o vereda donde necesitas el servicio'],
 ['El municipio donde necesitas el servicio; ya conservé la ubicación indicada.','el municipio donde necesitas el servicio']
]);

// Exact deterministic requests only. This formatter neither reads raw customer
// text nor infers, fills, acknowledges or removes a fact from the case.
export function officeReceptionRequestLabel(text){return requests.get(text)??null;}
export function officeReceptionRequestValues(){return [...requests.values()];}
export function formatOfficeReceptionRequests(items){
 if(!Array.isArray(items)||!items.length||items.length>requests.size||new Set(items).size!==items.length)return null;
 const labels=items.map(officeReceptionRequestLabel);
 if(labels.some(label=>!label))return null;
 return labels.length===1?'Para cotizarte, cuéntame '+labels[0]+'.':
  'Para cotizarte, cuéntame:\n'+labels.map((label,i)=>(i+1)+'. '+label[0].toUpperCase()+label.slice(1)+'.').join('\n');
}

export function officeReceptionDeclineText(decision){
 // A courtesy or a customer sentence alone does not establish a decline. The
 // existing Engine must have closed the case with this exact reviewed result.
 if(decision?.courtesy!==true||decision.state?.closed!==true||decision.review||decision.question||decision.observed||decision.reply!=='Entendido, gracias por avisarme.')return null;
 return 'Con mucho gusto. Gracias por tenernos en cuenta. Si más adelante necesitas orientación, aquí puedes escribirnos.';
}
