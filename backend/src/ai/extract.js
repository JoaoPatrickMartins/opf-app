// Extração por IA de faturas/PDFs (Santander e qualquer banco não mapeado).
// A IA lê o texto e lista TODAS as despesas; os valores são reconferidos como números no código.
import { getGroqKey } from '../routes/settings.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

function extractJsonArray(content) {
  const s = content.indexOf('[');
  const e = content.lastIndexOf(']');
  if (s === -1 || e === -1) return [];
  try { return JSON.parse(content.slice(s, e + 1)); } catch { return []; }
}

// Mantém só a parte relevante (do "Detalhamento da Fatura" em diante) para não estourar o contexto
// nem cortar seções/cartões. Cai para o texto inteiro se o marcador não existir.
function relevantSection(text) {
  const idx = text.search(/detalhamento da fatura/i);
  const from = idx >= 0 ? text.slice(idx) : text;
  return from.slice(0, 24000);
}

export async function extractTransactionsFromText(text) {
  const apiKey = await getGroqKey();
  if (!apiKey) return { bank: 'PDF', format: 'pdf', referenceMonth: null, transactions: [] };

  const year = (text.match(/\b(20\d{2})\b/) || [])[1] || String(new Date().getFullYear());
  const body = relevantSection(text);

  const resp = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: [
            'Você extrai TODOS os lançamentos de compra de uma fatura de cartão em PT-BR.',
            'INCLUA todas as seções de TODOS os cartões do documento: tanto "Despesas" quanto "Parcelamentos".',
            'Há mais de um cartão (titular e adicionais — cada bloco começa com o nome e um número tipo "5201 XXXX XXXX 4705"). Capture os itens de TODOS os blocos.',
            'INCLUA também a linha de ANUIDADE (ex.: "ANUIDADE DIFERENCIADA") como uma despesa.',
            'NÃO inclua: "Pagamento de fatura"/pagamentos, créditos, estornos, valores negativos, linhas "VALOR TOTAL", "Resumo da Fatura", "Saldo", juros e IOF.',
            'Responda SOMENTE com JSON, sem texto extra. Não invente itens nem valores.'
          ].join(' ')
        },
        {
          role: 'user',
          content: `Para cada despesa, devolva no formato exato:
[{ "data": "DD/MM", "descricao": "...", "valor": 0.00, "parcela": "PP/TT ou null", "cartao": "4 últimos dígitos do bloco ou null" }]

"valor" é número decimal com ponto (ex.: 33.50, 109.16). "cartao" são os 4 últimos dígitos do cabeçalho do bloco onde o item aparece.

Texto da fatura:
${body}`
        }
      ]
    })
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw Object.assign(new Error(`Groq API ${resp.status}: ${detail.slice(0, 200)}`), { status: 502 });
  }
  const data = await resp.json();
  const arr = extractJsonArray(data?.choices?.[0]?.message?.content || '');

  const transactions = arr
    .map((r) => {
      const amount = Math.abs(Number(r.valor));
      const m = String(r.data || '').match(/(\d{1,2})\/(\d{1,2})/);
      if (!Number.isFinite(amount) || amount <= 0 || !m) return null;
      const dd = m[1].padStart(2, '0');
      const mm = m[2].padStart(2, '0');
      return {
        fitid: null,
        memo: r.descricao || '',
        description: r.descricao || '',
        amount: -amount,
        type: 'expense',
        date: `${year}-${mm}-${dd}`,
        reference_month: null,            // o import resolve pelo fechamento do cartão
        installment: r.parcela && /\d+\/\d+/.test(r.parcela) ? r.parcela : null,
        card_last4: r.cartao ? String(r.cartao).replace(/\D/g, '').slice(-4) : null,
        source: 'pdf-ai'
      };
    })
    .filter(Boolean);

  return { bank: 'PDF (extraído por IA)', format: 'pdf', referenceMonth: null, transactions };
}
