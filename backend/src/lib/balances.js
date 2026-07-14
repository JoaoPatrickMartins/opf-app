import { col } from '../db.js';
import { num } from './money.js';
import { todayServer } from './time.js';

// Convenção v2: amount é magnitude positiva; a direção vem do type.

// Mapa id -> type das fontes (coleção pequena; usado para saber o que é cartão de crédito).
async function sourceTypeMap() {
  const sources = await col.sources().find({}, { projection: { _id: 1, type: 1 } }).toArray();
  const m = new Map();
  for (const s of sources) m.set(s._id, s.type);
  return m;
}

// CAIXA da pessoa (dinheiro disponível) — despesa em cartão NÃO entra até a fatura ser paga:
//   caixa = initial_balance
//     + receitas
//     − despesas em dinheiro/débito (fonte != cartão de crédito)
//     − pagamentos de fatura feitos
//     − transferências enviadas
//     + transferências recebidas
export async function personCashBalance(personId) {
  const p = await col.people().findOne({ _id: personId }, { projection: { initial_balance: 1 } });
  if (!p) return 0;
  const today = todayServer();
  const types = await sourceTypeMap();
  const txs = await col.transactions()
    .find({ $or: [{ person_id: personId }, { type: 'transfer', counterparty_person_id: personId }] })
    .toArray();

  let income = 0, cashExpense = 0, payments = 0, sent = 0, received = 0;
  for (const t of txs) {
    // Despesa em dinheiro/débito: só SAI do caixa quando marcada como PAGA (t.paid).
    // Despesa de cartão NUNCA entra no caixa (só o pagamento da fatura, abaixo).
    if (t.person_id === personId && t.type === 'expense') {
      const st = t.source_id != null ? types.get(Number(t.source_id)) : null;
      if (st !== 'credit_card' && t.paid) cashExpense += num(t.amount);
      continue;
    }
    // Receita/pagamento/transferência: contam quando a data já ocorreu (não conta o futuro).
    if (t.date && t.date > today) continue;
    if (t.type === 'transfer' && t.counterparty_person_id === personId) received += num(t.amount);
    if (t.person_id !== personId) continue;
    if (t.type === 'income') income += num(t.amount);
    else if (t.type === 'payment') payments += num(t.amount);       // pagamento de fatura sai do caixa
    else if (t.type === 'transfer') sent += num(t.amount);
  }
  return num(p.initial_balance) + income - cashExpense - payments - sent + received;
}

// DÍVIDA/FATURA de um cartão = despesas no cartão − pagamentos ao cartão.
export async function cardDebt(sourceId) {
  const txs = await col.transactions()
    .find({ source_id: sourceId }, { projection: { type: 1, amount: 1 } })
    .toArray();
  let expenses = 0, payments = 0;
  for (const t of txs) {
    if (t.type === 'expense') expenses += num(t.amount);
    else if (t.type === 'payment') payments += num(t.amount);
  }
  return { expenses, payments, debt: expenses - payments };
}

// ACERTO por pessoa (quem deve a quem):
//   acerto = gastos no cartão (de crédito) − pagamentos feitos − transf. enviadas + transf. recebidas
//   > 0 → a pessoa deve ao grupo;  < 0 → o grupo deve a ela.
export async function settlement() {
  const people = await col.people().find({}, { projection: { _id: 1, name: 1 } }).sort({ name: 1 }).toArray();
  const types = await sourceTypeMap();
  const txs = await col.transactions().find({}).toArray();

  const rows = people.map((p) => {
    let cardExp = 0, payments = 0, sent = 0, received = 0;
    for (const t of txs) {
      if (t.type === 'transfer' && t.counterparty_person_id === p._id) received += num(t.amount);
      if (t.person_id !== p._id) continue;
      if (t.type === 'expense' && t.source_id != null && types.get(t.source_id) === 'credit_card') cardExp += num(t.amount);
      else if (t.type === 'payment') payments += num(t.amount);
      else if (t.type === 'transfer') sent += num(t.amount);
    }
    const acerto = cardExp - payments - sent + received;
    return { person_id: p._id, name: p.name, acerto: Math.round(acerto * 100) / 100 };
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
