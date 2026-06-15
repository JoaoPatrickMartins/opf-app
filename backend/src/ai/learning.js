import db from '../db.js';

// Normaliza o memo: minúsculas, sem acentos, sem números de parcela, sem caracteres especiais.
export function normalizeMemo(memo) {
  if (!memo) return '';
  return String(memo)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/-?\s*parcela\s*\d+\s*\/\s*\d+/gi, '')
    .replace(/\b\d+\s*\/\s*\d+\b/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Registra (ou reforça) classificação manual: memo -> categoria + pessoa.
export function recordLearning(memo, categoria, personName) {
  const norm = normalizeMemo(memo);
  if (!norm || !categoria) return;
  db.prepare(`
    INSERT INTO classification_history (memo_normalized, categoria, person_name, uses, last_used_at)
    VALUES (?, ?, ?, 1, datetime('now'))
    ON CONFLICT(memo_normalized) DO UPDATE SET
      categoria = excluded.categoria,
      person_name = excluded.person_name,
      uses = uses + 1,
      last_used_at = datetime('now')
  `).run(norm, categoria, personName || null);
}

// Correspondência exata no histórico local (prioridade sobre a IA).
export function lookupLearning(memo) {
  const norm = normalizeMemo(memo);
  if (!norm) return null;
  const row = db.prepare('SELECT categoria, person_name FROM classification_history WHERE memo_normalized = ?').get(norm);
  if (row) {
    db.prepare("UPDATE classification_history SET uses = uses + 1, last_used_at = datetime('now') WHERE memo_normalized = ?").run(norm);
    return { categoria: row.categoria, person: row.person_name };
  }
  return null;
}

// Exemplos mais relevantes para o prompt da Groq.
export function getLearningExamples(limit = 30) {
  return db.prepare(`
    SELECT memo_normalized, categoria, person_name
    FROM classification_history
    ORDER BY uses DESC, last_used_at DESC
    LIMIT ?
  `).all(limit);
}
