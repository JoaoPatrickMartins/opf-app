import { Router } from 'express';
import db from '../db.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json(db.prepare('SELECT * FROM categories ORDER BY name').all());
});

router.post('/', (req, res) => {
  const { name, budget_limit } = req.body;
  if (!name) return res.status(400).json({ error: 'name é obrigatório' });
  try {
    const info = db.prepare('INSERT INTO categories (name, budget_limit) VALUES (?, ?)')
      .run(name, budget_limit ?? null);
    res.status(201).json(db.prepare('SELECT * FROM categories WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    if (String(e).includes('UNIQUE')) return res.status(409).json({ error: 'Categoria já existe' });
    throw e;
  }
});

router.put('/:id', (req, res) => {
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!cat) return res.status(404).json({ error: 'Categoria não encontrada' });
  const { name, budget_limit } = req.body;
  db.prepare('UPDATE categories SET name = ?, budget_limit = ? WHERE id = ?')
    .run(name ?? cat.name, budget_limit === undefined ? cat.budget_limit : budget_limit, req.params.id);
  res.json(db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
