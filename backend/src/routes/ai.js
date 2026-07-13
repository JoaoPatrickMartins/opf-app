import { Router } from 'express';
import { col } from '../db.js';
import { aiEnabled } from './settings.js';
import { lookupLearning, getLearningExamples } from '../ai/learning.js';
import { classifyBatch } from '../ai/classify.js';
import { phraseInsight, parseQuestion } from '../ai/assistant.js';
import { computeInsightFacts, fallbackInsight, factsHash } from '../lib/insights.js';
import { detectSubscriptions } from '../lib/subscriptions.js';
import { runStructuredQuery } from '../lib/query.js';

const router = Router();
const getSetting = async (k) => (await col.settings().findOne({ _id: k }))?.value ?? null;
const setSetting = (k, v) => col.settings().updateOne({ _id: k }, { $set: { value: v } }, { upsert: true });

// S11 — sugestão para entrada manual (histórico local → Groq sob demanda)
router.post('/suggest', async (req, res, next) => {
  try {
    const { memo, amount } = req.body;
    if (!memo) return res.status(400).json({ error: 'memo é obrigatório' });
    const local = await lookupLearning(memo);
    if (local) return res.json({ categoria: local.categoria, person: local.person, source: 'local' });
    if (!(await aiEnabled('manual'))) return res.json({ categoria: null, person: null, source: 'none' });

    const categories = (await col.categories().find({}, { projection: { name: 1, _id: 0 } }).toArray()).map((r) => r.name);
    const people = (await col.people().find({}, { projection: { name: 1, _id: 0 } }).toArray()).map((r) => r.name);
    const results = await classifyBatch({ categories, people, examples: await getLearningExamples(20), items: [{ key: 'x', memo, amount }] });
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
    const facts = await computeInsightFacts(month);
    const hash = factsHash(facts);

    if (!(await aiEnabled('insights'))) return res.json({ text: fallbackInsight(facts), facts, ai: false });

    const cacheKey = `insight_${month}`;
    const cached = await getSetting(cacheKey);
    if (cached && !req.query.force) {
      const obj = JSON.parse(cached);
      if (obj.hash === hash) return res.json({ text: obj.text, facts, ai: true, cached: true });
    }
    let text;
    try { text = await phraseInsight(facts); }
    catch { return res.json({ text: fallbackInsight(facts), facts, ai: false }); }
    await setSetting(cacheKey, JSON.stringify({ text, hash }));
    res.json({ text, facts, ai: true });
  } catch (err) { next(err); }
});

// S14 — assinaturas/recorrências detectadas (heurística pura)
router.get('/subscriptions', async (_req, res, next) => {
  try {
    res.json(await detectSubscriptions());
  } catch (err) { next(err); }
});

// S15 — Pergunte ao OPF (NL → spec → consulta no código)
router.post('/ask', async (req, res, next) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: 'question é obrigatória' });
    if (!(await aiEnabled('ask'))) return res.status(400).json({ error: 'Recurso de IA desligado' });
    const ctx = {
      people: (await col.people().find({}, { projection: { name: 1, _id: 0 } }).toArray()).map((r) => r.name),
      categories: (await col.categories().find({}, { projection: { name: 1, _id: 0 } }).toArray()).map((r) => r.name),
      sources: (await col.sources().find({}, { projection: { name: 1, _id: 0 } }).toArray()).map((r) => r.name),
      month: req.query.month || new Date().toISOString().slice(0, 7)
    };
    const spec = await parseQuestion(question, ctx);
    const result = await runStructuredQuery(spec);
    res.json({ question, spec, result });
  } catch (err) { next(err); }
});

export default router;
