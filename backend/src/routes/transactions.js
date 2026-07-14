import { Router } from 'express';
import { col, nextId, serialize } from '../db.js';
import { recordLearning } from '../ai/learning.js';
import { invoiceDueMonth } from '../lib/invoice.js';
import { materializeRecurring } from '../lib/recurring.js';
import { parseAmount, num } from '../lib/money.js';

const router = Router();

// FKs chegam do frontend como string (value de <select>); os _id no Mongo são números.
// Normaliza para número (ou null) para que a resolução de tipo/pessoa/categoria funcione.
const toId = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

// Mapas id -> nome/tipo para substituir os LEFT JOIN das consultas SQL.
async function refMaps() {
  const [people, sources, categories] = await Promise.all([
    col.people().find({}, { projection: { _id: 1, name: 1 } }).toArray(),
    col.sources().find({}, { projection: { _id: 1, name: 1, type: 1 } }).toArray(),
    col.categories().find({}, { projection: { _id: 1, name: 1 } }).toArray()
  ]);
  return {
    peoName: new Map(people.map((p) => [p._id, p.name])),
    srcName: new Map(sources.map((s) => [s._id, s.name])),
    srcType: new Map(sources.map((s) => [s._id, s.type])),
    catName: new Map(categories.map((c) => [c._id, c.name]))
  };
}

function enrichTx(t, m) {
  return {
    ...serialize(t),
    person_name: t.person_id != null ? (m.peoName.get(t.person_id) || null) : null,
    source_name: t.source_id != null ? (m.srcName.get(t.source_id) || null) : null,
    source_type: t.source_id != null ? (m.srcType.get(t.source_id) || null) : null,
    category_name: t.category_id != null ? (m.catName.get(t.category_id) || null) : null,
    counterparty_name: t.counterparty_person_id != null ? (m.peoName.get(t.counterparty_person_id) || null) : null
  };
}

async function getFull(_id) {
  const t = await col.transactions().findOne({ _id });
  if (!t) return null;
  return enrichTx(t, await refMaps());
}

async function registerLearningFromTx(_id) {
  const f = await getFull(_id);
  if (f && f.type === 'expense' && f.category_name) {
    await recordLearning(f.memo_original || f.description, f.category_name, f.person_name || null);
  }
}

// Resolve o mês de referência (cartão de crédito usa o dia de fechamento para despesas).
async function resolveReferenceMonth({ reference_month, type, source_id, date }) {
  if (reference_month) return reference_month;
  if (type === 'expense' && source_id) {
    const s = await col.sources().findOne({ _id: Number(source_id) }, { projection: { type: 1, closing_day: 1, due_day: 1 } });
    if (s && s.type === 'credit_card' && s.closing_day) return invoiceDueMonth(date, s.closing_day, s.due_day);
  }
  return date ? date.slice(0, 7) : null;
}

// GET /api/transactions?month=&person_id=&source_id=&category_id=&type=
router.get('/', async (req, res, next) => {
  try {
    const { month, person_id, source_id, category_id, type } = req.query;
    if (month) await materializeRecurring(month);
    const filter = {};
    if (month) filter.reference_month = month;
    if (person_id) filter.person_id = Number(person_id);
    if (source_id === 'cash') filter.source_id = null;
    else if (source_id) filter.source_id = Number(source_id);
    if (category_id) filter.category_id = Number(category_id);
    if (type) filter.type = type;

    const [docs, maps] = await Promise.all([
      col.transactions().find(filter).sort({ date: -1, _id: -1 }).toArray(),
      refMaps()
    ]);
    res.json(docs.map((t) => enrichTx(t, maps)));
  } catch (err) { next(err); }
});

