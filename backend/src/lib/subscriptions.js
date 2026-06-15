import db from '../db.js';
import { normalizeMemo } from '../ai/learning.js';

// Detecção 100% heurística (S14): mesma origem aparecendo em >=3 meses distintos com valor parecido.
// A IA, quando ligada, só redige o aviso — não entra na detecção.
export function detectSubscriptions() {
  const rows = db.prepare(`
    SELECT t.description, t.memo_original, t.amount, t.reference_month,
      c.name AS category_name, p.name AS person_name, s.name AS source_name
    FROM transactions t
    LEFT JOIN categories c ON c.id=t.category_id
    LEFT JOIN people p ON p.id=t.person_id
    LEFT JOIN sources s ON s.id=t.source_id
    WHERE t.type='expense'
  `).all();

  const groups = new Map();
  for (const r of rows) {
    const key = normalizeMemo(r.memo_original || r.description);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const subs = [];
  for (const [, list] of groups) {
    const months = new Set(list.map((r) => r.reference_month));
    if (months.size < 3) continue;
    const amounts = list.map((r) => r.amount);
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    // valores próximos: desvio máximo <= 25% da média
    const within = amounts.every((a) => Math.abs(a - avg) <= avg * 0.25 + 0.01);
    if (!within) continue;
    const last = list.reduce((m, r) => (r.reference_month > m ? r.reference_month : m), '');
    const sample = list[0];
    subs.push({
      description: sample.description,
      avg_amount: Math.round(avg * 100) / 100,
      months_count: months.size,
      last_month: last,
      category_name: sample.category_name,
      person_name: sample.person_name,
      source_name: sample.source_name
    });
  }
  return subs.sort((a, b) => b.months_count - a.months_count || b.avg_amount - a.avg_amount);
}
