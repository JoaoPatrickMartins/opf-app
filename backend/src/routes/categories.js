import { Router } from 'express';
import { col, nextId, serialize, serializeAll } from '../db.js';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const rows = await col.categories().find({}).sort({ name: 1 }).toArray();
    res.json(serializeAll(rows));
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, budget_limit } = req.body;
    if (!name) return res.status(400).json({ error: 'name é obrigatório' });
    const _id = await nextId('categories');
    try {
      await col.categories().insertOne({ _id, name, budget_limit: budget_limit ?? null });
    } catch (e) {
      if (e.code === 11000) return res.status(409).json({ error: 'Categoria já existe' });
      throw e;
    }
    res.status(201).json(serialize(await col.categories().findOne({ _id })));
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const _id = Number(req.params.id);
    const cat = await col.categories().findOne({ _id });
    if (!cat) return res.status(404).json({ error: 'Categoria não encontrada' });
    const { name, budget_limit } = req.body;
    await col.categories().updateOne({ _id }, {
      $set: {
        name: name ?? cat.name,
        budget_limit: budget_limit === undefined ? cat.budget_limit : budget_limit
      }
    });
    res.json(serialize(await col.categories().findOne({ _id })));
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const _id = Number(req.params.id);
    // ON DELETE SET NULL (transactions.category_id, recurring_rules.category_id)
    await col.transactions().updateMany({ category_id: _id }, { $set: { category_id: null } });
    await col.recurring().updateMany({ category_id: _id }, { $set: { category_id: null } });
    await col.categories().deleteOne({ _id });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
