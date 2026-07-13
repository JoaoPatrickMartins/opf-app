import { Router } from 'express';
import { col, nextId, serialize, serializeAll } from '../db.js';
import { cardDebt } from '../lib/balances.js';

const router = Router();
const VALID = ['credit_card', 'checking', 'wallet', 'cash'];

router.get('/', async (_req, res, next) => {
  try {
    const rows = serializeAll(await col.sources().find({}).sort({ type: 1, name: 1 }).toArray());
    for (const s of rows) {
      if (s.type === 'credit_card') s.invoice = await cardDebt(s.id);
    }
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, type, closing_day, due_day } = req.body;
    if (!name || !type) return res.status(400).json({ error: 'name e type são obrigatórios' });
    if (!VALID.includes(type)) return res.status(400).json({ error: 'type inválido' });
    const _id = await nextId('sources');
    await col.sources().insertOne({
      _id,
      name,
      type,
      closing_day: type === 'credit_card' ? (closing_day || null) : null,
      due_day: type === 'credit_card' ? (due_day || null) : null,
      created_at: new Date().toISOString()
    });
    res.status(201).json(serialize(await col.sources().findOne({ _id })));
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const _id = Number(req.params.id);
    const s = await col.sources().findOne({ _id });
    if (!s) return res.status(404).json({ error: 'Fonte não encontrada' });
    const { name, type, closing_day, due_day } = req.body;
    await col.sources().updateOne({ _id }, {
      $set: {
        name: name ?? s.name,
        type: type ?? s.type,
        closing_day: closing_day === undefined ? s.closing_day : (closing_day || null),
        due_day: due_day === undefined ? s.due_day : (due_day || null)
      }
    });
    res.json(serialize(await col.sources().findOne({ _id })));
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const _id = Number(req.params.id);
    // ON DELETE SET NULL (transactions.source_id, recurring_rules.source_id)
    await col.transactions().updateMany({ source_id: _id }, { $set: { source_id: null } });
    await col.recurring().updateMany({ source_id: _id }, { $set: { source_id: null } });
    await col.sources().deleteOne({ _id });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
