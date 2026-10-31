// Generado por work/maria-agente/construir-integracion.mjs desde src/precios.mjs. No editar aquí.
// Tabla vigente desde 2026-10-16 (business-prices.mjs, versión 2026-10-16-confirmed-excel-v2).
// El modelo nunca calcula precios: siempre llama a cotizar().
export const TABLA = [
  { habitaciones: 1, minM2: 30, maxM2: 40, cucarachas: 99000, roedores: 119000 },
  { habitaciones: 2, minM2: 41, maxM2: 50, cucarachas: 129000, roedores: 129000 },
  { habitaciones: 3, minM2: 51, maxM2: 75, cucarachas: 149000, roedores: 149000 },
  { habitaciones: 4, minM2: 76, maxM2: 100, cucarachas: 169000, roedores: 169000 },
  { habitaciones: 5, minM2: 101, maxM2: 150, cucarachas: 189000, roedores: 189000 },
  { habitaciones: 6, minM2: 151, maxM2: 200, cucarachas: 209000, roedores: 209000 },
];
export const COMEJEN_ADICIONAL = 50000;
export const CHINCHES_POR_COLCHON = 100000;
export const CHINCHES_MAYOR_DESDE = 7;
export const CHINCHES_MAYOR_POR_COLCHON = 70000;
export const MUNICIPIOS = ['medellin', 'bello', 'envigado', 'itagui', 'sabaneta', 'la estrella', 'copacabana', 'girardota'];
export const INMUEBLES = ['casa', 'apartamento'];
export const PLAGAS = ['cucarachas', 'roedores', 'comejen', 'chinches', 'avispas', 'otra'];

export const normalizar = (texto) =>
  String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const pesos = (valor) => '$' + valor.toLocaleString('es-CO').replace(/,/g, '.');

const revision = (motivo) => ({ ok: false, requiereHumano: true, motivo });

// Devuelve { ok:true, valor, detalle } o { ok:false, requiereHumano:true, motivo }.
export function cotizar({ plaga, inmueble, municipio, habitaciones = null, metrosCuadrados = null, colchones = null, muebles = null, pisos = null, patio = null }) {
  const p = normalizar(plaga);
  if (!PLAGAS.includes(p)) return revision('Plaga no reconocida');
  if (p === 'avispas') return revision('Avispas requiere inspección presencial');
  if (p === 'otra') return revision('Plaga sin precio aprobado');
  if (!INMUEBLES.includes(normalizar(inmueble))) return revision('Tipo de inmueble fuera de la tabla (solo casa o apartamento)');
  if (!MUNICIPIOS.includes(normalizar(municipio))) return revision('Municipio fuera de cobertura');
  // Igual que business-prices.mjs: más de un piso o patio salen de la tabla estándar.
  if (pisos !== null && pisos > 1) return revision('Inmueble de varios pisos');
  if (patio === true) return revision('Inmueble con patio');

  if (p === 'chinches') {
    if (!Number.isInteger(colchones) || colchones < 1) return revision('Falta el número de colchones');
    if (muebles === null) return revision('Falta preguntar si hay sofás u otros muebles afectados');
    if (muebles > 0) return revision('Chinches con sofás o muebles: la tabla solo cubre colchones');
    const unitario = colchones >= CHINCHES_MAYOR_DESDE ? CHINCHES_MAYOR_POR_COLCHON : CHINCHES_POR_COLCHON;
    // entryId con el mismo formato que selectBusinessPrice() en business-prices.mjs.
    return { ok: true, valor: colchones * unitario, entryId: `approved-table-chinches-${colchones}`, detalle: `Chinches, ${colchones} colchón(es) a ${pesos(unitario)} c/u` };
  }

  if (habitaciones === null && metrosCuadrados === null) return revision('Falta el tamaño (habitaciones o m²)');
  const fila = TABLA.find(
    (f) =>
      (habitaciones === null || f.habitaciones === habitaciones) &&
      (metrosCuadrados === null || (metrosCuadrados >= f.minM2 && metrosCuadrados <= f.maxM2)),
  );
  if (!fila) return revision('Tamaño fuera de la tabla o habitaciones y m² no coinciden');
  const base = p === 'roedores' ? fila.roedores : fila.cucarachas;
  const valor = p === 'comejen' ? base + COMEJEN_ADICIONAL : base;
  const nombre = { cucarachas: 'Cucarachas', roedores: 'Roedores', comejen: 'Comején' }[p];
  return { ok: true, valor, entryId: `approved-table-${p}-${fila.habitaciones}`, detalle: `${nombre}, ${fila.habitaciones} habitación(es) / ${fila.minM2}–${fila.maxM2} m²` };
}
