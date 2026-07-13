import { col } from '../db.js';

// Escapa metacaracteres de regex para usar um termo livre como "contém" (equivale ao LIKE %x%).
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const like = (v) => ({ $regex: escapeRegex(v), $options: 'i' });

// id -> name para enriquecer resultados (substitui os LEFT JOIN).
async function nameMaps() {
  const [people, categories, sources] = await Promise.all([
    col.people().find({}, { projection: { _id: 1, name: 1 } }).toArray(),
    col.categories().find({}, { projection: { _id: 1, name: 1 } }).toArray(),
    col.sources().find({}, { projection: { _id: 1, name: 1 } }).toArray()
  ]);
  const toMap = (arr) => new Map(arr.map((d) => [d._id, d.name]));
  return { people: toMap(people), categories: toMap(categories), sources: toMap(sources) };
}

function enrich(t, maps) {
  return {
    date: t.date,
    description: t.description,
    amount: t.amount,
    type: t.type,
    person: t.person_id != null ? (maps.people.get(t.person_id) || null) : null,
    category: t.category_id != null ? (maps.categories.get(t.category_id) || null) : null,
    source: t.source_id != null ? (maps.sources.get(t.source_id) || null) : null
  };
}

// Executa uma consulta ESTRUTURADA e segura (S15). A IA só produz o spec; os números saem daqui.
// spec: { operation: 'sum'|'count'|'avg'|'list'|'compare', type, person, category, source, month, months }
export async function runStructuredQuery(rawSpec) {
  // a IA às vezes devolve a string "null" — normaliza para vazio
  const clean = (v) => (v && v !== 'null' && v !== 'undefined' ? v : null);
  const spec = {
    operation: rawSpec.operation,
    type: clean(rawSpec.type),
    person: clean(rawSpec.person),
    category: clean(rawSpec.category),
    source: clean(rawSpec.source),
    month: clean(rawSpec.month),
    months: rawSpec.months
  };
  const filter = {};
  const resolved = {};

  const TYPES = ['expense', 'income', 'payment', 'transfer'];
  if (spec.type && TYPES.includes(spec.type)) { filter.type = spec.type; resolved.type = spec.type; }

  if (spec.person) {
    const p = await col.people().findOne({ name: like(spec.person) }, { projection: { _id: 1, name: 1 } });
    if (p) { filter.person_id = p._id; resolved.person = p.name; }
  }
  if (spec.category) {
    const c = await col.categories().findOne({ name: like(spec.category) }, { projection: { _id: 1, name: 1 } });
    if (c) { filter.category_id = c._id; resolved.category = c.name; }
  }
  if (spec.source) {
    const s = await col.sources().findOne({ name: like(spec.source) }, { projection: { _id: 1, name: 1 } });
    if (s) { filter.source_id = s._id; resolved.source = s.name; }
  }
  if (spec.month && /^\d{4}-\d{2}$/.test(spec.month)) { filter.reference_month = spec.month; resolved.month = spec.month; }

  const op = ['sum', 'count', 'avg', 'list', 'compare'].includes(spec.operation) ? spec.operation : 'sum';

  if (op === 'compare') {
    const n = Math.min(Math.max(Number(spec.months) || 6, 1), 24);
    const rows = (await col.transactions().aggregate([
      { $match: filter },
      { $group: { _id: '$reference_month', total: { $sum: '$amount' } } },
      { $sort: { _id: -1 } },
      { $limit: n }
    ]).toArray()).map((r) => ({ month: r._id, total: r.total })).reverse();
    return { operation: op, resolved, rows };
  }

  const maps = await nameMaps();

  if (op === 'list') {
    const docs = await col.transactions().find(filter).sort({ date: -1 }).limit(50).toArray();
    return { operation: op, resolved, rows: docs.map((t) => enrich(t, maps)) };
  }

  let value = 0;
  if (op === 'count') {
    value = await col.transactions().countDocuments(filter);
  } else {
    const agg = await col.transactions().aggregate([
      { $match: filter },
      { $group: { _id: null, v: op === 'avg' ? { $avg: '$amount' } : { $sum: '$amount' } } }
    ]).toArray();
    value = agg[0]?.v || 0;
  }
  const docs = await col.transactions().find(filter).sort({ date: -1 }).limit(20).toArray();
  return { operation: op, resolved, value: Math.round(value * 100) / 100, rows: docs.map((t) => enrich(t, maps)) };
}
