import { col } from '../db.js';

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
// _id = memo_normalized dá a semântica do ON CONFLICT(memo_normalized) via upsert.
export async function recordLearning(memo, categoria, personName) {
  const norm = normalizeMemo(memo);
  if (!norm || !categoria) return;
  await col.learning().updateOne(
    { _id: norm },
    {
      $set: { memo_normalized: norm, categoria, person_name: personName || null, last_used_at: new Date().toISOString() },
      $inc: { uses: 1 }
    },
    { upsert: true }
  );
}

// Correspondência exata no histórico local (prioridade sobre a IA).
export async function lookupLearning(memo) {
  const norm = normalizeMemo(memo);
  if (!norm) return null;
  const row = await col.learning().findOne({ _id: norm });
  if (row) {
    await col.learning().updateOne(
      { _id: norm },
      { $inc: { uses: 1 }, $set: { last_used_at: new Date().toISOString() } }
    );
    return { categoria: row.categoria, person: row.person_name };
  }
  return null;
}

// Exemplos mais relevantes para o prompt da Groq.
export async function getLearningExamples(limit = 30) {
  return col.learning()
    .find({}, { projection: { _id: 0, memo_normalized: 1, categoria: 1, person_name: 1 } })
    .sort({ uses: -1, last_used_at: -1 })
    .limit(limit)
    .toArray();
}
