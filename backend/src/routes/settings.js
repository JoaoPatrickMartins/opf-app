import { Router } from 'express';
import { col } from '../db.js';

const router = Router();

const get = async (key) => (await col.settings().findOne({ _id: key }))?.value ?? null;
const set = (key, value) =>
  col.settings().updateOne({ _id: key }, { $set: { value } }, { upsert: true });

export async function getGroqKey() {
  return (await get('groq_api_key')) || process.env.GROQ_API_KEY || null;
}

// Recursos de IA (D6: interruptor por recurso). Padrão: ligado se houver chave.
export const AI_FEATURES = ['import', 'manual', 'insights', 'subscriptions', 'ask'];
export async function aiEnabled(feature) {
  if (!(await getGroqKey())) return false;
  const v = await get(`ai_${feature}`);
  return v === null ? true : v === '1';
}

router.get('/', async (_req, res, next) => {
  try {
    const toggles = {};
    for (const f of AI_FEATURES) toggles[f] = await aiEnabled(f);
    const appKey = await get('groq_api_key');
    const savings = await get('savings_goal');
    res.json({
      groq_configured: !!(await getGroqKey()),
      groq_source: appKey ? 'app' : (process.env.GROQ_API_KEY ? 'env' : 'none'),
      savings_goal: savings ? Number(savings) : null,
      ai: toggles
    });
  } catch (err) { next(err); }
});

router.put('/', async (req, res, next) => {
  try {
    const { groq_api_key, savings_goal, ai } = req.body;
    if (groq_api_key !== undefined) await set('groq_api_key', groq_api_key || '');
    if (savings_goal !== undefined) await set('savings_goal', savings_goal == null ? '' : String(savings_goal));
    if (ai && typeof ai === 'object') {
      for (const f of AI_FEATURES) {
        if (ai[f] !== undefined) await set(`ai_${f}`, ai[f] ? '1' : '0');
      }
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
