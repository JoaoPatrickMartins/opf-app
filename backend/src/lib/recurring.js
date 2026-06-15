import db from '../db.js';
import { daysInMonth } from './invoice.js';

function monthsBetween(start, month) {
  const [y1, m1] = start.split('-').map(Number);
  const [y2, m2] = month.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

// Materializa as recorrências ativas para o mês (idempotente: recurring_id + reference_month).
// total_occurrences != NULL → parcelado: materializa só até a N-ésima ocorrência e marca installment x/N.
export function materializeRecurring(month) {
  if (!month) return;
  const rules = db.prepare(`
    SELECT * FROM recurring_rules
    WHERE active = 1 AND start_month <= ? AND (end_month IS NULL OR end_month >= ?)
  `).all(month, month);

  const exists = db.prepare('SELECT 1 FROM transactions WHERE recurring_id = ? AND reference_month = ?');
  const insert = db.prepare(`
    INSERT INTO transactions
      (recurring_id, person_id, source_id, category_id, type, reference_month, date, description, memo_original, amount, installment, source, confirmed)
    VALUES (@recurring_id, @person_id, @source_id, @category_id, @type, @reference_month, @date, @description, @description, @amount, @installment, 'recurring', 1)
  `);

  db.transaction(() => {
    for (const r of rules) {
      const idx = monthsBetween(r.start_month, month) + 1; // 1-based
      if (idx < 1) continue;
      if (r.total_occurrences && idx > r.total_occurrences) continue; // já completou as parcelas
      if (exists.get(r.id, month)) continue;
      const day = Math.min(r.day_of_month || 1, daysInMonth(month));
      insert.run({
        recurring_id: r.id,
        person_id: r.person_id || null,
        source_id: r.source_id || null,
        category_id: r.category_id || null,
        type: r.type,
        reference_month: month,
        date: `${month}-${String(day).padStart(2, '0')}`,
        description: r.description,
        amount: Math.abs(r.amount),
        installment: r.total_occurrences ? `${idx}/${r.total_occurrences}` : null
      });
    }
  })();
}
