import {normalize} from './config.mjs';

// A named complex in the address does not enlarge a single apartment's scope.
// Explicit common areas, multiple properties and special work retain review.
export function specialPropertyScope(text,slots={}){
  const t=normalize(text);
  const multiple=[...t.matchAll(/\b(?:\d+|dos|tres|cuatro|cinco|seis)\s+(?:apartamentos?|aptos?|casas?|locales?|torres?)\b/g)]
    .some(m=>!(/\btorre\b/.test(m[0])&&/\bapto\s+$/.test(t.slice(0,m.index)))&&
      !(/\bapto$/.test(m[0])&&/^\s+\d+\b/.test(t.slice(m.index+m[0].length))));
  if(/\b(?:zonas? comunes?|parqueaderos?|shut|shute|inspeccion|cotizacion formal|cotizacion tecnica formal)\b/.test(t)||
     multiple||
     ['edificio','unidad residencial','conjunto','parqueadero'].includes(normalize(slots.site)))return true;
  const complex=/\b(?:edificios?|conjuntos?|unidades? residenciales?|urbanizacion(?:es)?)\b/g;
  const mentions=[...t.matchAll(complex)];
  if(!mentions.length)return false;
  if(/\b(?:todo|toda|entero|entera|completo|completa)\b/.test(t))return true;
  const singleApartment=/\b(?:mi |un |el )?apartamento\b|\bapto\s*\d+\b/.test(t)||normalize(slots.site)==='apartamento';
  if(!singleApartment)return true;
  const numberedAddress=/\bapto\s*\d+\b/.test(t)&&/\b(?:calle|carrera|cra|kra|cl|torre)\b/.test(t);
  return mentions.some(m=>{
    const before=t.slice(0,m.index);
    const locative=/\ben\s+(?:(?:un|una|el|la|un\s+edificio|una\s+unidad)\s+)?$/.test(before);
    const addressTail=numberedAddress&&/\bapto\s*\d+\b/.test(before);
    return !locative&&!addressTail;
  });
}
