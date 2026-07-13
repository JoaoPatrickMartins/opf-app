import { Router } from 'express';
import { col, serializeAll } from '../db.js';

const router = Router();

// Backup completo em JSON
router.get('/json', async (_req, res, next) => {
  try {
    const [people, sources, categories, transactions, recurring_rules] = await Promise.all([
      col.people().find({}).toArray(),
      col.sources().find({}).toArray(),
      col.categories().find({}).toArray(),
      col.transactions().find({}).toArray(),
      col.recurring().find({}).toArray()
    ]);
    const dump = {
      exported_at: new Date().toISOString(),
      people: serializeAll(people),
      sources: serializeAll(sources),
      categories: serializeAll(categories),
      transactions: serializeAll(transactions),
      recurring_rules: serializeAll(recurring_rules)
    };
    res.setHeader('Content-Disposition', 'attachment; filename="opf-backup.json"');
    res.json(dump);
  } catch (err) { next(err); }
});

// Lançamentos em CSV
router.get('/csv', async (_req, res, next) => {
  try {
    const [txs, people, sources, categories] = await Promise.all([
      col.transactions().find({}).sort({ date: 1 }).toArray(),
      col.people().find({}, { projection: { _id: 1, name: 1 } }).toArray(),
      col.sources().find({}, { projection: { _id: 1, name: 1 } }).toArray(),
      col.categories().find({}, { projection: { _id: 1, name: 1 } }).toArray()
    ]);
    const peo = new Map(people.map((p) => [p._id, p.name]));
    const src = new Map(sources.map((s) => [s._id, s.name]));
    const cat = new Map(categories.map((c) => [c._id, c.name]));
    const rows = txs.map((t) => ({
      date: t.date,
      reference_month: t.reference_month,
      type: t.type,
      amount: t.amount,
      description: t.description,
      pessoa: t.person_id != null ? (peo.get(t.person_id) || null) : null,
      fonte: t.source_id != null ? (src.get(t.source_id) || null) : null,
      categoria: t.category_id != null ? (cat.get(t.category_id) || null) : null,
      destino: t.counterparty_person_id != null ? (peo.get(t.counterparty_person_id) || null) : null,
      installment: t.installment
    }));
    const headers = ['date', 'reference_month', 'type', 'amount', 'description', 'pessoa', 'fonte', 'categoria', 'destino', 'installment'];
    const esc = (v) => v == null ? '' : `"${String(v).replace(/"/g, '""')}"`;
    const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="opf-lancamentos.csv"');
    res.send(csv);
  } catch (err) { next(err); }
});

export default router;
