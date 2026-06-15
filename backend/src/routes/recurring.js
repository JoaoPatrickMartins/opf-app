import { Router } from 'express';
import db from '../db.js';
import { materializeRecurring } from '../lib/recurring.js';
import { currentMonthServer } from '../lib/time.js';

const router = Router();

function full(id) {
  return db.prepare(`
    SELECT r.*, p.name AS person_name, s.name AS source_name, c.name AS category_name
    FROM recurring_rules r
    LEFT JOIN people p ON p.id = r.person_id
    LEFT JOIN sources s ON s.id = r.source_id
    LEFT JOIN categories c ON c.id = r.category_id
    WHERE r.id = ?
  `).get(id);
}

router.get('/', (_req, res) => {
  res.json(db.prepare(`
    SELECT r.*, p.name AS person_name, s.name AS source_name, c.name AS category_name
    FROM recurring_rules r
    LEFT JOIN people p ON p.id = r.person_id
    LEFT JOIN sources s ON s.id = r.source_id
    LEFT JOIN categories c ON c.id = r.category_id
    ORDER BY r.type, r.description
  `).all());
});

router.post('/', (req, res) => {
  const b = req.body;
  if (b.amount == null || !b.description) return res.status(400).json({ error: 'amount e description são obrigatórios' });
  if (!b.person_id) return res.status(400).json({ error: 'person_id é obrigatório' });
  const type = b.type === 'expense' ? 'expense' : 'income';
  const start_month = b.start_month || currentMonthServer();
  const info = db.prepare(`
    INSERT INTO recurring_rules
      (type, person_id, source_id, category_id, description, amount, day_of_month, start_month, end_month, total_occurrences, active)
    VALUES (@type, @person_id, @source_id, @category_id, @description, @amount, @day_of_month, @start_month, @end_month, @total_occurrences, 1)
  `).run({
    type,
    person_id: b.person_id,
    source_id: b.source_id || null,
    category_id: b.category_id || null,
    description: b.description,
    amount: Math.abs(Number(b.amount)),
    day_of_month: Number(b.day_of_month) || 1,
    start_month,
    end_month: b.end_month || null,
    total_occurrences: b.total_occurrences ? Number(b.total_occurrences) : null
  });
  // materializa o mês inicial e o mês atual
  materializeRecurring(start_month);
  materializeRecurring(currentMonthServer());
  res.status(201).json(full(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const r = db.prepare('SELECT * FROM recurring_rules WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Recorrência não encontrada' });
  const b = req.body;
  db.prepare(`
    UPDATE recurring_rules SET
      type=@type, person_id=@person_id, source_id=@source_id, category_id=@category_id,
      description=@description, amount=@amount, day_of_month=@day_of_month,
      start_month=@start_month, end_month=@end_month, total_occurrences=@total_occurrences, active=@active
    WHERE id=@id
  `).run({
    id: r.id,
    type: b.type || r.type,
    person_id: b.person_id || r.person_id,
    source_id: b.source_id === undefined ? r.source_id : (b.source_id || null),
    category_id: b.category_id === undefined ? r.category_id : (b.category_id || null),
    description: b.description ?? r.description,
    amount: b.amount != null ? Math.abs(Number(b.amount)) : r.amount,
    day_of_month: b.day_of_month != null ? Number(b.day_of_month) : r.day_of_month,
    start_month: b.start_month || r.start_month,
    end_month: b.end_month === undefined ? r.end_month : (b.end_month || null),
    total_occurrences: b.total_occurrences === undefined ? r.total_occurrences : (b.total_occurrences ? Number(b.total_occurrences) : null),
    active: b.active != null ? (b.active ? 1 : 0) : r.active
  });
  res.json(full(r.id));
});

router.delete('/:id', (req, res) => {
  const fromMonth = req.query.from || currentMonthServer();
  if (req.query.purge_future !== 'false') {
    db.prepare('DELETE FROM transactions WHERE recurring_id = ? AND reference_month >= ?').run(req.params.id, fromMonth);
  }
  db.prepare('DELETE FROM recurring_rules WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
