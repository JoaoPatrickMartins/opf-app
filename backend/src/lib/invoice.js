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

// Soma N meses a um 'YYYY-MM'.
export function addMonths(ym, delta) {
  if (!ym) return ym;
  const [y, m] = ym.split('-').map(Number);
  let year = y;
  let month = m + delta;
  while (month > 12) { month -= 12; year += 1; }
  while (month < 1) { month += 12; year -= 1; }
  return `${year}-${String(month).padStart(2, '0')}`;
}

// Mês de VENCIMENTO (pagamento) da fatura de uma transação de cartão.
// É o mês em que a fatura FECHA (invoiceMonth), deslocado +1 quando o vencimento
// cai no mês seguinte ao fechamento (due_day <= closing_day).
// É esse o mês em que a despesa "conta" no app — quando de fato é paga.
export function invoiceDueMonth(dateISO, closingDay, dueDay) {
  const closing = invoiceMonth(dateISO, closingDay);
  if (!closing || !closingDay || !dueDay) return closing;
  return dueDay <= closingDay ? addMonths(closing, 1) : closing;
}
