import { Router } from 'express';
import db from '../db.js';

const router = Router();

// Backup completo em JSON
router.get('/json', (_req, res) => {
  const dump = {
    exported_at: new Date().toISOString(),
    people: db.prepare('SELECT * FROM people').all(),
    sources: db.prepare('SELECT * FROM sources').all(),
    categories: db.prepare('SELECT * FROM categories').all(),
    transactions: db.prepare('SELECT * FROM transactions').all(),
    recurring_rules: db.prepare('SELECT * FROM recurring_rules').all()
  };
  res.setHeader('Content-Disposition', 'attachment; filename="opf-backup.json"');
  res.json(dump);
});

// Lançamentos em CSV
router.get('/csv', (_req, res) => {
  const rows = db.prepare(`
    SELECT t.date, t.reference_month, t.type, t.amount, t.description,
      p.name AS pessoa, s.name AS fonte, c.name AS categoria, cp.name AS destino, t.installment
    FROM transactions t
    LEFT JOIN people p ON p.id = t.person_id
    LEFT JOIN sources s ON s.id = t.source_id
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN people cp ON cp.id = t.counterparty_person_id
    ORDER BY t.date
  `).all();
  const headers = ['date', 'reference_month', 'type', 'amount', 'description', 'pessoa', 'fonte', 'categoria', 'destino', 'installment'];
  const esc = (v) => v == null ? '' : `"${String(v).replace(/"/g, '""')}"`;
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="opf-lancamentos.csv"');
  res.send(csv);
});

export default router;
