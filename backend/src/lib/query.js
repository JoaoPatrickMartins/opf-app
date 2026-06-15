import db from '../db.js';

// Executa uma consulta ESTRUTURADA e segura (S15). A IA só produz o spec; os números saem daqui.
// spec: { operation: 'sum'|'count'|'avg'|'list'|'compare', type, person, category, source, month, months }
export function runStructuredQuery(rawSpec) {
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
  const where = [];
  const params = {};
  const resolved = {};

  const TYPES = ['expense', 'income', 'payment', 'transfer'];
  if (spec.type && TYPES.includes(spec.type)) { where.push('t.type=@type'); params.type = spec.type; resolved.type = spec.type; }

  if (spec.person) {
    const p = db.prepare('SELECT id,name FROM people WHERE name LIKE ?').get(`%${spec.person}%`);
    if (p) { where.push('t.person_id=@person_id'); params.person_id = p.id; resolved.person = p.name; }
  }
  if (spec.category) {
    const c = db.prepare('SELECT id,name FROM categories WHERE name LIKE ?').get(`%${spec.category}%`);
    if (c) { where.push('t.category_id=@category_id'); params.category_id = c.id; resolved.category = c.name; }
  }
  if (spec.source) {
    const s = db.prepare('SELECT id,name FROM sources WHERE name LIKE ?').get(`%${spec.source}%`);
    if (s) { where.push('t.source_id=@source_id'); params.source_id = s.id; resolved.source = s.name; }
  }
  if (spec.month && /^\d{4}-\d{2}$/.test(spec.month)) { where.push('t.reference_month=@month'); params.month = spec.month; resolved.month = spec.month; }

  const W = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const op = ['sum', 'count', 'avg', 'list', 'compare'].includes(spec.operation) ? spec.operation : 'sum';

  if (op === 'compare') {
    const n = Math.min(Math.max(Number(spec.months) || 6, 1), 24);
    const rows = db.prepare(`
      SELECT reference_month AS month, COALESCE(SUM(amount),0) AS total
      FROM transactions t ${W} GROUP BY reference_month ORDER BY reference_month DESC LIMIT ${n}
    `).all(params).reverse();
    return { operation: op, resolved, rows };
  }

  if (op === 'list') {
    const rows = db.prepare(`
      SELECT t.date, t.description, t.amount, t.type,
        p.name AS person, c.name AS category, s.name AS source
      FROM transactions t
      LEFT JOIN people p ON p.id=t.person_id
      LEFT JOIN categories c ON c.id=t.category_id
      LEFT JOIN sources s ON s.id=t.source_id
      ${W} ORDER BY t.date DESC LIMIT 50
    `).all(params);
    return { operation: op, resolved, rows };
  }

  const agg = op === 'count' ? 'COUNT(*)' : op === 'avg' ? 'AVG(amount)' : 'SUM(amount)';
  const value = db.prepare(`SELECT COALESCE(${agg},0) AS v FROM transactions t ${W}`).get(params).v;
  const sample = db.prepare(`
    SELECT t.date, t.description, t.amount, p.name AS person, c.name AS category, s.name AS source
    FROM transactions t
    LEFT JOIN people p ON p.id=t.person_id
    LEFT JOIN categories c ON c.id=t.category_id
    LEFT JOIN sources s ON s.id=t.source_id
    ${W} ORDER BY t.date DESC LIMIT 20
  `).all(params);
  return { operation: op, resolved, value: Math.round(value * 100) / 100, rows: sample };
}
