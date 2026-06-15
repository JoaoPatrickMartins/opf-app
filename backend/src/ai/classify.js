// Classificação em lote via Groq API (llama-3.3-70b-versatile).
import { getGroqKey } from '../routes/settings.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

function buildPrompt({ categories, people, examples, items }) {
  const catList = categories.join(', ');
  const peopleList = people.length ? people.join(', ') : '(só a Própria)';
  const history = examples.length
    ? examples.map((e) => `- "${e.memo_normalized}" → ${e.categoria}, ${e.person_name || 'Própria'}`).join('\n')
    : '(sem histórico ainda)';

  return `Você é um classificador de gastos financeiros pessoais.

Categorias disponíveis: ${catList}

Pessoas (de quem é o gasto): ${peopleList}

Histórico de classificações anteriores (aprenda com eles):
${history}

Para cada transação, devolva:
- "categoria": exatamente um nome da lista de categorias
- "pessoa": exatamente um nome da lista de pessoas
- "rotulo": uma versão curta e legível do estabelecimento (ex.: "Dl *Uberrides" -> "Uber"; "PAG*MercadoX" -> "Mercado X"). Sem inventar dados.

Responda APENAS com JSON válido no formato:
[{ "key": "...", "categoria": "...", "pessoa": "...", "rotulo": "..." }]

Transações:
${JSON.stringify(items.map((it) => ({ key: it.key, memo: it.memo, valor: it.amount })), null, 2)}`;
}

function extractJson(content) {
  const start = content.indexOf('[');
  const end = content.lastIndexOf(']');
  if (start === -1 || end === -1) return [];
  try { return JSON.parse(content.slice(start, end + 1)); } catch { return []; }
}

// items: { key, memo, amount }. Retorna [{ key, categoria, pessoa }].
export async function classifyBatch({ categories, people, examples, items }) {
  const apiKey = getGroqKey();
  if (!apiKey || !items.length) return [];
  const prompt = buildPrompt({ categories, people, examples, items });

  const resp = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'Você responde somente com JSON válido, sem texto extra.' },
        { role: 'user', content: prompt }
      ]
    })
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw Object.assign(new Error(`Groq API ${resp.status}: ${detail.slice(0, 200)}`), { status: 502 });
  }
  const data = await resp.json();
  const parsed = extractJson(data?.choices?.[0]?.message?.content || '');
  return parsed.map((p) => ({
    key: String(p.key),
    categoria: p.categoria || null,
    pessoa: p.pessoa || null,
    rotulo: p.rotulo || null
  }));
}