// Resumo consolidado do mês (Dashboard) — gastos = consciência (inclui cartão não pago)
router.get('/summary', async (req, res, next) => {
  try {
    const { month } = req.query;
    if (!month) return res.status(400).json({ error: 'month é obrigatório (YYYY-MM)' });
    await materializeRecurring(month);

    const [monthTx, categories, people, sources] = await Promise.all([
      col.transactions().find({ reference_month: month }).toArray(),
      col.categories().find({}).toArray(),
      col.people().find({}).toArray(),
      col.sources().find({}, { projection: { _id: 1, name: 1, type: 1 } }).toArray()
    ]);
    const srcName = new Map(sources.map((s) => [s._id, s.name]));
    const srcType = new Map(sources.map((s) => [s._id, s.type]));

    let gastos = 0, gastos_cartao = 0, receitas = 0, pagamentos = 0;
    for (const t of monthTx) {
      if (t.type === 'expense') {
        gastos += num(t.amount);
        if (t.source_id != null && srcType.get(t.source_id) === 'credit_card') gastos_cartao += num(t.amount);
      } else if (t.type === 'income') receitas += num(t.amount);
      else if (t.type === 'payment') pagamentos += num(t.amount);
    }
    const totals = { gastos, gastos_cartao, receitas, pagamentos };

    const catSpent = new Map();
    for (const t of monthTx) {
      if (t.type === 'expense' && t.category_id != null) catSpent.set(t.category_id, (catSpent.get(t.category_id) || 0) + num(t.amount));
    }
    const byCategory = categories
      .map((c) => ({ category_id: c._id, category_name: c.name, budget_limit: c.budget_limit ?? null, spent: catSpent.get(c._id) || 0 }))
      .filter((c) => c.spent > 0 || c.budget_limit != null)
      .sort((a, b) => b.spent - a.spent);

    const pg = new Map();
    for (const t of monthTx) {
      if (t.person_id == null) continue;
      const g = pg.get(t.person_id) || { gastos: 0, receitas: 0 };
      if (t.type === 'expense') g.gastos += num(t.amount);
      else if (t.type === 'income') g.receitas += num(t.amount);
      pg.set(t.person_id, g);
    }
    const byPerson = people
      .map((p) => ({ person_id: p._id, name: p.name, gastos: pg.get(p._id)?.gastos || 0, receitas: pg.get(p._id)?.receitas || 0 }))
      .sort((a, b) => b.gastos - a.gastos);

    const bs = new Map();
    for (const t of monthTx) {
      if (t.type !== 'expense') continue;
      const key = t.source_id ?? null;
      const cur = bs.get(key) || {
        name: key != null ? (srcName.get(key) || 'Dinheiro') : 'Dinheiro',
        type: key != null ? (srcType.get(key) || null) : null,
        spent: 0
      };
      cur.spent += num(t.amount);
      bs.set(key, cur);
    }
    const bySource = [...bs.values()].sort((a, b) => b.spent - a.spent);

    res.json({ month, totals, byCategory, byPerson, bySource });
  } catch (err) { next(err); }
});

router.get('/compare', async (req, res, next) => {
  try {
    const limit = Number(req.query.months) || 6;
    const now = new Date();
    for (let i = 0; i < limit; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      await materializeRecurring(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const rows = await col.transactions().aggregate([
      {
        $group: {
          _id: '$reference_month',
          gastos: { $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] } },
          receitas: { $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] } }
        }
      },
      { $sort: { _id: -1 } },
      { $limit: limit }
    ]).toArray();
    res.json(rows.map((r) => ({ month: r._id, gastos: r.gastos, receitas: r.receitas })).reverse());
  } catch (err) { next(err); }
});

router.get('/months', async (_req, res, next) => {
  try {
    const months = await col.transactions().distinct('reference_month');
    res.json(months.filter(Boolean).sort().reverse());
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const b = req.body;
    if (b.amount == null || !b.date || !b.type) return res.status(400).json({ error: 'amount, date e type são obrigatórios' });
    if (!b.person_id) return res.status(400).json({ error: 'person_id é obrigatório (lançamento pertence a uma pessoa)' });
    const amount = parseAmount(b.amount);
    if (Number.isNaN(amount)) return res.status(400).json({ error: 'amount inválido (precisa ser um número)' });
    const reference_month = await resolveReferenceMonth(b);
    const _id = await nextId('transactions');
    await col.transactions().insertOne({
      _id,
      fitid: null,
      person_id: toId(b.person_id),
      source_id: toId(b.source_id),
      category_id: (b.type === 'expense' || b.type === 'income') ? toId(b.category_id) : null,
      counterparty_person_id: b.type === 'transfer' ? toId(b.counterparty_person_id) : null,
      type: b.type,
      reference_month,
      date: b.date,
      description: b.description || '',
      memo_original: b.memo_original || b.description || '',
      amount,
      installment: b.installment || null,
      source: b.source || 'manual',
      ai_suggested: 0,
      confirmed: 1,
      recurring_id: null,
      created_at: new Date().toISOString()
    });
    await registerLearningFromTx(_id);
    res.status(201).json(await getFull(_id));
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const _id = Number(req.params.id);
    const tx = await col.transactions().findOne({ _id });
    if (!tx) return res.status(404).json({ error: 'Lançamento não encontrado' });
    const b = req.body;
    const type = b.type || tx.type;
    const date = b.date || tx.date;
    const source_id = b.source_id === undefined ? tx.source_id : toId(b.source_id);
    const reference_month = b.reference_month
      || await resolveReferenceMonth({ type, source_id, date })
      || tx.reference_month;

    let amount = tx.amount;
    if (b.amount != null) {
      amount = parseAmount(b.amount);
      if (Number.isNaN(amount)) return res.status(400).json({ error: 'amount inválido (precisa ser um número)' });
    }

    await col.transactions().updateOne({ _id }, {
      $set: {
        person_id: b.person_id === undefined ? tx.person_id : toId(b.person_id),
        source_id,
        category_id: b.category_id === undefined ? tx.category_id : toId(b.category_id),
        counterparty_person_id: type === 'transfer'
          ? (b.counterparty_person_id === undefined ? tx.counterparty_person_id : toId(b.counterparty_person_id))
          : null,
        type,
        reference_month,
        date,
        description: b.description ?? tx.description,
        amount,
        installment: b.installment === undefined ? tx.installment : (b.installment || null)
      }
    });
    await registerLearningFromTx(_id);
    res.json(await getFull(_id));
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await col.transactions().deleteOne({ _id: Number(req.params.id) });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
