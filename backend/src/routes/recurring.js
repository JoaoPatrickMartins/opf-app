import { Router } from 'express';
import { col, nextId, serialize } from '../db.js';
import { materializeRecurring } from '../lib/recurring.js';
import { currentMonthServer, todayServer } from '../lib/time.js';
import { parseAmount } from '../lib/money.js';

const router = Router();

// Enriquece uma regra com person_name/source_name/category_name (substitui os LEFT JOIN).
async function enrichRules(docs) {
  const [people, sources, categories] = await Promise.all([
    col.people().find({}, { projection: { _id: 1, name: 1 } }).toArray(),
    col.sources().find({}, { projection: { _id: 1, name: 1 } }).toArray(),
    col.categories().find({}, { projection: { _id: 1, name: 1 } }).toArray()
  ]);
  const peo = new Map(people.map((p) => [p._id, p.name]));
  const src = new Map(sources.map((s) => [s._id, s.name]));
  const cat = new Map(categories.map((c) => [c._id, c.name]));
  return docs.map((r) => ({
    ...serialize(r),
    person_name: r.person_id != null ? (peo.get(r.person_id) || null) : null,
    source_name: r.source_id != null ? (src.get(r.source_id) || null) : null,
    category_name: r.category_id != null ? (cat.get(r.category_id) || null) : null
  }));
}

async function full(_id) {
  const doc = await col.recurring().findOne({ _id });
  if (!doc) return null;
  return (await enrichRules([doc]))[0];
}

router.get('/', async (_req, res, next) => {
  try {
    const docs = await col.recurring().find({}).sort({ type: 1, description: 1 }).toArray();
    res.json(await enrichRules(docs));
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const b = req.body;
    if (b.amount == null || !b.description) return res.status(400).json({ error: 'amount e description são obrigatórios' });
    if (!b.person_id) return res.status(400).json({ error: 'person_id é obrigatório' });
    const amount = parseAmount(b.amount);
    if (Number.isNaN(amount)) return res.status(400).json({ error: 'amount inválido (precisa ser um número)' });
    const type = b.type === 'expense' ? 'expense' : 'income';
    const start_month = b.start_month || currentMonthServer();
    const _id = await nextId('recurring_rules');
    await col.recurring().insertOne({
      _id,
      type,
      person_id: b.person_id || null,
      source_id: b.source_id || null,
      category_id: b.category_id || null,
      description: b.description,
      amount,
      day_of_month: Number(b.day_of_month) || 1,
      start_month,
      end_month: b.end_month || null,
      total_occurrences: b.total_occurrences ? Number(b.total_occurrences) : null,
      active: 1,
      created_at: new Date().toISOString()
    });
    // materializa o mês inicial e o mês atual
    await materializeRecurring(start_month);
    await materializeRecurring(currentMonthServer());
    res.status(201).json(await full(_id));
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const _id = Number(req.params.id);
    const r = await col.recurring().findOne({ _id });
    if (!r) return res.status(404).json({ error: 'Recorrência não encontrada' });
    const b = req.body;
    let amount = r.amount;
    if (b.amount != null) {
      amount = parseAmount(b.amount);
      if (Number.isNaN(amount)) return res.status(400).json({ error: 'amount inválido (precisa ser um número)' });
    }
    await col.recurring().updateOne({ _id }, {
      $set: {
        type: b.type || r.type,
        person_id: b.person_id || r.person_id,
        source_id: b.source_id === undefined ? r.source_id : (b.source_id || null),
        category_id: b.category_id === undefined ? r.category_id : (b.category_id || null),
        description: b.description ?? r.description,
        amount,
        day_of_month: b.day_of_month != null ? Number(b.day_of_month) : r.day_of_month,
        start_month: b.start_month || r.start_month,
        end_month: b.end_month === undefined ? r.end_month : (b.end_month || null),
        total_occurrences: b.total_occurrences === undefined ? r.total_occurrences : (b.total_occurrences ? Number(b.total_occurrences) : null),
        active: b.active != null ? (b.active ? 1 : 0) : r.active
      }
    });
    res.json(await full(_id));
  } catch (err) { next(err); }
});

// Cancela uma recorrência daqui pra frente: para de gerar lançamentos futuros e
// remove só as ocorrências ainda NÃO ocorridas (date > hoje). As já ocorridas
// (ex.: a mensalidade deste mês já paga) permanecem no histórico.
router.post('/:id/cancel', async (req, res, next) => {
  try {
    const _id = Number(req.params.id);
    const r = await col.recurring().findOne({ _id });
    if (!r) return res.status(404).json({ error: 'Recorrência não encontrada' });
    const today = todayServer();
    const purge = await col.transactions().deleteMany({ recurring_id: _id, date: { $gt: today } });
    await col.recurring().updateOne({ _id }, { $set: { active: 0, end_month: currentMonthServer() } });
    res.json(await full(_id).then((doc) => ({ ...doc, purged: purge.deletedCount })));
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const _id = Number(req.params.id);
    // Purga só o que ainda não ocorreu (date > hoje); lançamentos já ocorridos permanecem.
    if (req.query.purge_future !== 'false') {
      await col.transactions().deleteMany({ recurring_id: _id, date: { $gt: todayServer() } });
    }
    await col.recurring().deleteOne({ _id });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
