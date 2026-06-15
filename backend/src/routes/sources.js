import { Router } from 'express';
import db from '../db.js';
import { cardDebt } from '../lib/balances.js';

const router = Router();
const VALID = ['credit_card', 'checking', 'wallet', 'cash'];

router.get('/', (_req, res) => {
  const sources = db.prepare('SELECT * FROM sources ORDER BY type, name').all();
  for (const s of sources) {
    if (s.type === 'credit_card') s.invoice = cardDebt(s.id);
  }
  res.json(sources);
});

router.post('/', (req, res) => {
  const { name, type, closing_day, due_day } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'name e type são obrigatórios' });
  if (!VALID.includes(type)) return res.status(400).json({ error: 'type inválido' });
  const info = db.prepare('INSERT INTO sources (name, type, closing_day, due_day) VALUES (?, ?, ?, ?)')
    .run(name, type, type === 'credit_card' ? (closing_day || null) : null, type === 'credit_card' ? (due_day || null) : null);
  res.status(201).json(db.prepare('SELECT * FROM sources WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const s = db.prepare('SELECT * FROM sources WHERE id = ?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Fonte não encontrada' });
  const { name, type, closing_day, due_day } = req.body;
  db.prepare('UPDATE sources SET name=?, type=?, closing_day=?, due_day=? WHERE id=?').run(
    name ?? s.name,
    type ?? s.type,
    closing_day === undefined ? s.closing_day : (closing_day || null),
    due_day === undefined ? s.due_day : (due_day || null),
    s.id
  );
  res.json(db.prepare('SELECT * FROM sources WHERE id = ?').get(s.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM sources WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
