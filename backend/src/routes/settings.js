import { Router } from 'express';
import db from '../db.js';

const router = Router();

const get = (key) => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? null;
const set = (key, value) =>
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value);

export function getGroqKey() {
  return get('groq_api_key') || process.env.GROQ_API_KEY || null;
}

// Recursos de IA (D6: interruptor por recurso). Padrão: ligado se houver chave.
export const AI_FEATURES = ['import', 'manual', 'insights', 'subscriptions', 'ask'];
export function aiEnabled(feature) {
  if (!getGroqKey()) return false;
  const v = get(`ai_${feature}`);
  return v === null ? true : v === '1';
}

router.get('/', (_req, res) => {
  const toggles = {};
  for (const f of AI_FEATURES) toggles[f] = aiEnabled(f);
  res.json({
    groq_configured: !!getGroqKey(),
    groq_source: get('groq_api_key') ? 'app' : (process.env.GROQ_API_KEY ? 'env' : 'none'),
    savings_goal: get('savings_goal') ? Number(get('savings_goal')) : null,
    ai: toggles
  });
});

router.put('/', (req, res) => {
  const { groq_api_key, savings_goal, ai } = req.body;
  if (groq_api_key !== undefined) set('groq_api_key', groq_api_key || '');
  if (savings_goal !== undefined) set('savings_goal', savings_goal == null ? '' : String(savings_goal));
  if (ai && typeof ai === 'object') {
    for (const f of AI_FEATURES) {
      if (ai[f] !== undefined) set(`ai_${f}`, ai[f] ? '1' : '0');
    }
  }
  res.json({ ok: true });
});

export default router;
