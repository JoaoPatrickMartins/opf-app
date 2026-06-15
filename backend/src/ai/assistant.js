// Chamadas à Groq para texto/intenção. Números nunca vêm da IA — só linguagem e spec.
import { getGroqKey } from '../routes/settings.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

async function groqChat(messages, { temperature = 0.3 } = {}) {
  const apiKey = getGroqKey();
  if (!apiKey) throw Object.assign(new Error('Groq não configurada'), { status: 400 });
  const resp = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL, temperature, messages })
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw Object.assign(new Error(`Groq API ${resp.status}: ${detail.slice(0, 200)}`), { status: 502 });
  }
  const data = await resp.json();
  return data?.choices?.[0]?.message?.content || '';
}

// S13 — redige 1–2 frases no tom Fluxo a partir de fatos JÁ calculados.
export async function phraseInsight(facts) {
  const content = await groqChat([
    { role: 'system', content: 'Você é o OPF, um app de consciência financeira. Tom calmo, factual, sem julgar, sem emojis, sem alarme. Responda em PT-BR com no máximo 2 frases curtas. Use apenas os números fornecidos; nunca invente valores. Refira-se ao período como "este mês" (não escreva datas no formato YYYY-MM). Formate valores como R$.' },
    { role: 'user', content: `Fatos (não altere os números):\n${JSON.stringify(facts)}\n\nEscreva o insight.` }
  ], { temperature: 0.5 });
  return content.trim();
}

// S15 — traduz a pergunta em um spec estruturado (não responde com números).
export async function parseQuestion(question, ctx) {
  const content = await groqChat([
    { role: 'system', content: 'Converta a pergunta financeira em JSON com este formato exato, sem texto extra: {"operation":"sum|count|avg|list|compare","type":"expense|income|payment|transfer|null","person":"<nome ou null>","category":"<nome ou null>","source":"<nome ou null>","month":"YYYY-MM ou null","months":<int ou null>}. Use somente nomes das listas dadas. Para "quanto gastei" use operation=sum e type=expense.' },
    { role: 'user', content: `Pessoas: ${ctx.people.join(', ')}\nCategorias: ${ctx.categories.join(', ')}\nFontes: ${ctx.sources.join(', ')}\nMês atual: ${ctx.month}\n\nPergunta: ${question}` }
  ], { temperature: 0 });
  const s = content.indexOf('{');
  const e = content.lastIndexOf('}');
  if (s === -1 || e === -1) throw Object.assign(new Error('Não entendi a pergunta'), { status: 422 });
  try { return JSON.parse(content.slice(s, e + 1)); }
  catch { throw Object.assign(new Error('Não entendi a pergunta'), { status: 422 }); }
}
