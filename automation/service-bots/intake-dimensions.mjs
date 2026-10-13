// Preserve two literal dimensions as measurements. Neither units nor treated
// surface area are inferred, and multiplication never creates a price fact.
export const MARIA_DIMENSIONS_GUARD='own-literal-two-dimensions-without-calculated-area-v1';
export function literalIntakeDimensions(text){
 if(typeof text!=='string'||text.length>120||/[\n?¿"“”]/.test(text))return null;
 const raw=text.trim().replace(/[.! ]+$/,''),number='(\\d{1,5}(?:[.,]\\d{1,2})?)',unit='(m|mt|mts|metros?)';
 const match=new RegExp('^(?:medidas?\\s*[:=]\\s*)?'+number+'\\s*'+unit+'?\\s*(?:x|×|por)\\s*'+number+'\\s*'+unit+'?$','iu').exec(raw);
 if(!match||Number(match[1].replace(',','.'))<=0||Number(match[3].replace(',','.'))<=0)return null;
 return {literal:raw,explicitMetricUnits:Boolean(match[2]&&match[4]),calculatedArea:false};
}
