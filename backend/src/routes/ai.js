import { Router } from 'express';
import db from '../db.js';
import { aiEnabled } from './settings.js';
import { lookupLearning, getLearningExamples } from '../ai/learning.js';
import { classifyBatch } from '../ai/classify.js';
import { phraseInsight, parseQuestion } from '../ai/assistant.js';
import { computeInsightFacts, fallbackInsight, factsHash } from '../lib/insights.js';
import { detectSubscriptions } from '../lib/subscriptions.js';
import { runStructuredQuery } from '../lib/query.js';

const router = Router();
const getSetting = (k) => db.prepare('SELECT value FROM settings WHERE key=?').get(k)?.value ?? null;
const setSetting = (k, v) => db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, v);

// S11 — sugestão para entrada manual (histórico local → Groq sob demanda)
router.post('/suggest', async (req, res, next) => {
  try {
    const { memo, amount } = req.body;
    if (!memo) return res.status(400).json({ error: 'memo é obrigatório' });
    const local = lookupLearning(memo);
    if (local) return res.json({ categoria: local.categoria, person: local.person, source: 'local' });
    if (!aiEnabled('manual')) return res.json({ categoria: null, person: null, source: 'none' });

    const categories = db.prepare('SELECT name FROM categories').all().map((r) => r.name);
    const people = db.prepare('SELECT name FROM people').all().map((r) => r.name);
    const results = await classifyBatch({ categories, people, examples: getLearningExamples(20), items: [{ key: 'x', memo, amount }] });
    const r = results[0] || {};
    res.json({
      categoria: categories.includes(r.categoria) ? r.categoria : null,
      person: people.includes(r.pessoa) ? r.pessoa : null,
      rotulo: r.rotulo || null,
      source: 'ai'
    });
  } catch (err) { next(err); }
});

// S13 — insight do mês (cacheado; força regeneração com ?force=1)
router.get('/insights', async (req, res, next) => {
  try {
    const month = req.query.month;
    if (!month) return res.status(400).json({ error: 'month é obrigatório' });
    const facts = computeInsightFacts(month);
    const hash = factsHash(facts);

    if (!aiEnabled('insights')) return res.json({ text: fallbackInsight(facts), facts, ai: false });

    const cacheKey = `insight_${month}`;
    const cached = getSetting(cacheKey);
    if (cached && !req.query.force) {
      const obj = JSON.parse(cached);
      if (obj.hash === hash) return res.json({ text: obj.text, facts, ai: true, cached: true });
    }
    let text;
    try { text = await phraseInsight(facts); }
    catch { return res.json({ text: fallbackInsight(facts), facts, ai: false }); }
    setSetting(cacheKey, JSON.stringify({ text, hash }));
    res.json({ text, facts, ai: true });
  } catch (err) { next(err); }
});

// S14 — assinaturas/recorrências detectadas (heurística pura)
router.get('/subscriptions', (_req, res) => {
  res.json(detectSubscriptions());
});

// S15 — Pergunte ao OPF (NL → spec → consulta no código)
router.post('/ask', async (req, res, next) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: 'question é obrigatória' });
    if (!aiEnabled('ask')) return res.status(400).json({ error: 'Recurso de IA desligado' });
    const ctx = {
      people: db.prepare('SELECT name FROM people').all().map((r) => r.name),
      categories: db.prepare('SELECT name FROM categories').all().map((r) => r.name),
      sources: db.prepare('SELECT name FROM sources').all().map((r) => r.name),
      month: req.query.month || new Date().toISOString().slice(0, 7)
    };
    const spec = await parseQuestion(question, ctx);
    const result = runStructuredQuery(spec);
    res.json({ question, spec, result });
  } catch (err) { next(err); }
});

export default router;
