import { col } from '../db.js';
import { normalizeMemo } from '../ai/learning.js';

// Constrói um mapa id -> name a partir de uma coleção.
async function nameMap(collection) {
  const docs = await collection.find({}, { projection: { _id: 1, name: 1 } }).toArray();
  const m = new Map();
  for (const d of docs) m.set(d._id, d.name);
  return m;
}

// Detecção 100% heurística (S14): mesma origem aparecendo em >=3 meses distintos com valor parecido.
// A IA, quando ligada, só redige o aviso — não entra na detecção.
export async function detectSubscriptions() {
  const [txs, catNames, personNames, sourceNames] = await Promise.all([
    col.transactions().find({ type: 'expense' }).toArray(),
    nameMap(col.categories()),
    nameMap(col.people()),
    nameMap(col.sources())
  ]);

  const groups = new Map();
  for (const t of txs) {
    const key = normalizeMemo(t.memo_original || t.description);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({
      description: t.description,
      amount: t.amount,
      reference_month: t.reference_month,
      category_name: t.category_id != null ? (catNames.get(t.category_id) || null) : null,
      person_name: t.person_id != null ? (personNames.get(t.person_id) || null) : null,
      source_name: t.source_id != null ? (sourceNames.get(t.source_id) || null) : null
    });
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
