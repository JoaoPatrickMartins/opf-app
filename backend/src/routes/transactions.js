import { Router } from 'express';
import db from '../db.js';
import { recordLearning } from '../ai/learning.js';
import { invoiceMonth } from '../lib/invoice.js';
import { materializeRecurring } from '../lib/recurring.js';

const router = Router();

function getFull(id) {
  return db.prepare(`
    SELECT t.*, p.name AS person_name, s.name AS source_name, s.type AS source_type,
      c.name AS category_name, cp.name AS counterparty_name
    FROM transactions t
    LEFT JOIN people p ON p.id = t.person_id
    LEFT JOIN sources s ON s.id = t.source_id
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN people cp ON cp.id = t.counterparty_person_id
    WHERE t.id = ?
  `).get(id);
}

function registerLearningFromTx(id) {
  const f = getFull(id);
  if (f && f.type === 'expense' && f.category_name) {
    recordLearning(f.memo_original || f.description, f.category_name, f.person_name || null);
  }
}

// Resolve o mês de referência (cartão de crédito usa o dia de fechamento para despesas).
function resolveReferenceMonth({ reference_month, type, source_id, date }) {
  if (reference_month) return reference_month;
  if (type === 'expense' && source_id) {
    const s = db.prepare('SELECT type, closing_day FROM sources WHERE id = ?').get(source_id);
    if (s && s.type === 'credit_card' && s.closing_day) return invoiceMonth(date, s.closing_day);
  }
  return date ? date.slice(0, 7) : null;
}

// GET /api/transactions?month=&person_id=&source_id=&category_id=&type=
router.get('/', (req, res) => {
  const { month, person_id, source_id, category_id, type } = req.query;
  if (month) materializeRecurring(month);
  const where = [];
  const params = {};
  if (month) { where.push('t.reference_month = @month'); params.month = month; }
  if (person_id) { where.push('t.person_id = @person_id'); params.person_id = Number(person_id); }
  if (source_id === 'cash') { where.push('t.source_id IS NULL'); }
  else if (source_id) { where.push('t.source_id = @source_id'); params.source_id = Number(source_id); }
  if (category_id) { where.push('t.category_id = @category_id'); params.category_id = Number(category_id); }
  if (type) { where.push('t.type = @type'); params.type = type; }

  res.json(db.prepare(`
    SELECT t.*, p.name AS person_name, s.name AS source_name, s.type AS source_type,
      c.name AS category_name, cp.name AS counterparty_name
    FROM transactions t
    LEFT JOIN people p ON p.id = t.person_id
    LEFT JOIN sources s ON s.id = t.source_id
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN people cp ON cp.id = t.counterparty_person_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY t.date DESC, t.id DESC
  `).all(params));
});

