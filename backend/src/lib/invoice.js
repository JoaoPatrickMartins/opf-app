// Lógica de fatura de cartão de crédito baseada no dia de fechamento.

// Quantos dias tem o mês de um 'YYYY-MM'.
export function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

// Mês de referência (fatura) de uma transação de cartão.
// Compras feitas DEPOIS do dia de fechamento entram na fatura do mês seguinte.
// A fatura é rotulada pelo mês em que ela FECHA (consistente com o extrato Santander).
export function invoiceMonth(dateISO, closingDay) {
  if (!dateISO) return null;
  if (!closingDay) return dateISO.slice(0, 7);
  const [y, m, d] = dateISO.split('-').map(Number);
  let year = y;
  let month = m;
  if (d > closingDay) {
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}
