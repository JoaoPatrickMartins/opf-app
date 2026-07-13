// Utilitários de valor monetário. amount é SEMPRE magnitude positiva finita.

// Converte para magnitude positiva; retorna NaN se não for um número finito.
export function parseAmount(v) {
  const n = Math.abs(Number(v));
  return Number.isFinite(n) ? n : NaN;
}

// Coerção defensiva para somas/agregações: valores não-finitos viram 0
// (impede que uma única linha corrompida transforme todo o saldo em NaN).
export function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
