import { Router } from 'express';
import { col, nextId, serialize, serializeAll } from '../db.js';
import { personCashBalance, settlement } from '../lib/balances.js';
import { materializeRecurring } from '../lib/recurring.js';
import { num } from '../lib/money.js';
import { todayServer } from '../lib/time.js';

const router = Router();

// Lista pessoas com saldo de caixa
router.get('/', async (_req, res, next) => {
  try {
    const people = serializeAll(await col.people().find({}).sort({ is_self: -1, name: 1 }).toArray());
    for (const p of people) p.cash_balance = await personCashBalance(p.id);
    res.json(people);
  } catch (err) { next(err); }
});

// "Quem deve a quem"
router.get('/settlement', async (_req, res, next) => {
  try {
    res.json(await settlement());
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, is_self, initial_balance, color } = req.body;
    if (!name) return res.status(400).json({ error: 'name é obrigatório' });
    const _id = await nextId('people');
    await col.people().insertOne({
      _id,
      name,
      is_self: is_self ? 1 : 0,
      initial_balance: Number(initial_balance) || 0,
      color: color || null,
      created_at: new Date().toISOString()
    });
    res.status(201).json(serialize(await col.people().findOne({ _id })));
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const _id = Number(req.params.id);
    const p = await col.people().findOne({ _id });
    if (!p) return res.status(404).json({ error: 'Pessoa não encontrada' });
    const { name, is_self, initial_balance, color } = req.body;
    await col.people().updateOne({ _id }, {
      $set: {
        name: name ?? p.name,
        is_self: is_self === undefined ? p.is_self : (is_self ? 1 : 0),
        initial_balance: initial_balance === undefined ? p.initial_balance : Number(initial_balance) || 0,
        color: color === undefined ? p.color : color
      }
    });
    res.json(serialize(await col.people().findOne({ _id })));
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const _id = Number(req.params.id);
    // ON DELETE CASCADE (transactions.person_id, recurring_rules.person_id)
    await col.transactions().deleteMany({ person_id: _id });
    await col.recurring().deleteMany({ person_id: _id });
    // ON DELETE SET NULL (transactions.counterparty_person_id)
    await col.transactions().updateMany({ counterparty_person_id: _id }, { $set: { counterparty_person_id: null } });
    await col.people().deleteOne({ _id });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Extrato/administração do mês da pessoa
router.get('/:id/statement', async (req, res, next) => {
  try {
    const _id = Number(req.params.id);
    const person = serialize(await col.people().findOne({ _id }));
    if (!person) return res.status(404).json({ error: 'Pessoa não encontrada' });
    const month = req.query.month;
    if (!month) return res.status(400).json({ error: 'month é obrigatório (YYYY-MM)' });
    await materializeRecurring(month);

    // Mapas id -> nome/tipo para substituir os LEFT JOINs
    const [sources, categories, people] = await Promise.all([
      col.sources().find({}, { projection: { _id: 1, name: 1, type: 1 } }).toArray(),
      col.categories().find({}, { projection: { _id: 1, name: 1 } }).toArray(),
      col.people().find({}, { projection: { _id: 1, name: 1 } }).toArray()
    ]);
    const srcName = new Map(sources.map((s) => [s._id, s.name]));
    const srcType = new Map(sources.map((s) => [s._id, s.type]));
    const catName = new Map(categories.map((c) => [c._id, c.name]));
    const peoName = new Map(people.map((p) => [p._id, p.name]));

    const sortByDateId = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id);

    const ownDocs = await col.transactions()
      .find({ person_id: _id, reference_month: month })
      .toArray();
    const own = ownDocs.map((t) => ({
      ...serialize(t),
      source_name: t.source_id != null ? (srcName.get(t.source_id) || null) : null,
      source_type: t.source_id != null ? (srcType.get(t.source_id) || null) : null,
      category_name: t.category_id != null ? (catName.get(t.category_id) || null) : null,
      counterparty_name: t.counterparty_person_id != null ? (peoName.get(t.counterparty_person_id) || null) : null
    })).sort(sortByDateId);

    // transferências recebidas (a pessoa é destino)
    const recvDocs = await col.transactions()
      .find({ type: 'transfer', counterparty_person_id: _id, reference_month: month })
      .toArray();
    const received = recvDocs.map((t) => ({
      ...serialize(t),
      source_name: t.source_id != null ? (srcName.get(t.source_id) || null) : null,
      counterparty_name: t.person_id != null ? (peoName.get(t.person_id) || null) : null,
      flow: 'transfer_in'
    })).sort(sortByDateId);

    const expenses = own.filter((t) => t.type === 'expense');
    const incomes = own.filter((t) => t.type === 'income');

    // Faturas de cartão do mês: gasto no cartão − pagamentos JÁ FEITOS ao cartão (por cartão).
    // Pagamento futuro (agendado) não abate a fatura nem o caixa até a data chegar.
    const today = todayServer();
    const invoiceMap = new Map();
    for (const t of own) {
      if (t.source_id == null || t.source_type !== 'credit_card') continue;
      if (!invoiceMap.has(t.source_id)) {
        invoiceMap.set(t.source_id, { source_id: t.source_id, source_name: t.source_name, spent: 0, paid: 0 });
      }
      const inv = invoiceMap.get(t.source_id);
      if (t.type === 'expense') inv.spent += num(t.amount);
      else if (t.type === 'payment' && (!t.date || t.date <= today)) inv.paid += num(t.amount);
    }
    const r2 = (n) => Math.round(n * 100) / 100;
    const cardInvoices = [...invoiceMap.values()]
      .map((inv) => ({ source_id: inv.source_id, source_name: inv.source_name, spent: r2(inv.spent), paid: r2(inv.paid), outstanding: r2(Math.max(0, inv.spent - inv.paid)) }))
      .sort((a, b) => b.outstanding - a.outstanding);
    const cardFullyPaid = new Map(cardInvoices.map((i) => [i.source_id, i.outstanding <= 0.005]));

    // Status de cada despesa: dinheiro usa o flag `paid`; cartão é "pago" se a fatura do mês zerou.
    for (const t of own) {
      if (t.type !== 'expense') continue;
      t.is_paid = t.source_type === 'credit_card' ? !!cardFullyPaid.get(t.source_id) : !!t.paid;
    }

    // despesas separadas por cartão/fonte (cartões ganham "a pagar" = gasto − pago)
    const bySourceMap = new Map();
    for (const t of expenses) {
      const key = t.source_id || 'cash';
      if (!bySourceMap.has(key)) {
        bySourceMap.set(key, { source_id: t.source_id || null, source_name: t.source_name || 'Dinheiro', source_type: t.source_type || 'cash', spent: 0, count: 0 });
      }
      const g = bySourceMap.get(key);
      g.spent += num(t.amount); g.count += 1;
    }
    for (const s of bySourceMap.values()) {
      if (s.source_type === 'credit_card') {
        const inv = invoiceMap.get(s.source_id);
        s.paid = inv ? inv.paid : 0;
        s.outstanding = Math.max(0, s.spent - s.paid);
      }
    }
    const bySource = [...bySourceMap.values()].sort((a, b) => b.spent - a.spent);

    // por categoria
    const byCatMap = new Map();
    for (const t of expenses) {
      const key = t.category_name || 'Sem categoria';
      byCatMap.set(key, (byCatMap.get(key) || 0) + num(t.amount));
    }
    const byCategory = [...byCatMap.entries()].map(([category_name, spent]) => ({ category_name, spent })).sort((a, b) => b.spent - a.spent);

    const cashExpenses = expenses.filter((t) => t.source_type !== 'credit_card');
    const totals = {
      gastos: expenses.reduce((s, t) => s + num(t.amount), 0),
      gastos_cartao: expenses.filter((t) => t.source_type === 'credit_card').reduce((s, t) => s + num(t.amount), 0),
      gastos_dinheiro: cashExpenses.reduce((s, t) => s + num(t.amount), 0),
      dinheiro_pendente: r2(cashExpenses.filter((t) => !t.paid).reduce((s, t) => s + num(t.amount), 0)),
      cartao_a_pagar: r2(cardInvoices.reduce((s, i) => s + i.outstanding, 0)),
      receitas: incomes.reduce((s, t) => s + num(t.amount), 0),
      pagamentos: own.filter((t) => t.type === 'payment').reduce((s, t) => s + num(t.amount), 0),
      transferencias_enviadas: own.filter((t) => t.type === 'transfer').reduce((s, t) => s + num(t.amount), 0),
      transferencias_recebidas: received.reduce((s, t) => s + num(t.amount), 0)
    };

    const cashBalance = await personCashBalance(person.id);
    res.json({
      // cash_balance também dentro de `person` (o frontend lê person.cash_balance)
      person: { ...person, cash_balance: cashBalance },
      month,
      cash_balance: cashBalance,
      totals,
      bySource,
      cardInvoices,
      byCategory,
      transactions: [...own, ...received].sort(sortByDateId),
      expenses,
      incomes
    });
  } catch (err) { next(err); }
});

export default router;
