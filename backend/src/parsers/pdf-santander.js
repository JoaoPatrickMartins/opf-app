// Parser da fatura PDF do Santander (formato real).
// Recebe o TEXTO já extraído (via pdf-parse) e devolve transações estruturadas.
//
// Particularidades do layout real:
//   - Valores SEM "R$" (ex.: "33,50", "1.280,64").
//   - Linhas podem começar com ícone/marcador (")", "@", número) antes da data.
//   - Cabeçalho do cartão com número mascarado: "NOME - 5201 XXXX XXXX 4705".
//   - Seções: "Pagamento e Demais Créditos" (ignorar), "Parcelamentos", "Despesas".

const VALUE = String.raw`-?\d{1,3}(?:\.\d{3})*,\d{2}`;
// data ... descrição ... (parcela PP/TT)? ... valorR$ (valorUS$)?  no fim da linha
const LINE_RE = new RegExp(`(\\d{2}\\/\\d{2})\\s+(.+?)\\s+(?:(\\d{1,2}\\/\\d{1,2})\\s+)?(${VALUE})(?:\\s+(${VALUE}))?\\s*$`);
// cabeçalho de cartão: "NOME - 5201 XXXX XXXX 4705" (com @ opcional na frente)
const CARD_RE = /^@?\s*(.+?)\s*-\s*[\dX]{4}\s+[\dX]{4}\s+[\dX]{4}\s+(\d{4})\s*$/i;

function toNumber(brl) {
  return parseFloat(brl.replace(/\./g, '').replace(',', '.'));
}

function extractReferenceMonth(text) {
  // "compras realizadas/realizados até DD/MM"
  const upto = text.match(/realizad[oa]s?\s+at[ée]\s+(\d{2})\/(\d{2})/i);
  // "Vencimento ... DD/MM/AAAA"
  const venc = text.match(/vencimento[^\d]{0,12}(\d{2})\/(\d{2})\/(\d{4})/i);
  const year = (text.match(/\b(20\d{2})\b/) || [])[1] || (venc && venc[3]);
  if (upto && year) return `${year}-${upto[2]}`;
  if (venc) return `${venc[3]}-${venc[2]}`;
  return null;
}

export function parseSantanderPdf(text, options = {}) {
  const { ignoreAnuidade = false } = options; // anuidade entra como despesa
  const referenceMonth = extractReferenceMonth(text);
  const refYear = referenceMonth ? referenceMonth.slice(0, 4) : String(new Date().getFullYear());

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const transactions = [];

  let inDetail = false;
  let skipSection = false; // dentro de "Pagamento e Demais Créditos"
  let currentCard = null;
  let currentHolder = null;

  for (const line of lines) {
    const low = line.toLowerCase();

    if (low.includes('detalhamento da fatura')) { inDetail = true; continue; }
    if (!inDetail) continue;

    // fim do detalhamento
    if (low.startsWith('resumo da fatura') || low.startsWith('saldo total consolidado') || low.includes('programa aadvantage')) {
      inDetail = false; continue;
    }

    // cabeçalho de cartão (precisa vir antes da checagem de transação)
    const header = line.match(CARD_RE);
    if (header && !LINE_RE.test(line)) {
      currentHolder = header[1].replace(/^@\s*/, '').trim();
      currentCard = header[2];
      skipSection = false;
      continue;
    }

    // controle de seções
    if (low.startsWith('pagamento e demais')) { skipSection = true; continue; }
    if (low.startsWith('parcelamentos') || low.startsWith('despesas')) { skipSection = false; continue; }
    if (low.startsWith('compra') && low.includes('descri')) continue; // cabeçalho da tabela
    if (low.startsWith('valor total')) continue;

    if (skipSection) continue;

    const m = line.match(LINE_RE);
    if (!m) continue;

    const [, dmDate, descRaw, parcela, valueRaw] = m;
    let desc = descRaw.trim();
    if (ignoreAnuidade && /anuidade diferenciada/i.test(desc)) continue;

    const amount = toNumber(valueRaw);
    if (!Number.isFinite(amount) || amount <= 0) continue; // pagamentos/créditos (negativos) ficam de fora

    const [dd, mm] = dmDate.split('/');
    transactions.push({
      fitid: null,
      memo: desc,
      description: desc,
      amount: -Math.abs(amount),          // será normalizado para magnitude no import
      type: 'expense',
      date: `${refYear}-${mm}-${dd}`,
      reference_month: referenceMonth,     // cartão: mês da fatura
      installment: parcela || null,
      card_last4: currentCard,
      holder: currentHolder,
      source: 'pdf'
    });
  }

  return { bank: 'Santander', format: 'pdf', referenceMonth, transactions };
}
