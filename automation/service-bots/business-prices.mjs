import {createHash} from 'node:crypto';
import {normalize} from './config.mjs';
import {specialPropertyScope} from './property-scope.mjs';

export const BUSINESS_PRICE_AUTHORITY='direct-user-chat-20261005-mariangel-prices-and-reception';
export const BUSINESS_PRICE_GUARD='direct-approved-table-standard-price-and-scoped-extras-v1';
// The user's direct instruction approves only the pricing material. The other
// brochure content (chemicals, safety, guarantees) is not operational policy.
const schedule={company:'fumigacion',kind:'approved_price_schedule',source:BUSINESS_PRICE_AUTHORITY,
 authorizationSource:BUSINESS_PRICE_AUTHORITY,at:'2026-10-05',approval:{source:BUSINESS_PRICE_AUTHORITY,reviewed:true},
 materials:{cucarachas:'8fe591a33d154b5f808c16faf0ad9642be4499b6a5bf8732ec4a594594c0ccb8',roedores:'159dbef76389587131c15ae51208350e2b2ae6f22b25be85fe02eebad8fb2254',writtenClarification:'2fc3b51b8cd9d58dd60b1ac185ea97018597807eab46ddeae7a1ceb804aedb64',audio:'a409fcdcbb41f34d978024bd633bb8851df047ac48f79b4449d2636ec1fc11b0'},
 entries:[
  {rooms:1,minM2:30,maxM2:40,cucarachas:99000,cucarachasMinimum:89000,roedores:129000,roedoresMinimum:109000},
  {rooms:2,minM2:41,maxM2:50,cucarachas:129000,cucarachasMinimum:119000,roedores:129000,roedoresMinimum:119000},
  {rooms:3,minM2:51,maxM2:75,cucarachas:149000,cucarachasMinimum:139000,roedores:149000,roedoresMinimum:139000},
  {rooms:4,minM2:76,maxM2:100,cucarachas:169000,cucarachasMinimum:159000,roedores:169000,roedoresMinimum:159000},
  {rooms:5,minM2:101,maxM2:150,cucarachas:189000,cucarachasMinimum:179000,roedores:189000,roedoresMinimum:179000},
  {rooms:6,minM2:151,maxM2:200,cucarachas:209000,cucarachasMinimum:199000,roedores:209000,roedoresMinimum:199000}],
 comejenExtraCop:50000,chinchesPerMattressCop:99000,chinchesProposedPriceCop:100000,
 mattressPriceAuthorization:'direct-user-20261005-correction-99000-per-mattress',
 automaticDiscounts:false,avispaPrice:'inspection-required',
 scope:{properties:['casa','apartamento'],municipalities:['medellin','bello','envigado','itagui','sabaneta','la estrella','copacabana','girardota'],specialProperties:'human-review',multipleProperties:'human-review',travelOutsideMetro:'human-review',mattressVolumeFrom:6,extraAffectedFurniture:'human-review',priceColumn:'valor-de-fumigacion',minimumColumn:'internal-reference-only'}};
const canonical=JSON.stringify(schedule);
export const BUSINESS_PRICE_HASH=createHash('sha256').update(canonical).digest('hex');
// Preserve the exact previous version as evidence, while excluding it from new quotations.
export function supersededBusinessPriceSchedule(document){return document?.kind==='approved_price_schedule'&&createHash('sha256').update(JSON.stringify(document)).digest('hex')==='e906be8ff20357d7c6c3bdc229a926b610e1008442fb3597b2db6171224b8d9b';}
export const approvedBusinessPriceSchedule=()=>JSON.parse(canonical);
export function validateBusinessPriceSchedule(doc,company){
 if(company!=='fumigacion'||JSON.stringify(doc)!==canonical)throw Error('DIRECT_APPROVED_PRICE_SCHEDULE_REQUIRED');
 return doc;
}
function count(value){
 const words={un:1,uno:1,una:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10};
 const m=normalize(value).match(/^(\d{1,3}|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(?:habitacion(?:es)?|cuartos?|piezas?|colchon|colchones)$/);
 return m?(words[m[1]]??Number(m[1])):null;
}
function squareArea(value){const m=normalize(value).match(/^(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:m(?:ts?)?\s*(?:2|²)|m(?:ts?)?\.?\s*cuadrados?|metros?\s*cuadrados?)$/);return m?Number(m[1].replace(',','.')):null;}
export function selectBusinessPrice(slots){
 if(specialPropertyScope(Object.values(slots).join(' '),slots))return {reason:'BUSINESS_SPECIAL_PROPERTY_REVIEW'};
 if(!schedule.scope.properties.includes(normalize(slots.site))||!schedule.scope.municipalities.includes(normalize(slots.location)))return {reason:'BUSINESS_PRICE_SCOPE_REVIEW'};
 if(slots.roomScale||slots.siteScale||slots.treatmentScope||slots.patio&&slots.patio!=='sin patio'||slots.floors&&!/^1(?:er|ro)?\s+(?:piso|nivel)$/.test(normalize(slots.floors)))return {reason:'BUSINESS_PRICE_EXTRA_SCOPE_REVIEW'};
 const service=normalize(slots.service);let amount,row,basis,category;
 if(service==='chinches'){
  const n=count(slots.mattresses);
  if(!n||n>=schedule.scope.mattressVolumeFrom||slots.affectedFurniture)return {reason:'MATTRESS_VOLUME_OR_FURNITURE_REVIEW'};
  amount=n*schedule.chinchesPerMattressCop;basis=n;category='chinches';
 }else{
  category=service==='cucarachas'?'cucarachas':['ratas','ratones','ratas y ratones','ratones y ratas','roedores'].includes(service)?'roedores':service==='comején'||service==='comejen'?'comejen':null;
  if(!category)return {reason:'NO_APPROVED_BUSINESS_PEST_PRICE'};
  const area=slots.area?squareArea(slots.area):null,rooms=slots.rooms?count(slots.rooms):null;
  if(slots.area&&area===null||slots.rooms&&rooms===null)return {reason:'BUSINESS_SIZE_UNIT_REVIEW'};
  row=schedule.entries.find(r=>(area===null||area>=r.minM2&&area<=r.maxM2)&&(rooms===null||r.rooms===rooms));
  if(area===null&&rooms===null||!row)return {reason:'BUSINESS_SIZE_BAND_REVIEW'};
  amount=row[category==='comejen'?'cucarachas':category]+(category==='comejen'?schedule.comejenExtraCop:0);basis=row.rooms;
 }
 const id='approved-table-'+category+'-'+basis;
 const entry={id,priceCop:amount,currency:'COP',active:true,scope:'direct-approved-ordinary-residential-service',appliesTo:{...slots},
  source:{type:'direct_user_approved_schedule',quoteId:BUSINESS_PRICE_AUTHORITY,at:schedule.at,scheduleHash:BUSINESS_PRICE_HASH},
  category,...(category==='chinches'?{mattresses:basis,unitPriceCop:schedule.chinchesPerMattressCop}:{roomsBand:row.rooms,areaBand:[row.minM2,row.maxM2]})};
 return {entry,sourceIds:[BUSINESS_PRICE_AUTHORITY]};
}
export function verifyBusinessPriceEntry(entry){
 const selected=entry&&selectBusinessPrice(entry.appliesTo).entry;
 if(!selected||JSON.stringify(selected)!==JSON.stringify(entry))throw Error('APPROVED_BUSINESS_PRICE_CHANGED');
 return true;
}
