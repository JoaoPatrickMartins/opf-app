import db from '../db.js';

// Convenção v2: amount é magnitude positiva; a direção vem do type.
//
// CAIXA da pessoa (dinheiro disponível) — despesa em cartão NÃO entra até a fatura ser paga:
//   caixa = initial_balance
//     + receitas
//     − despesas em dinheiro/débito (fonte != cartão de crédito)
//     − pagamentos de fatura feitos
//     − transferências enviadas
//     + transferências recebidas
export function personCashBalance(personId) {
  const p = db.prepare('SELECT initial_balance FROM people WHERE id = ?').get(personId);
  if (!p) return 0;
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN t.type='income' THEN t.amount ELSE 0 END),0) AS income,
      COALESCE(SUM(CASE WHEN t.type='expense' AND (s.type IS NULL OR s.type != 'credit_card') THEN t.amount ELSE 0 END),0) AS cash_expense,
      COALESCE(SUM(CASE WHEN t.type='payment' THEN t.amount ELSE 0 END),0) AS payments,
      COALESCE(SUM(CASE WHEN t.type='transfer' THEN t.amount ELSE 0 END),0) AS sent
    FROM transactions t LEFT JOIN sources s ON s.id = t.source_id
    WHERE t.person_id = ?
  `).get(personId);
  const received = db.prepare(`
    SELECT COALESCE(SUM(amount),0) AS v FROM transactions WHERE type='transfer' AND counterparty_person_id = ?
  `).get(personId).v;
  return p.initial_balance + row.income - row.cash_expense - row.payments - row.sent + received;
}

// DÍVIDA/FATURA de um cartão = despesas no cartão − pagamentos ao cartão.
export function cardDebt(sourceId) {
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS expenses,
      COALESCE(SUM(CASE WHEN type='payment' THEN amount ELSE 0 END),0) AS payments
    FROM transactions WHERE source_id = ?
  `).get(sourceId);
  return { expenses: row.expenses, payments: row.payments, debt: row.expenses - row.payments };
}

// ACERTO por pessoa (quem deve a quem):
//   acerto = gastos no cartão (de crédito) − pagamentos feitos − transf. enviadas + transf. recebidas
//   > 0 → a pessoa deve ao grupo;  < 0 → o grupo deve a ela.
export function settlement() {
  const people = db.prepare('SELECT id, name FROM people ORDER BY name').all();
  const rows = people.map((p) => {
    const r = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN t.type='expense' AND s.type='credit_card' THEN t.amount ELSE 0 END),0) AS card_exp,
        COALESCE(SUM(CASE WHEN t.type='payment' THEN t.amount ELSE 0 END),0) AS payments,
        COALESCE(SUM(CASE WHEN t.type='transfer' THEN t.amount ELSE 0 END),0) AS sent
      FROM transactions t LEFT JOIN sources s ON s.id = t.source_id
      WHERE t.person_id = ?
    `).get(p.id);
    const received = db.prepare("SELECT COALESCE(SUM(amount),0) AS v FROM transactions WHERE type='transfer' AND counterparty_person_id = ?").get(p.id).v;
    const acerto = r.card_exp - r.payments - r.sent + received;
    return { person_id: p.id, name: p.name, acerto: Math.round(acerto * 100) / 100 };
  });

  // sugestão de acerto (greedy): devedores transferem para credores
  const debtors = rows.filter((r) => r.acerto > 0.01).map((r) => ({ ...r, rem: r.acerto }));
  const creditors = rows.filter((r) => r.acerto < -0.01).map((r) => ({ ...r, rem: -r.acerto }));
  const transfers = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].rem, creditors[j].rem);
    if (amount > 0.01) {
      transfers.push({ from: debtors[i].name, from_id: debtors[i].person_id, to: creditors[j].name, to_id: creditors[j].person_id, amount: Math.round(amount * 100) / 100 });
    }
    debtors[i].rem -= amount;
    creditors[j].rem -= amount;
    if (debtors[i].rem <= 0.01) i++;
    if (creditors[j].rem <= 0.01) j++;
  }
  return { balances: rows, transfers };
}