// Resumo consolidado do mês (Dashboard) — gastos = consciência (inclui cartão não pago)
router.get('/summary', (req, res) => {
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: 'month é obrigatório (YYYY-MM)' });
  materializeRecurring(month);

  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN t.type='expense' THEN t.amount ELSE 0 END),0) AS gastos,
      COALESCE(SUM(CASE WHEN t.type='expense' AND s.type='credit_card' THEN t.amount ELSE 0 END),0) AS gastos_cartao,
      COALESCE(SUM(CASE WHEN t.type='income' THEN t.amount ELSE 0 END),0) AS receitas,
      COALESCE(SUM(CASE WHEN t.type='payment' THEN t.amount ELSE 0 END),0) AS pagamentos
    FROM transactions t LEFT JOIN sources s ON s.id = t.source_id
    WHERE t.reference_month = @month
  `).get({ month });

  const byCategory = db.prepare(`
    SELECT c.id AS category_id, c.name AS category_name, c.budget_limit,
      COALESCE(SUM(CASE WHEN t.type='expense' THEN t.amount ELSE 0 END),0) AS spent
    FROM categories c
    LEFT JOIN transactions t ON t.category_id = c.id AND t.reference_month = @month
    GROUP BY c.id HAVING spent > 0 OR c.budget_limit IS NOT NULL
    ORDER BY spent DESC
  `).all({ month });

  const byPerson = db.prepare(`
    SELECT p.id AS person_id, p.name,
      COALESCE(SUM(CASE WHEN t.type='expense' THEN t.amount ELSE 0 END),0) AS gastos,
      COALESCE(SUM(CASE WHEN t.type='income' THEN t.amount ELSE 0 END),0) AS receitas
    FROM people p
    LEFT JOIN transactions t ON t.person_id = p.id AND t.reference_month = @month
    GROUP BY p.id ORDER BY gastos DESC
  `).all({ month });

  const bySource = db.prepare(`
    SELECT COALESCE(s.name,'Dinheiro') AS name, s.type,
      COALESCE(SUM(CASE WHEN t.type='expense' THEN t.amount ELSE 0 END),0) AS spent
    FROM transactions t LEFT JOIN sources s ON s.id = t.source_id
    WHERE t.reference_month = @month AND t.type='expense'
    GROUP BY t.source_id ORDER BY spent DESC
  `).all({ month });

  res.json({ month, totals, byCategory, byPerson, bySource });
});

router.get('/compare', (req, res) => {
  const limit = Number(req.query.months) || 6;
  const now = new Date();
  for (let i = 0; i < limit; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    materializeRecurring(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const rows = db.prepare(`
    SELECT reference_month AS month,
      COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS gastos,
      COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) AS receitas
    FROM transactions GROUP BY reference_month ORDER BY reference_month DESC LIMIT ?
  `).all(limit);
  res.json(rows.reverse());
});

router.get('/months', (_req, res) => {
  res.json(db.prepare('SELECT DISTINCT reference_month AS m FROM transactions ORDER BY reference_month DESC').all().map((r) => r.m));
});

router.post('/', (req, res) => {
  const b = req.body;
  if (b.amount == null || !b.date || !b.type) return res.status(400).json({ error: 'amount, date e type são obrigatórios' });
  if (!b.person_id) return res.status(400).json({ error: 'person_id é obrigatório (lançamento pertence a uma pessoa)' });
  const reference_month = resolveReferenceMonth(b);
  const info = db.prepare(`
    INSERT INTO transactions
      (person_id, source_id, category_id, counterparty_person_id, type, reference_month, date, description, memo_original, amount, installment, source, confirmed)
    VALUES (@person_id, @source_id, @category_id, @counterparty_person_id, @type, @reference_month, @date, @description, @memo_original, @amount, @installment, @source, 1)
  `).run({
    person_id: b.person_id,
    source_id: b.source_id || null,
    category_id: (b.type === 'expense' || b.type === 'income') ? (b.category_id || null) : null,
    counterparty_person_id: b.type === 'transfer' ? (b.counterparty_person_id || null) : null,
    type: b.type,
    reference_month,
    date: b.date,
    description: b.description || '',
    memo_original: b.memo_original || b.description || '',
    amount: Math.abs(Number(b.amount)),
    installment: b.installment || null,
    source: b.source || 'manual'
  });
  registerLearningFromTx(info.lastInsertRowid);
  res.status(201).json(getFull(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
  if (!tx) return res.status(404).json({ error: 'Lançamento não encontrado' });
  const b = req.body;
  const type = b.type || tx.type;
  const date = b.date || tx.date;
  const source_id = b.source_id === undefined ? tx.source_id : (b.source_id || null);
  const reference_month = b.reference_month
    || resolveReferenceMonth({ type, source_id, date })
    || tx.reference_month;

  db.prepare(`
    UPDATE transactions SET
      person_id=@person_id, source_id=@source_id, category_id=@category_id,
      counterparty_person_id=@counterparty_person_id, type=@type, reference_month=@reference_month,
      date=@date, description=@description, amount=@amount, installment=@installment
    WHERE id=@id
  `).run({
    id: tx.id,
    person_id: b.person_id || tx.person_id,
    source_id,
    category_id: b.category_id === undefined ? tx.category_id : (b.category_id || null),
    counterparty_person_id: type === 'transfer'
      ? (b.counterparty_person_id === undefined ? tx.counterparty_person_id : (b.counterparty_person_id || null))
      : null,
    type,
    reference_month,
    date,
    description: b.description ?? tx.description,
    amount: b.amount != null ? Math.abs(Number(b.amount)) : tx.amount,
    installment: b.installment === undefined ? tx.installment : (b.installment || null)
  });
  registerLearningFromTx(tx.id);
  res.json(getFull(tx.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
