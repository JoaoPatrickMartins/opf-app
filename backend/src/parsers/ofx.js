// Parser de OFX (Nubank). OFX é SGML, não XML válido — usamos regex.
// Charset costuma ser Windows-1252 / USASCII; o buffer é decodificado em latin1 e re-normalizado.

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}>([^<\r\n]*)`, 'i'));
  return m ? m[1].trim() : null;
};

// '20260515120000[-3:BRT]' -> { date: '2026-05-15', month: '2026-05' }
function parseOfxDate(raw) {
  if (!raw) return null;
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return { date: `${m[1]}-${m[2]}-${m[3]}`, month: `${m[1]}-${m[2]}` };
}

function detectInstallment(memo) {
  const m = memo && memo.match(/parcela\s*(\d+)\s*\/\s*(\d+)/i);
  return m ? `${m[1]}/${m[2]}` : null;
}

export function parseOfx(buffer) {
  const text = Buffer.isBuffer(buffer) ? buffer.toString('latin1') : String(buffer);
  const blocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || [];
  const transactions = [];

  for (const block of blocks) {
    const trntype = (tag(block, 'TRNTYPE') || '').toUpperCase();
    const memo = tag(block, 'MEMO') || '';
    const fitid = tag(block, 'FITID');
    const trnamt = parseFloat(tag(block, 'TRNAMT') || '0');
    const dt = parseOfxDate(tag(block, 'DTPOSTED'));

    // Ignorar pagamentos de fatura recebidos
    if (trntype === 'CREDIT' && /pagamento recebido/i.test(memo)) continue;
    if (!dt) continue;

    const isExpense = trnamt < 0 || trntype === 'DEBIT';
    transactions.push({
      fitid: fitid || null,
      memo,
      description: memo,
      amount: trnamt,                        // já vem com sinal no OFX
      type: isExpense ? 'expense' : 'income',
      date: dt.date,
      reference_month: dt.month,             // OFX: mês da data da transação
      installment: detectInstallment(memo),
      source: 'ofx'
    });
  }

  return { bank: 'Nubank', format: 'ofx', transactions };
}
