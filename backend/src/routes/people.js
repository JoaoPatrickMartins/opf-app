import { Router } from 'express';
import db from '../db.js';
import { personCashBalance, settlement } from '../lib/balances.js';
import { materializeRecurring } from '../lib/recurring.js';

const router = Router();

// Lista pessoas com saldo de caixa
router.get('/', (_req, res) => {
  const people = db.prepare('SELECT * FROM people ORDER BY is_self DESC, name').all();
  for (const p of people) p.cash_balance = personCashBalance(p.id);
  res.json(people);
});

// "Quem deve a quem"
router.get('/settlement', (_req, res) => {
  res.json(settlement());
});

router.post('/', (req, res) => {
  const { name, is_self, initial_balance, color } = req.body;
  if (!name) return res.status(400).json({ error: 'name é obrigatório' });
  const info = db.prepare('INSERT INTO people (name, is_self, initial_balance, color) VALUES (?, ?, ?, ?)')
    .run(name, is_self ? 1 : 0, Number(initial_balance) || 0, color || null);
  res.status(201).json(db.prepare('SELECT * FROM people WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM people WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Pessoa não encontrada' });
  const { name, is_self, initial_balance, color } = req.body;
  db.prepare('UPDATE people SET name=?, is_self=?, initial_balance=?, color=? WHERE id=?').run(
    name ?? p.name,
    is_self === undefined ? p.is_self : (is_self ? 1 : 0),
    initial_balance === undefined ? p.initial_balance : Number(initial_balance) || 0,
    color === undefined ? p.color : color,
    p.id
  );
  res.json(db.prepare('SELECT * FROM people WHERE id = ?').get(p.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM people WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Extrato/administração do mês da pessoa
router.get('/:id/statement', (req, res) => {
  const person = db.prepare('SELECT * FROM people WHERE id = ?').get(req.params.id);
  if (!person) return res.status(404).json({ error: 'Pessoa não encontrada' });
  const month = req.query.month;
  if (!month) return res.status(400).json({ error: 'month é obrigatório (YYYY-MM)' });
  materializeRecurring(month);

  const own = db.prepare(`
    SELECT t.*, s.name AS source_name, s.type AS source_type, c.name AS category_name,
      cp.name AS counterparty_name
    FROM transactions t
    LEFT JOIN sources s ON s.id = t.source_id
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN people cp ON cp.id = t.counterparty_person_id
    WHERE t.person_id = @id AND t.reference_month = @month
    ORDER BY t.date ASC, t.id ASC
  `).all({ id: person.id, month });

  // transferências recebidas (a pessoa é destino)
  const received = db.prepare(`
    SELECT t.*, src.name AS source_name, p.name AS counterparty_name, 'transfer_in' AS flow
    FROM transactions t
    LEFT JOIN sources src ON src.id = t.source_id
    LEFT JOIN people p ON p.id = t.person_id
    WHERE t.type='transfer' AND t.counterparty_person_id = @id AND t.reference_month = @month
    ORDER BY t.date ASC, t.id ASC
  `).all({ id: person.id, month });

  const expenses = own.filter((t) => t.type === 'expense');
  const incomes = own.filter((t) => t.type === 'income');

  // despesas separadas por cartão/fonte
  const bySourceMap = new Map();
  for (const t of expenses) {
    const key = t.source_id || 'cash';
    if (!bySourceMap.has(key)) {
      bySourceMap.set(key, { source_id: t.source_id || null, source_name: t.source_name || 'Dinheiro', source_type: t.source_type || 'cash', spent: 0, count: 0 });
    }
    const g = bySourceMap.get(key);
    g.spent += t.amount; g.count += 1;
  }
  const bySource = [...bySourceMap.values()].sort((a, b) => b.spent - a.spent);

  // por categoria
  const byCatMap = new Map();
  for (const t of expenses) {
    const key = t.category_name || 'Sem categoria';
    byCatMap.set(key, (byCatMap.get(key) || 0) + t.amount);
  }
  const byCategory = [...byCatMap.entries()].map(([category_name, spent]) => ({ category_name, spent })).sort((a, b) => b.spent - a.spent);

  const totals = {
    gastos: expenses.reduce((s, t) => s + t.amount, 0),
    gastos_cartao: expenses.filter((t) => t.source_type === 'credit_card').reduce((s, t) => s + t.amount, 0),
    gastos_dinheiro: expenses.filter((t) => t.source_type !== 'credit_card').reduce((s, t) => s + t.amount, 0),
    receitas: incomes.reduce((s, t) => s + t.amount, 0),
    pagamentos: own.filter((t) => t.type === 'payment').reduce((s, t) => s + t.amount, 0),
    transferencias_enviadas: own.filter((t) => t.type === 'transfer').reduce((s, t) => s + t.amount, 0),
    transferencias_recebidas: received.reduce((s, t) => s + t.amount, 0)
  };

  res.json({
    person,
    month,
    cash_balance: personCashBalance(person.id),
    totals,
    bySource,
    byCategory,
    transactions: [...own, ...received].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id)),
    expenses,
    incomes
  });
});

export default router;
