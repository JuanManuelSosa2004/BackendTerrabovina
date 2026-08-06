'use strict';

// Sexo esperado por categoría: VACA/VAQUILLONA son siempre hembra,
// NOVILLO/TORO son siempre macho. TERNERO es la única categoría sin sexo
// fijo — el modelo predictivo también la trata como bucket único
// 'Ternero/Ternera' (ver CATEGORIA_A_MODELO en estimacion.controller.js),
// así que no se exige nada ahí.
const SEXO_ESPERADO_POR_CATEGORIA = {
  VACA: 'F',
  VAQUILLONA: 'F',
  NOVILLO: 'M',
  TORO: 'M',
};

// Devuelve un mensaje de error si sexo no corresponde a la categoría, o
// null si es válido (incluye categorías/sexo desconocidos: eso ya lo cubre
// el enum de la base).
function validarSexoParaCategoria(categoria, sexo) {
  const esperado = SEXO_ESPERADO_POR_CATEGORIA[categoria];
  if (!esperado || !sexo || sexo === esperado) return null;
  return `categoria ${categoria} requiere sexo ${esperado}, se recibió ${sexo}.`;
}

module.exports = { SEXO_ESPERADO_POR_CATEGORIA, validarSexoParaCategoria };
